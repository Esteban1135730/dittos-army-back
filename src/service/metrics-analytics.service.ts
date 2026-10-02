import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { STOCK_TAG_VALUES } from '../constants/stock-tags';
import { CardStockTagRepository } from '../repository/card-stock-tag.repository';
import { PvpRepository } from '../repository/pvp.repository';
import { SaleRepository, type SaleLean } from '../repository/sale.repository';
import { StockRepository } from '../repository/stock.repository';
import type { Stock } from '../schema/stock.schema';
import { getCurrentOwner } from '../owner/owner-context';
import { getCurrentTcg } from '../owner/tcg-context';
import { TtlCache } from '../utils/ttl-cache';
import {
  effectiveOperationalRarezaFromStock,
  groupPvpsByCardId,
  resolvePvpForLine,
} from '../utils/pvp-resolve';
import { stockLineCostCop } from '../utils/stock-line-cost-cop';
import { effectiveSaleCostCop } from '../utils/sale-cost-snapshot';
import {
  resolveStockReceivedAt,
  type ReceivedAtSource,
} from '../utils/stock-received-at';
import type { MetricsAnalyticsResponse } from './metrics-analytics.types';

const ANALYTICS_CACHE_TTL_MS = 120_000;
const ANALYTICS_CACHE_MAX = 100;

export const DEAD_STOCK_MIN_COST_COP = 20000;
export const DEAD_STOCK_MIN_DAYS = 90;
/** Replantear: revisión a partir de 45 días (no vintage). */
export const RECONSIDER_DAYS_REVIEW = 45;
/** Replantear: vigilancia a partir de 30 días (no vintage). */
export const RECONSIDER_DAYS_WATCH = 30;
/** Vintage rota lento: hasta ~1 año sin alerta por baja rotación. */
export const VINTAGE_DAYS_WATCH = 365;
export const VINTAGE_DAYS_REVIEW = 365;
export const VINTAGE_DAYS_CRITICAL = 365;
export const RECONSIDER_MIN_COST_COP = 5000;
export const RECONSIDER_HIGH_COST_COP = 20000;
/** Margen PVP potencial por debajo de esto → señal. */
export const RECONSIDER_LOW_MARGIN_PCT = 15;
export const RECONSIDER_LIST_CAP = 80;
/** Mínimo de ventas del tipo para hablar de “rotación” (junto al %). */
export const TYPE_SELLS_WELL_MIN_UNITS = 2;
/** Unidad lenta vs tipo: máximo entre 2× mediana y mediana + este margen (días). */
export const TYPE_OUTLIER_EXTRA_DAYS = 30;
/**
 * Vendidas / (vendidas + estancadas del mismo card_id) ≥ esto → tipo con buena rotación.
 * Evita alertar la unidad restante cuando el grueso ya salió.
 */
export const TYPE_SELL_THROUGH_GOOD_PCT = 66;
/**
 * Estancadas / pool ≥ esto y ≥2 unidades en stock → tipo con mucho stock parado
 * (aunque haya habido ventas).
 */
export const TYPE_STUCK_HEAVY_PCT = 50;
export const TYPE_STUCK_HEAVY_MIN_REMAINING = 2;

const REASON_LABELS: Record<string, string> = {
  mucho_tiempo_90d: 'Mucho tiempo en stock',
  tiempo_45d: 'Varias semanas en stock',
  tiempo_30d: 'Más de un mes en stock',
  sin_fecha_ingreso: 'Sin fecha de ingreso clara',
  capital_alto: 'Alto capital inmovilizado',
  capital_medio: 'Capital relevante inmovilizado',
  sin_ventas_periodo: 'Sin ventas de esta carta en el periodo',
  pvp_bajo_costo: 'PVP por debajo del costo (pérdida si vende)',
  margen_pvp_bajo: 'Margen potencial PVP bajo (<15%)',
  sin_pvp: 'Sin PVP asignado',
  vintage_lento: 'Vintage (rotación esperada más lenta)',
  unidad_lenta_vs_tipo:
    'Esta unidad va más lenta que otras del mismo tipo que sí se vendieron',
  tipo_se_vende_bien: 'El tipo sí se vende (no es falta de demanda)',
  alta_rotacion_tipo: 'Alta % vendidas vs stock restante del mismo tipo',
  mucho_stock_estancado:
    'Alto % del tipo sigue en stock (vendió poco relativo a lo estancado)',
};

function pvpToCop(pvp: number, currency: string): number {
  if (currency === 'COP') return Math.round(pvp);
  if (currency === 'EUR') {
    const rate = parseFloat(process.env.EUR_TO_COP || '0') || 5000;
    return Math.round(pvp * rate);
  }
  if (currency === 'USD') {
    const rate = parseFloat(process.env.USD_TO_COP || '0') || 4500;
    return Math.round(pvp * rate);
  }
  return Math.round(pvp);
}

function priorityRank(p: 'alta' | 'media' | 'baja'): number {
  if (p === 'alta') return 0;
  if (p === 'media') return 1;
  return 2;
}

const TAG_LABELS: Record<string, string> = {
  vintage: 'Vintage',
  bulk: 'Bulk',
  jugable: 'Jugable',
  brillo: 'Brillo',
  sin_etiqueta: 'Sin etiqueta',
};

const SELLABLE_STATES = new Set([
  'disponible',
  'en_stock_colombia',
  'en_stock',
]);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD in UTC. */
export function formatUtcDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function parseYmdToUtcStart(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) {
    throw new BadRequestException(
      `Fecha inválida "${ymd}". Use formato YYYY-MM-DD.`,
    );
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(y, mo - 1, day, 0, 0, 0, 0));
  if (
    d.getUTCFullYear() !== y ||
    d.getUTCMonth() !== mo - 1 ||
    d.getUTCDate() !== day
  ) {
    throw new BadRequestException(`Fecha inválida "${ymd}".`);
  }
  return d;
}

export function parseYmdToUtcEnd(ymd: string): Date {
  const start = parseYmdToUtcStart(ymd);
  return new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

/** Default: to = today UTC, from = same calendar day 3 months earlier. */
export function defaultMetricsPeriod(now = new Date()): {
  from: string;
  to: string;
} {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const from = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 3, to.getUTCDate()),
  );
  return { from: formatUtcDate(from), to: formatUtcDate(to) };
}

function stockDocId(stock: Stock & { _id?: { toString(): string } }): string {
  return stock._id?.toString?.() ?? '';
}

function isSellableState(state: string | undefined | null): boolean {
  return SELLABLE_STATES.has(String(state ?? '').toLowerCase());
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function roundCop(n: number): number {
  return Math.round(n);
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(STOCK_TAG_VALUES);
  const out: string[] = [];
  for (const t of raw) {
    const v = String(t ?? '')
      .trim()
      .toLowerCase();
    if (allowed.has(v) && !out.includes(v)) out.push(v);
  }
  return STOCK_TAG_VALUES.filter((v) => out.includes(v));
}

type SaleCost = {
  cost: number;
  fromSnapshot: boolean;
  profit: number;
  revenue: number;
  productKind: string;
  daysToSell: number | null;
  receptionSource: 'snapshot' | ReceivedAtSource;
  tags: string[];
  tagsFromSnapshot: boolean;
};

@Injectable()
export class MetricsAnalyticsService {
  constructor(
    private readonly saleRepository: SaleRepository,
    private readonly stockRepository: StockRepository,
    private readonly cardStockTagRepository: CardStockTagRepository,
    private readonly pvpRepository: PvpRepository,
  ) {}

  /** Caché por owner + TCG + periodo resuelto (el cálculo recorre todo el stock). */
  private readonly analyticsCache = new TtlCache<MetricsAnalyticsResponse>({
    ttlMs: ANALYTICS_CACHE_TTL_MS,
    maxEntries: ANALYTICS_CACHE_MAX,
  });

  /** Vacía la caché de todos los owners/TCG/periodos (hay escrituras que cruzan owners). */
  invalidateCache(): void {
    this.analyticsCache.clear();
  }

  async getAnalytics(query: {
    from?: string;
    to?: string;
  }): Promise<MetricsAnalyticsResponse> {
    try {
      const defaults = defaultMetricsPeriod();
      const fromStr = query.from?.trim() || defaults.from;
      const toStr = query.to?.trim() || defaults.to;
      const fromDate = parseYmdToUtcStart(fromStr);
      const toDate = parseYmdToUtcEnd(toStr);
      if (fromDate.getTime() > toDate.getTime()) {
        throw new BadRequestException('`from` no puede ser posterior a `to`.');
      }

      const key = `${getCurrentOwner()}:${getCurrentTcg()}:${fromStr}:${toStr}`;
      return await this.analyticsCache.getOrLoad(key, () =>
        this.computeAnalytics(fromStr, toStr, fromDate, toDate),
      );
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const message =
        err instanceof Error ? err.message : 'Error al calcular métricas';
      throw new InternalServerErrorException({ message });
    }
  }

  private async computeAnalytics(
    fromStr: string,
    toStr: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<MetricsAnalyticsResponse> {
    const [sales, allStock] = await Promise.all([
      this.saleRepository.findVentasInPeriodLean(fromDate, toDate),
      this.stockRepository.findAllLean(),
    ]);

    const stockById = new Map<string, Stock>();
    for (const s of allStock) {
      const id = stockDocId(s as Stock & { _id?: { toString(): string } });
      if (id) stockById.set(id, s);
    }

    const cardIds = [
      ...new Set(
        sales.map((s) => String(s.card_id ?? '').trim()).filter(Boolean),
      ),
    ];
    const sellableCardIds = [
      ...new Set(
        allStock
          .filter((s) =>
            isSellableState(String(s.card_state ?? '').toLowerCase()),
          )
          .map((s) => String(s.card_id ?? '').trim())
          .filter(Boolean),
      ),
    ];
    const [tagsByCard, pvps] = await Promise.all([
      this.cardStockTagRepository.findMapByCardIds([
        ...new Set([...cardIds, ...sellableCardIds]),
      ]),
      this.pvpRepository.findByCardIds(sellableCardIds),
    ]);
    const pvpByCard = groupPvpsByCardId(pvps);

    return this.buildResponse(
      fromStr,
      toStr,
      sales,
      stockById,
      allStock,
      tagsByCard,
      pvpByCard,
    );
  }

  private resolveSaleCost(
    sale: SaleLean,
    stockById: Map<string, Stock>,
    tagsByCard: Map<string, string[]>,
  ): SaleCost {
    const revenue = roundCop(sale.amount_cop ?? 0);
    const snap = (sale as SaleLean & { cost_cop_snapshot?: number })
      .cost_cop_snapshot;
    let cost: number;
    let fromSnapshot: boolean;
    if (snap != null && Number.isFinite(snap)) {
      cost = roundCop(snap);
      fromSnapshot = true;
    } else {
      const stock = stockById.get(sale.stock_id);
      cost = stock ? stockLineCostCop(stock) : 0;
      fromSnapshot = false;
    }
    cost = effectiveSaleCostCop(sale.card_id, revenue, cost);

    const stock = stockById.get(sale.stock_id);
    const kindSnap = (sale as SaleLean & { product_kind_snapshot?: string })
      .product_kind_snapshot;
    const productKind =
      (kindSnap && String(kindSnap).trim()) ||
      (stock?.product_kind && String(stock.product_kind).trim()) ||
      'unknown';

    const soldAt = sale.created_at ? new Date(sale.created_at) : null;
    const receivedSnap = (
      sale as SaleLean & { received_at_snapshot?: Date }
    ).received_at_snapshot;

    let receivedAt: Date | null = null;
    let receptionSource: SaleCost['receptionSource'] = 'missing';
    if (receivedSnap) {
      const d = new Date(receivedSnap);
      if (!Number.isNaN(d.getTime())) {
        receivedAt = d;
        receptionSource = 'snapshot';
      }
    }
    if (!receivedAt && stock) {
      const resolved = resolveStockReceivedAt(
        stock as Stock & { _id?: unknown; stocked_at?: Date },
      );
      receivedAt = resolved.date;
      receptionSource = resolved.source;
    }

    let daysToSell: number | null = null;
    if (receivedAt && soldAt) {
      const ms = soldAt.getTime() - receivedAt.getTime();
      daysToSell = Math.max(0, ms / (1000 * 60 * 60 * 24));
    }

    const tagSnap = normalizeTags(
      (sale as SaleLean & { tags_snapshot?: string[] }).tags_snapshot,
    );
    let tags = tagSnap;
    const tagsFromSnapshot = tagSnap.length > 0;
    if (!tagsFromSnapshot) {
      tags = normalizeTags(tagsByCard.get(String(sale.card_id ?? '').trim()));
    }

    return {
      cost,
      fromSnapshot,
      profit: revenue - cost,
      revenue,
      productKind,
      daysToSell,
      receptionSource,
      tags,
      tagsFromSnapshot,
    };
  }

  private buildResponse(
    fromStr: string,
    toStr: string,
    sales: SaleLean[],
    stockById: Map<string, Stock>,
    allStock: Stock[],
    tagsByCard: Map<string, string[]>,
    pvpByCard: Map<string, import('../utils/pvp-resolve').PvpLike[]>,
  ): MetricsAnalyticsResponse {
    let revenue_cop = 0;
    let cost_cop = 0;
    let with_snapshot = 0;
    let with_fallback = 0;
    let with_sale_created_at = 0;
    let reception_from_snapshot = 0;
    let reception_from_stocked_at = 0;
    let reception_from_objectid = 0;
    let reception_missing = 0;
    let tags_from_snapshot = 0;
    let tags_from_card_map = 0;

    type CardAgg = {
      card_id: string;
      card_name: string | null;
      image_url: string | null;
      units: number;
      revenue_cop: number;
      cost_cop: number;
      profit_cop: number;
    };
    const imageByCardId = new Map<string, string>();
    for (const stock of allStock) {
      const cid = String(stock.card_id ?? '').trim();
      const img = String(stock.image_url ?? '').trim();
      if (cid && img && !imageByCardId.has(cid)) {
        imageByCardId.set(cid, img);
      }
    }
    const byCard = new Map<string, CardAgg>();
    const byDay = new Map<
      string,
      { units: number; revenue_cop: number; profit_cop: number }
    >();
    const byCycle = new Map<
      string,
      {
        cycle_key: string;
        cycle_closed_at: string | null;
        units: number;
        revenue_cop: number;
        profit_cop: number;
      }
    >();
    const velocityDays = new Map<
      string,
      { days: number[]; missingStockedAt: number; samples: number }
    >();
    type TagAgg = {
      units: number;
      revenue_cop: number;
      profit_cop: number;
      days: number[];
      approximateSamples: number;
    };
    const byTag = new Map<string, TagAgg>();
    const ensureTag = (tag: string): TagAgg => {
      const cur = byTag.get(tag) ?? {
        units: 0,
        revenue_cop: 0,
        profit_cop: 0,
        days: [],
        approximateSamples: 0,
      };
      byTag.set(tag, cur);
      return cur;
    };
    for (const t of STOCK_TAG_VALUES) ensureTag(t);
    ensureTag('sin_etiqueta');

    for (const sale of sales) {
      const resolved = this.resolveSaleCost(sale, stockById, tagsByCard);
      revenue_cop += resolved.revenue;
      cost_cop += resolved.cost;
      if (resolved.fromSnapshot) with_snapshot += 1;
      else with_fallback += 1;

      if (sale.created_at) with_sale_created_at += 1;
      if (resolved.receptionSource === 'snapshot') reception_from_snapshot += 1;
      else if (resolved.receptionSource === 'stocked_at')
        reception_from_stocked_at += 1;
      else if (resolved.receptionSource === 'objectid')
        reception_from_objectid += 1;
      else reception_missing += 1;

      if (resolved.tagsFromSnapshot) tags_from_snapshot += 1;
      else tags_from_card_map += 1;

      const stock = stockById.get(sale.stock_id);
      const cardName =
        stock?.card_name && String(stock.card_name).trim()
          ? String(stock.card_name)
          : null;
      const stockImg = String(stock?.image_url ?? '').trim();
      const cardKey = sale.card_id || 'unknown';
      if (stockImg && !imageByCardId.has(cardKey)) {
        imageByCardId.set(cardKey, stockImg);
      }
      const imageUrl = stockImg || imageByCardId.get(cardKey) || null;
      const card = byCard.get(cardKey) ?? {
        card_id: cardKey,
        card_name: cardName,
        image_url: imageUrl,
        units: 0,
        revenue_cop: 0,
        cost_cop: 0,
        profit_cop: 0,
      };
      if (!card.card_name && cardName) card.card_name = cardName;
      if (!card.image_url && imageUrl) card.image_url = imageUrl;
      card.units += 1;
      card.revenue_cop += resolved.revenue;
      card.cost_cop += resolved.cost;
      card.profit_cop += resolved.profit;
      byCard.set(cardKey, card);

      const dayKey = sale.created_at
        ? formatUtcDate(new Date(sale.created_at))
        : fromStr;
      const day = byDay.get(dayKey) ?? {
        units: 0,
        revenue_cop: 0,
        profit_cop: 0,
      };
      day.units += 1;
      day.revenue_cop += resolved.revenue;
      day.profit_cop += resolved.profit;
      byDay.set(dayKey, day);

      const closed = (sale as SaleLean & { cycle_closed_at?: Date })
        .cycle_closed_at;
      const cycleKey = closed ? new Date(closed).toISOString() : 'active';
      const cycle = byCycle.get(cycleKey) ?? {
        cycle_key: cycleKey,
        cycle_closed_at: closed ? new Date(closed).toISOString() : null,
        units: 0,
        revenue_cop: 0,
        profit_cop: 0,
      };
      cycle.units += 1;
      cycle.revenue_cop += resolved.revenue;
      cycle.profit_cop += resolved.profit;
      byCycle.set(cycleKey, cycle);

      const kind = resolved.productKind || 'unknown';
      const vel = velocityDays.get(kind) ?? {
        days: [],
        missingStockedAt: 0,
        samples: 0,
      };
      vel.samples += 1;
      if (resolved.daysToSell != null) {
        vel.days.push(resolved.daysToSell);
      }
      if (
        resolved.receptionSource === 'missing' ||
        resolved.receptionSource === 'objectid'
      ) {
        vel.missingStockedAt += 1;
      }
      velocityDays.set(kind, vel);

      const tagKeys =
        resolved.tags.length > 0 ? resolved.tags : (['sin_etiqueta'] as const);
      const approxReception =
        resolved.receptionSource === 'missing' ||
        resolved.receptionSource === 'objectid' ||
        !resolved.tagsFromSnapshot;
      for (const tag of tagKeys) {
        const agg = ensureTag(tag);
        agg.units += 1;
        agg.revenue_cop += resolved.revenue;
        agg.profit_cop += resolved.profit;
        if (resolved.daysToSell != null) agg.days.push(resolved.daysToSell);
        if (approxReception) agg.approximateSamples += 1;
      }
    }

    const units_sold = sales.length;
    const tickets_count = sales.length;
    const gross_profit_cop = revenue_cop - cost_cop;
    const gross_margin_pct =
      revenue_cop === 0
        ? null
        : Math.round((gross_profit_cop / revenue_cop) * 10000) / 100;
    const aov_cop =
      tickets_count === 0 ? null : roundCop(revenue_cop / tickets_count);

    const cardRows = [...byCard.values()];
    const top_sellers_by_units = [...cardRows]
      .sort((a, b) => b.units - a.units || b.revenue_cop - a.revenue_cop)
      .slice(0, 20)
      .map(({ card_id, card_name, image_url, units, revenue_cop: rev }) => ({
        card_id,
        card_name,
        image_url: image_url || imageByCardId.get(card_id) || null,
        units,
        revenue_cop: roundCop(rev),
      }));
    const top_sellers_by_revenue = [...cardRows]
      .sort((a, b) => b.revenue_cop - a.revenue_cop || b.units - a.units)
      .slice(0, 20)
      .map(({ card_id, card_name, image_url, units, revenue_cop: rev }) => ({
        card_id,
        card_name,
        image_url: image_url || imageByCardId.get(card_id) || null,
        units,
        revenue_cop: roundCop(rev),
      }));
    const profitRows = cardRows.map((c) => ({
      card_id: c.card_id,
      card_name: c.card_name,
      image_url: c.image_url || imageByCardId.get(c.card_id) || null,
      units: c.units,
      revenue_cop: roundCop(c.revenue_cop),
      cost_cop: roundCop(c.cost_cop),
      profit_cop: roundCop(c.profit_cop),
    }));
    const top_profit = [...profitRows]
      .sort((a, b) => b.profit_cop - a.profit_cop)
      .slice(0, 20);
    const top_loss_sales = [...profitRows]
      .sort((a, b) => a.profit_cop - b.profit_cop)
      .slice(0, 20);

    const velocity_by_product_kind = [...velocityDays.entries()].map(
      ([product_kind, v]) => {
        const avgDays = avg(v.days);
        const medDays = median(v.days);
        return {
          product_kind,
          samples: v.samples,
          avg_days_to_sell:
            avgDays == null ? null : Math.round(avgDays * 100) / 100,
          median_days_to_sell:
            medDays == null ? null : Math.round(medDays * 100) / 100,
          approximate: v.missingStockedAt > 0 || v.days.length < v.samples,
        };
      },
    );
    const withAvg = velocity_by_product_kind.filter(
      (v) => v.samples >= 1 && v.avg_days_to_sell != null,
    );
    const fastest_kinds = [...withAvg]
      .sort(
        (a, b) =>
          (a.avg_days_to_sell ?? Infinity) - (b.avg_days_to_sell ?? Infinity),
      )
      .slice(0, 10);
    const slowest_kinds = [...withAvg]
      .sort(
        (a, b) =>
          (b.avg_days_to_sell ?? -Infinity) - (a.avg_days_to_sell ?? -Infinity),
      )
      .slice(0, 10);

    const sales_by_day = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({
        date,
        units: row.units,
        revenue_cop: roundCop(row.revenue_cop),
        profit_cop: roundCop(row.profit_cop),
      }));

    const sales_by_cycle = [...byCycle.values()].sort((a, b) => {
      if (a.cycle_key === 'active') return -1;
      if (b.cycle_key === 'active') return 1;
      return (b.cycle_closed_at ?? '').localeCompare(a.cycle_closed_at ?? '');
    });

    const tagOrder = [...STOCK_TAG_VALUES, 'sin_etiqueta'];
    const sales_by_tag = tagOrder.map((tag) => {
      const row = byTag.get(tag) ?? {
        units: 0,
        revenue_cop: 0,
        profit_cop: 0,
        days: [],
        approximateSamples: 0,
      };
      const avgDays = avg(row.days);
      return {
        tag,
        label: TAG_LABELS[tag] ?? tag,
        units: row.units,
        revenue_cop: roundCop(row.revenue_cop),
        profit_cop: roundCop(row.profit_cop),
        avg_days_to_sell:
          avgDays == null ? null : Math.round(avgDays * 100) / 100,
        approximate: row.units > 0 && row.approximateSamples > 0,
      };
    });

    const fromMs = parseYmdToUtcStart(fromStr).getTime();
    const toMs = parseYmdToUtcEnd(toStr).getTime();
    const lossItems: MetricsAnalyticsResponse['inventory_losses']['items'] = [];
    for (const stock of allStock) {
      const state = String(stock.card_state ?? '').toLowerCase();
      if (state !== 'perdida') continue;
      const lostAt = stock.lost_at ? new Date(stock.lost_at) : null;
      if (lostAt) {
        const t = lostAt.getTime();
        if (t < fromMs || t > toMs) continue;
      }
      const id = stockDocId(stock as Stock & { _id?: { toString(): string } });
      const cost =
        stock.lost_cost_cop != null && Number.isFinite(stock.lost_cost_cop)
          ? roundCop(stock.lost_cost_cop)
          : stockLineCostCop(stock);
      lossItems.push({
        stock_id: id,
        card_id: stock.card_id,
        card_name: stock.card_name?.trim() ? stock.card_name : null,
        cost_cop: cost,
        lost_at: lostAt ? lostAt.toISOString() : null,
      });
    }
    lossItems.sort((a, b) => {
      const ta = a.lost_at ?? '';
      const tb = b.lost_at ?? '';
      return tb.localeCompare(ta) || b.stock_id.localeCompare(a.stock_id);
    });
    const lossCap = lossItems.slice(0, 50);
    const inventory_losses = {
      lines_count: lossItems.length,
      cost_cop: roundCop(lossItems.reduce((s, i) => s + i.cost_cop, 0)),
      items: lossCap,
    };

    const now = new Date();
    const salesUnitsByCard = new Map<string, number>();
    const sellDaysByCard = new Map<string, number[]>();
    for (const sale of sales) {
      const cid = String(sale.card_id ?? '').trim();
      if (!cid) continue;
      salesUnitsByCard.set(cid, (salesUnitsByCard.get(cid) ?? 0) + 1);

      const soldAt = sale.created_at ? new Date(sale.created_at) : null;
      const receivedSnap = (
        sale as SaleLean & { received_at_snapshot?: Date }
      ).received_at_snapshot;
      let receivedAt: Date | null = null;
      if (receivedSnap) {
        const d = new Date(receivedSnap);
        if (!Number.isNaN(d.getTime())) receivedAt = d;
      }
      if (!receivedAt) {
        const st = stockById.get(sale.stock_id);
        if (st) {
          receivedAt = resolveStockReceivedAt(
            st as Stock & { _id?: unknown; stocked_at?: Date },
          ).date;
        }
      }
      if (receivedAt && soldAt) {
        const days = Math.max(
          0,
          (soldAt.getTime() - receivedAt.getTime()) / (1000 * 60 * 60 * 24),
        );
        const arr = sellDaysByCard.get(cid) ?? [];
        arr.push(days);
        sellDaysByCard.set(cid, arr);
      }
    }
    const typeMedianDays = new Map<string, number | null>();
    for (const [cid, days] of sellDaysByCard.entries()) {
      typeMedianDays.set(cid, median(days));
    }

    /** Unidades aún vendibles por card_id (pool estancado actual). */
    const remainingUnitsByCard = new Map<string, number>();
    for (const stock of allStock) {
      const state = String(stock.card_state ?? '').toLowerCase();
      if (!isSellableState(state)) continue;
      const cid = String(stock.card_id ?? '').trim();
      if (!cid) continue;
      const qty =
        stock.product_kind === 'quantity' && typeof stock.quantity === 'number'
          ? Math.max(0, stock.quantity)
          : 1;
      remainingUnitsByCard.set(cid, (remainingUnitsByCard.get(cid) ?? 0) + qty);
    }

    type ReconsiderLine = {
      stock_id: string;
      card_id: string;
      card_name: string | null;
      image_url: string | null;
      cost_cop: number;
      stocked_at: string | null;
      days_in_stock: number | null;
      priority: 'alta' | 'media' | 'baja';
      reason_codes: string[];
      pvp_cop: number | null;
      potential_margin_cop: number | null;
      potential_margin_pct: number | null;
      sales_in_period: number;
      is_vintage: boolean;
      type_median_days_to_sell: number | null;
      type_remaining_units: number;
      type_sell_through_pct: number | null;
      type_stuck_pct: number | null;
    };
    const reconsiderLines: ReconsiderLine[] = [];
    let sellable_stock_units_now = 0;

    for (const stock of allStock) {
      const state = String(stock.card_state ?? '').toLowerCase();
      if (!isSellableState(state)) continue;

      const cost = stockLineCostCop(stock);
      const qty =
        stock.product_kind === 'quantity' && typeof stock.quantity === 'number'
          ? Math.max(0, stock.quantity)
          : 1;
      if (stock.product_kind === 'quantity') {
        sellable_stock_units_now += qty;
      } else {
        sellable_stock_units_now += 1;
      }

      const received = resolveStockReceivedAt(
        stock as Stock & { _id?: unknown; stocked_at?: Date },
      );
      const stockedAt = received.date;
      const daysInStock = stockedAt
        ? Math.max(
            0,
            (now.getTime() - stockedAt.getTime()) / (1000 * 60 * 60 * 24),
          )
        : null;
      const daysRounded =
        daysInStock == null ? null : Math.round(daysInStock * 10) / 10;
      const cardId = String(stock.card_id ?? '').trim();
      const salesInPeriod = salesUnitsByCard.get(cardId) ?? 0;
      const remainingOfType = remainingUnitsByCard.get(cardId) ?? 0;
      const typePool = salesInPeriod + remainingOfType;
      const typeSellThroughPct =
        typePool > 0
          ? Math.round((salesInPeriod / typePool) * 10000) / 100
          : null;
      const typeStuckPct =
        typePool > 0
          ? Math.round((remainingOfType / typePool) * 10000) / 100
          : null;
      const medianTypeDays = typeMedianDays.get(cardId) ?? null;
      const typeMedianRounded =
        medianTypeDays == null ? null : Math.round(medianTypeDays * 100) / 100;
      const cardTags = normalizeTags(tagsByCard.get(cardId));
      const isVintage = cardTags.includes('vintage');

      const typeStuckHeavy =
        typePool >= 2 &&
        remainingOfType >= TYPE_STUCK_HEAVY_MIN_REMAINING &&
        (typeStuckPct ?? 0) >= TYPE_STUCK_HEAVY_PCT;
      /** Buena rotación: volumen vendido + % vendidas alto (no solo “hubo ventas”). */
      const typeRotatesWell =
        !typeStuckHeavy &&
        salesInPeriod >= TYPE_SELLS_WELL_MIN_UNITS &&
        (typeSellThroughPct ?? 0) >= TYPE_SELL_THROUGH_GOOD_PCT;
      const typeSellsWell = typeRotatesWell;

      const daysWatch = isVintage ? VINTAGE_DAYS_WATCH : RECONSIDER_DAYS_WATCH;
      const daysReview = isVintage
        ? VINTAGE_DAYS_REVIEW
        : RECONSIDER_DAYS_REVIEW;
      const daysCritical = isVintage
        ? VINTAGE_DAYS_CRITICAL
        : DEAD_STOCK_MIN_DAYS;

      const rareza = effectiveOperationalRarezaFromStock(stock);
      const resolvedPvp = resolvePvpForLine(
        pvpByCard.get(cardId) ?? [],
        rareza,
      );
      const pvpCop = resolvedPvp
        ? pvpToCop(resolvedPvp.pvp, resolvedPvp.pvp_currency ?? 'COP')
        : null;
      const potentialMargin = pvpCop != null ? roundCop(pvpCop - cost) : null;
      const potentialMarginPct =
        pvpCop != null && pvpCop > 0 && potentialMargin != null
          ? Math.round((potentialMargin / pvpCop) * 10000) / 100
          : null;

      const reasonCodes: string[] = [];
      if (isVintage) reasonCodes.push('vintage_lento');
      if (typeRotatesWell) reasonCodes.push('alta_rotacion_tipo');

      let unitSlowerThanType = false;
      if (daysInStock != null && salesInPeriod > 0 && medianTypeDays != null) {
        const outlierThreshold = Math.max(
          medianTypeDays * 2,
          medianTypeDays + TYPE_OUTLIER_EXTRA_DAYS,
        );
        if (daysInStock > outlierThreshold) {
          unitSlowerThanType = true;
          reasonCodes.push('unidad_lenta_vs_tipo');
          if (!reasonCodes.includes('tipo_se_vende_bien')) {
            reasonCodes.push('tipo_se_vende_bien');
          }
        }
      } else if (typeRotatesWell && daysInStock != null) {
        if (!reasonCodes.includes('tipo_se_vende_bien')) {
          reasonCodes.push('tipo_se_vende_bien');
        }
      }

      if (daysInStock == null) {
        if (!typeRotatesWell) reasonCodes.push('sin_fecha_ingreso');
      } else if (typeRotatesWell) {
        if (unitSlowerThanType) {
          // ya marcado
        } else if (daysInStock >= daysCritical * 1.5) {
          reasonCodes.push('mucho_tiempo_90d');
        }
      } else if (typeStuckHeavy || salesInPeriod === 0) {
        if (daysInStock >= daysCritical) {
          reasonCodes.push('mucho_tiempo_90d');
        } else if (daysInStock >= daysReview) {
          reasonCodes.push('tiempo_45d');
        } else if (daysInStock >= daysWatch) {
          reasonCodes.push('tiempo_30d');
        }
      } else if (salesInPeriod > 0) {
        // Vendió algo pero rotación no es “buena”: solo tiempo extremo o outlier
        if (unitSlowerThanType) {
          // ya marcado
        } else if (daysInStock >= daysCritical) {
          reasonCodes.push('mucho_tiempo_90d');
        }
      }

      // % estancado alto solo cuenta si ya hay antigüedad o capital (no día 1)
      const agedEnoughForStuckSignal =
        daysInStock == null ||
        daysInStock >= daysWatch ||
        cost >= RECONSIDER_HIGH_COST_COP;
      if (typeStuckHeavy && agedEnoughForStuckSignal) {
        reasonCodes.push('mucho_stock_estancado');
      }

      if (cost >= RECONSIDER_HIGH_COST_COP) {
        reasonCodes.push('capital_alto');
      } else if (cost >= RECONSIDER_MIN_COST_COP && !typeRotatesWell) {
        reasonCodes.push('capital_medio');
      }

      const agedForNoSales =
        daysInStock == null ||
        daysInStock >= (isVintage ? daysReview : daysWatch) ||
        (!isVintage && cost >= RECONSIDER_HIGH_COST_COP);
      if (salesInPeriod === 0 && agedForNoSales) {
        reasonCodes.push('sin_ventas_periodo');
      }

      if (pvpCop == null) {
        const sinPvpTrigger = isVintage
          ? cost >= RECONSIDER_HIGH_COST_COP ||
            (daysInStock != null && daysInStock >= daysReview)
          : cost >= RECONSIDER_MIN_COST_COP ||
            (daysInStock != null && daysInStock >= daysReview);
        if (sinPvpTrigger && !typeRotatesWell) {
          reasonCodes.push('sin_pvp');
        }
      } else if (potentialMargin != null && potentialMargin < 0) {
        reasonCodes.push('pvp_bajo_costo');
      } else if (
        potentialMarginPct != null &&
        potentialMarginPct < RECONSIDER_LOW_MARGIN_PCT &&
        (!isVintage ||
          daysInStock == null ||
          daysInStock >= daysReview ||
          cost >= RECONSIDER_HIGH_COST_COP)
      ) {
        reasonCodes.push('margen_pvp_bajo');
      }

      const contextCodes = new Set([
        'vintage_lento',
        'tipo_se_vende_bien',
        'alta_rotacion_tipo',
      ]);
      const signalCodes = reasonCodes.filter((c) => !contextCodes.has(c));

      // Alta rotación del tipo y esta unidad no es outlier ni precio malo → omitir
      if (
        typeRotatesWell &&
        !unitSlowerThanType &&
        !signalCodes.includes('pvp_bajo_costo') &&
        !signalCodes.includes('margen_pvp_bajo') &&
        !signalCodes.includes('mucho_tiempo_90d')
      ) {
        continue;
      }

      if (
        isVintage &&
        !signalCodes.includes('pvp_bajo_costo') &&
        (daysInStock == null || daysInStock < VINTAGE_DAYS_CRITICAL)
      ) {
        continue;
      }

      const actionable =
        signalCodes.includes('mucho_tiempo_90d') ||
        signalCodes.includes('pvp_bajo_costo') ||
        signalCodes.includes('sin_ventas_periodo') ||
        signalCodes.includes('margen_pvp_bajo') ||
        signalCodes.includes('sin_pvp') ||
        signalCodes.includes('unidad_lenta_vs_tipo') ||
        (signalCodes.includes('mucho_stock_estancado') &&
          (signalCodes.includes('tiempo_30d') ||
            signalCodes.includes('tiempo_45d') ||
            signalCodes.includes('mucho_tiempo_90d') ||
            signalCodes.includes('capital_alto') ||
            signalCodes.includes('capital_medio') ||
            signalCodes.includes('sin_fecha_ingreso'))) ||
        (signalCodes.includes('capital_alto') &&
          (signalCodes.includes('tiempo_45d') ||
            signalCodes.includes('tiempo_30d') ||
            signalCodes.includes('sin_fecha_ingreso') ||
            signalCodes.includes('unidad_lenta_vs_tipo') ||
            signalCodes.includes('mucho_stock_estancado'))) ||
        (signalCodes.includes('tiempo_45d') &&
          (signalCodes.includes('capital_medio') ||
            signalCodes.includes('capital_alto') ||
            signalCodes.includes('mucho_stock_estancado')));

      if (!actionable || signalCodes.length === 0) continue;

      let priority: 'alta' | 'media' | 'baja' = 'baja';
      if (
        signalCodes.includes('pvp_bajo_costo') ||
        (signalCodes.includes('mucho_tiempo_90d') &&
          signalCodes.includes('capital_alto')) ||
        (signalCodes.includes('sin_ventas_periodo') &&
          signalCodes.includes('mucho_tiempo_90d') &&
          !isVintage) ||
        (signalCodes.includes('sin_ventas_periodo') &&
          signalCodes.includes('capital_alto') &&
          !isVintage) ||
        (signalCodes.includes('mucho_stock_estancado') &&
          signalCodes.includes('mucho_tiempo_90d') &&
          !isVintage)
      ) {
        priority = 'alta';
      } else if (
        signalCodes.includes('tiempo_45d') ||
        signalCodes.includes('mucho_tiempo_90d') ||
        signalCodes.includes('unidad_lenta_vs_tipo') ||
        signalCodes.includes('mucho_stock_estancado') ||
        signalCodes.includes('capital_alto') ||
        signalCodes.includes('margen_pvp_bajo') ||
        signalCodes.includes('sin_pvp')
      ) {
        priority = 'media';
      }
      if (
        isVintage &&
        priority === 'alta' &&
        !signalCodes.includes('pvp_bajo_costo')
      ) {
        priority = 'media';
      }
      if (
        typeRotatesWell &&
        priority === 'alta' &&
        !signalCodes.includes('pvp_bajo_costo')
      ) {
        priority = 'media';
      }

      const img = String(stock.image_url ?? '').trim();
      reconsiderLines.push({
        stock_id: stockDocId(stock as Stock & { _id?: { toString(): string } }),
        card_id: stock.card_id,
        card_name: stock.card_name?.trim() ? stock.card_name : null,
        image_url: img || null,
        cost_cop: roundCop(cost),
        stocked_at: stockedAt ? stockedAt.toISOString() : null,
        days_in_stock: daysRounded,
        priority,
        reason_codes: reasonCodes,
        pvp_cop: pvpCop,
        potential_margin_cop: potentialMargin,
        potential_margin_pct: potentialMarginPct,
        sales_in_period: salesInPeriod,
        is_vintage: isVintage,
        type_median_days_to_sell: typeMedianRounded,
        type_remaining_units: remainingOfType,
        type_sell_through_pct: typeSellThroughPct,
        type_stuck_pct: typeStuckPct,
      });
    }

    // Agrupar por carta: una fila por card_id
    type GroupAcc = {
      stock_id: string;
      card_id: string;
      card_name: string | null;
      image_url: string | null;
      stock_lines: number;
      cost_cop: number;
      stocked_at: string | null;
      days_in_stock: number | null;
      priority: 'alta' | 'media' | 'baja';
      reason_codes: Set<string>;
      pvp_cop: number | null;
      potential_margin_cop: number | null;
      potential_margin_pct: number | null;
      sales_in_period: number;
      is_vintage: boolean;
      type_median_days_to_sell: number | null;
      type_remaining_units: number;
      type_sell_through_pct: number | null;
      type_stuck_pct: number | null;
    };
    const byCardGroup = new Map<string, GroupAcc>();
    for (const line of reconsiderLines) {
      const key = String(line.card_id ?? '').trim() || line.stock_id;
      const cur = byCardGroup.get(key);
      if (!cur) {
        byCardGroup.set(key, {
          stock_id: line.stock_id,
          card_id: line.card_id,
          card_name: line.card_name,
          image_url: line.image_url,
          stock_lines: 1,
          cost_cop: line.cost_cop,
          stocked_at: line.stocked_at,
          days_in_stock: line.days_in_stock,
          priority: line.priority,
          reason_codes: new Set(line.reason_codes),
          pvp_cop: line.pvp_cop,
          potential_margin_cop: line.potential_margin_cop,
          potential_margin_pct: line.potential_margin_pct,
          sales_in_period: line.sales_in_period,
          is_vintage: line.is_vintage,
          type_median_days_to_sell: line.type_median_days_to_sell,
          type_remaining_units: line.type_remaining_units,
          type_sell_through_pct: line.type_sell_through_pct,
          type_stuck_pct: line.type_stuck_pct,
        });
        continue;
      }
      cur.stock_lines += 1;
      cur.cost_cop += line.cost_cop;
      if (!cur.image_url && line.image_url) cur.image_url = line.image_url;
      if (!cur.card_name && line.card_name) cur.card_name = line.card_name;
      if ((line.days_in_stock ?? -1) > (cur.days_in_stock ?? -1)) {
        cur.days_in_stock = line.days_in_stock;
        cur.stocked_at = line.stocked_at;
      }
      if (priorityRank(line.priority) < priorityRank(cur.priority)) {
        cur.priority = line.priority;
      }
      for (const c of line.reason_codes) cur.reason_codes.add(c);
      if (cur.pvp_cop == null && line.pvp_cop != null) {
        cur.pvp_cop = line.pvp_cop;
        cur.potential_margin_cop = line.potential_margin_cop;
        cur.potential_margin_pct = line.potential_margin_pct;
      }
      cur.is_vintage = cur.is_vintage || line.is_vintage;
      if (
        cur.type_median_days_to_sell == null &&
        line.type_median_days_to_sell != null
      ) {
        cur.type_median_days_to_sell = line.type_median_days_to_sell;
      }
      // Métricas de tipo son por card_id; se conservan del primer line
    }

    const reconsiderCandidates: MetricsAnalyticsResponse['dead_stock']['items'] =
      [...byCardGroup.values()].map((g) => {
        const codes = [...g.reason_codes];
        return {
          stock_id: g.stock_id,
          card_id: g.card_id,
          card_name: g.card_name,
          image_url: g.image_url,
          stock_lines: g.stock_lines,
          cost_cop: roundCop(g.cost_cop),
          stocked_at: g.stocked_at,
          days_in_stock: g.days_in_stock,
          priority: g.priority,
          reason_codes: codes,
          reasons: codes.map((c) => REASON_LABELS[c] ?? c),
          pvp_cop: g.pvp_cop,
          potential_margin_cop: g.potential_margin_cop,
          potential_margin_pct: g.potential_margin_pct,
          sales_in_period: g.sales_in_period,
          is_vintage: g.is_vintage,
          type_median_days_to_sell: g.type_median_days_to_sell,
          type_remaining_units: g.type_remaining_units,
          type_sell_through_pct: g.type_sell_through_pct,
          type_stuck_pct: g.type_stuck_pct,
        };
      });

    let inventory_cost_now = 0;
    for (const stock of allStock) {
      if (isSellableState(String(stock.card_state ?? '').toLowerCase())) {
        inventory_cost_now += stockLineCostCop(stock);
      }
    }

    // Primero las que llevan más tiempo
    reconsiderCandidates.sort((a, b) => {
      const da = a.days_in_stock ?? -1;
      const db = b.days_in_stock ?? -1;
      if (db !== da) return db - da;
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      return b.cost_cop - a.cost_cop;
    });
    const deadCap = reconsiderCandidates.slice(0, RECONSIDER_LIST_CAP);
    const dead_stock = {
      lines_count: reconsiderLines.length,
      cards_count: reconsiderCandidates.length,
      cost_cop: roundCop(
        reconsiderCandidates.reduce((s, i) => s + i.cost_cop, 0),
      ),
      items: deadCap,
    };

    const sell_through_pct =
      units_sold + sellable_stock_units_now === 0
        ? null
        : Math.round(
            (units_sold / (units_sold + sellable_stock_units_now)) * 10000,
          ) / 100;
    const inventory_turnover_approximate =
      inventory_cost_now === 0
        ? null
        : Math.round((cost_cop / inventory_cost_now) * 100) / 100;
    const gmroi_approximate =
      inventory_cost_now === 0
        ? null
        : Math.round((gross_profit_cop / inventory_cost_now) * 100) / 100;

    return {
      generated_at: new Date().toISOString(),
      period: { from: fromStr, to: toStr },
      summary: {
        units_sold,
        revenue_cop: roundCop(revenue_cop),
        cost_cop: roundCop(cost_cop),
        gross_profit_cop: roundCop(gross_profit_cop),
        gross_margin_pct,
        aov_cop,
        tickets_count,
        cost_data_quality: { with_snapshot, with_fallback },
        timing_data_quality: {
          with_sale_created_at,
          reception_from_snapshot,
          reception_from_stocked_at,
          reception_from_objectid,
          reception_missing,
          tags_from_snapshot,
          tags_from_card_map,
        },
      },
      top_sellers_by_units,
      top_sellers_by_revenue,
      top_profit,
      top_loss_sales,
      velocity_by_product_kind,
      fastest_kinds,
      slowest_kinds,
      sales_by_day,
      sales_by_cycle: sales_by_cycle.map((c) => ({
        ...c,
        revenue_cop: roundCop(c.revenue_cop),
        profit_cop: roundCop(c.profit_cop),
      })),
      sales_by_tag,
      inventory_losses,
      dead_stock,
      kpis: {
        sell_through_pct,
        sell_through_approximate: true,
        inventory_turnover_approximate,
        gmroi_approximate,
      },
    };
  }
}
