import { BadRequestException, Injectable } from '@nestjs/common';
import { isOwnerKey, type OwnerKey } from '../../config/owners.config';
import { OwnerModelsService } from '../../owner/owner-models.service';
import { Stock, StockDocument } from '../../schema/stock.schema';
import { Sale, SaleDocument } from '../../schema/sale.schema';
import { Reserva, ReservaDocument } from '../../schema/reserva.schema';
import {
  CardtraderTransitLine,
  CardtraderTransitLineDocument,
} from '../../schema/cardtrader-transit-line.schema';
import {
  CardtraderTransitLot,
  CardtraderTransitLotDocument,
} from '../../schema/cardtrader-transit-lot.schema';
import { CardTraderService } from './cardtrader.service';
import { CardTraderTcgdexResolveService } from './cardtrader-tcgdex-resolve.service';
import { TtlCache } from '../../utils/ttl-cache';
import type { CtOrder } from '../../utils/cardtrader-sent-units';
import {
  expandCtOrdersToHistorialUnits,
  normalizeCtOrdersResponse,
  resolveKeyFromOrderItem,
  type CtItemResolveKey,
} from './cardtrader-orders-historial.ct-expand';
import {
  filterHistorialRows,
  finalizeHistorialRows,
  type HistorialMutableRow,
  mergeCtUnits,
  mergeLocalStock,
  mergeReservas,
  mergeSales,
  mergeTransit,
  paginateRows,
  parseVariantKey,
} from './cardtrader-orders-historial.aggregate';
import { normalizeOperationalRareza } from '../../constants/item-rareza';
import type {
  HistorialEvent,
  HistorialOrderAs,
  HistorialSnapshot,
  HistorialVariantRow,
  LocalReservaSlice,
  LocalSaleSlice,
  LocalStockSlice,
  LocalTransitSlice,
} from './cardtrader-orders-historial.types';

const POKEMON_OWNERS: OwnerKey[] = ['pablo', 'esteban'];
const SNAPSHOT_TTL_MS = 8 * 60 * 1000;
const DEFAULT_MAX_CT_PAGES = 5;
const TCGDEX_RESOLVE_CONCURRENCY = 12;
const TCGDEX_RESOLVE_MAX_KEYS = 400;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function defaultHistorialPeriod(now = new Date()): {
  from: string;
  to: string;
} {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const from = new Date(
    Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), to.getUTCDate()),
  );
  return {
    from: `${from.getUTCFullYear()}-${pad2(from.getUTCMonth() + 1)}-${pad2(from.getUTCDate())}`,
    to: `${to.getUTCFullYear()}-${pad2(to.getUTCMonth() + 1)}-${pad2(to.getUTCDate())}`,
  };
}

function parseIsoDate(value: string | undefined, fallback: string): string {
  const v = value?.trim();
  if (!v) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new BadRequestException('from/to deben ser YYYY-MM-DD');
  }
  return v;
}

@Injectable()
export class CardtraderOrdersHistorialService {
  private readonly snapshotCache = new TtlCache<HistorialSnapshot>({
    ttlMs: SNAPSHOT_TTL_MS,
    maxEntries: 32,
  });

  constructor(
    private readonly cardTrader: CardTraderService,
    private readonly tcgResolve: CardTraderTcgdexResolveService,
    private readonly ownerModels: OwnerModelsService,
  ) {}

  private cacheKey(args: {
    from: string;
    to: string;
    orderAs: HistorialOrderAs;
    owner: string;
  }): string {
    return `${args.from}|${args.to}|${args.orderAs}|${args.owner}`;
  }

  async listHistorial(query: {
    from?: string;
    to?: string;
    order_as?: HistorialOrderAs;
    owner?: string;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    meta: HistorialSnapshot['meta'];
    rows: HistorialVariantRow[];
    total: number;
  }> {
    const defaults = defaultHistorialPeriod();
    const from = parseIsoDate(query.from, defaults.from);
    const to = parseIsoDate(query.to, defaults.to);
    const orderAs = query.order_as ?? 'all';
    if (!['buyer', 'seller', 'all'].includes(orderAs)) {
      throw new BadRequestException('order_as inválido');
    }
    const ownerFilter = this.resolveOwnerFilter(query.owner);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page inválido');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException('limit debe ser 1–200');
    }

    const snapshot = await this.getOrBuildSnapshot({
      from,
      to,
      orderAs,
      ownerFilter,
    });
    const filtered = filterHistorialRows(snapshot.rows, query.q);
    const { items, total } = paginateRows(filtered, page, limit);
    return { meta: snapshot.meta, rows: items, total };
  }

  async listVariantEvents(
    variantKey: string,
    query: {
      from?: string;
      to?: string;
      order_as?: HistorialOrderAs;
      owner?: string;
    },
  ): Promise<{ events: HistorialEvent[] }> {
    if (!parseVariantKey(decodeURIComponent(variantKey))) {
      throw new BadRequestException('variant_key inválido');
    }
    const defaults = defaultHistorialPeriod();
    const from = parseIsoDate(query.from, defaults.from);
    const to = parseIsoDate(query.to, defaults.to);
    const orderAs = query.order_as ?? 'all';
    const ownerFilter = this.resolveOwnerFilter(query.owner);
    const snapshot = await this.getOrBuildSnapshot({
      from,
      to,
      orderAs,
      ownerFilter,
    });
    const key = decodeURIComponent(variantKey);
    return { events: snapshot.eventsByVariant[key] ?? [] };
  }

  private resolveOwnerFilter(owner?: string): OwnerKey[] {
    const raw = owner?.trim();
    if (!raw || raw === 'all') return [...POKEMON_OWNERS];
    if (!isOwnerKey(raw)) {
      throw new BadRequestException('owner inválido');
    }
    if (!POKEMON_OWNERS.includes(raw)) {
      throw new BadRequestException(
        'owner debe ser pablo, esteban o all (Pokémon)',
      );
    }
    return [raw];
  }

  private async getOrBuildSnapshot(args: {
    from: string;
    to: string;
    orderAs: HistorialOrderAs;
    ownerFilter: OwnerKey[];
  }): Promise<HistorialSnapshot> {
    const ownerKey = args.ownerFilter.join('+');
    const key = this.cacheKey({
      from: args.from,
      to: args.to,
      orderAs: args.orderAs,
      owner: ownerKey,
    });
    return this.snapshotCache.getOrLoad(key, () =>
      this.buildSnapshot(args),
    );
  }

  private async buildSnapshot(args: {
    from: string;
    to: string;
    orderAs: HistorialOrderAs;
    ownerFilter: OwnerKey[];
  }): Promise<HistorialSnapshot> {
    const maxPages = Number(process.env.CT_ORDERS_HISTORIAL_MAX_PAGES ?? DEFAULT_MAX_CT_PAGES);
    const safeMaxPages =
      Number.isFinite(maxPages) && maxPages > 0
        ? Math.min(maxPages, 50)
        : DEFAULT_MAX_CT_PAGES;

    let partialCt = false;
    let buyerOrders = 0;
    let sellerOrders = 0;
    const buyerList: CtOrder[] = [];
    const sellerList: CtOrder[] = [];

    const fetchRole = async (role: 'buyer' | 'seller'): Promise<CtOrder[]> => {
      const acc: CtOrder[] = [];
      for (let page = 1; page <= safeMaxPages; page++) {
        try {
          const raw = await this.cardTrader.getOrders({
            page,
            limit: 100,
            from: args.from,
            to: args.to,
            orderAs: role,
          });
          const batch = normalizeCtOrdersResponse(raw);
          if (batch.length === 0) break;
          acc.push(...batch);
          if (batch.length < 100) break;
        } catch {
          partialCt = true;
          break;
        }
      }
      return acc;
    };

    if (args.orderAs === 'all' || args.orderAs === 'buyer') {
      const orders = await fetchRole('buyer');
      buyerList.push(...orders);
      buyerOrders = orders.length;
    }
    if (args.orderAs === 'all' || args.orderAs === 'seller') {
      const orders = await fetchRole('seller');
      sellerList.push(...orders);
      sellerOrders = orders.length;
    }

    const { map: cardIdByResolveKey, capped: tcgdexResolveCapped } =
      await this.buildTcgdexMap([...buyerList, ...sellerList]);

    const ctUnits = [
      ...(args.orderAs === 'all' || args.orderAs === 'buyer'
        ? expandCtOrdersToHistorialUnits({
            orders: buyerList,
            side: 'buyer',
            cardIdByResolveKey,
          })
        : []),
      ...(args.orderAs === 'all' || args.orderAs === 'seller'
        ? expandCtOrdersToHistorialUnits({
            orders: sellerList,
            side: 'seller',
            cardIdByResolveKey,
          })
        : []),
    ];

    const map = new Map<string, HistorialMutableRow>();

    for (const owner of args.ownerFilter) {
      const [stocks, transit, reservas, sales] = await Promise.all([
        this.loadStock(owner),
        this.loadTransit(owner),
        this.loadReservas(owner),
        this.loadSales(owner),
      ]);
      mergeLocalStock(map, stocks);
      mergeTransit(map, transit);
      mergeReservas(map, reservas);
      mergeSales(map, sales);
    }

    const unresolvedCt = mergeCtUnits(map, ctUnits);

    const { rows, eventsByVariant } = finalizeHistorialRows(map);

    return {
      meta: {
        generated_at: new Date().toISOString(),
        ct_orders_scanned: { buyer: buyerOrders, seller: sellerOrders },
        unresolved_ct_items: unresolvedCt,
        partial_ct_fetch: partialCt,
        tcgdex_resolve_capped: tcgdexResolveCapped,
        from: args.from,
        to: args.to,
        order_as: args.orderAs,
      },
      rows,
      eventsByVariant,
    };
  }

  private async buildTcgdexMap(
    orders: CtOrder[],
  ): Promise<{ map: Map<string, string | null>; capped: boolean }> {
    const unique = new Map<string, CtItemResolveKey>();
    for (const order of orders) {
      for (const item of order.order_items ?? []) {
        const rk = resolveKeyFromOrderItem(item);
        if (!unique.has(rk.key)) unique.set(rk.key, rk);
      }
    }
    const allKeys = [...unique.values()];
    const capped = allKeys.length > TCGDEX_RESOLVE_MAX_KEYS;
    const keys = capped ? allKeys.slice(0, TCGDEX_RESOLVE_MAX_KEYS) : allKeys;
    const out = new Map<string, string | null>();
    for (let i = 0; i < keys.length; i += TCGDEX_RESOLVE_CONCURRENCY) {
      const chunk = keys.slice(i, i + TCGDEX_RESOLVE_CONCURRENCY);
      const results = await this.tcgResolve.resolveTcgdexCardIdBatch(
        chunk.map((k) => ({
          expansionName: k.expansionName,
          collectorNumber: k.collectorNumber,
          cardName: k.cardName,
          language: k.language,
          blueprint_id: k.blueprint_id,
        })),
      );
      chunk.forEach((k, j) => {
        out.set(k.key, results[j]?.tcgdex_card_id ?? null);
      });
    }
    return { map: out, capped };
  }

  private async loadStock(owner: OwnerKey): Promise<LocalStockSlice[]> {
    const model = this.ownerModels.getModel<StockDocument>(Stock.name, owner);
    const docs = await model
      .find()
      .select(
        'card_id card_name language languaje rareza image_url card_state product_kind quantity',
      )
      .lean()
      .exec();
    return docs.map((d) => ({
      stock_id: String(d._id),
      card_id: d.card_id ?? '',
      card_name: d.card_name ?? '',
      language: (d.language ?? d.languaje ?? 'en') as string,
      rareza: normalizeOperationalRareza(d.rareza),
      image_url: d.image_url ?? '',
      card_state: d.card_state ?? '',
      product_kind: d.product_kind,
      quantity: d.quantity,
    }));
  }

  private async loadTransit(owner: OwnerKey): Promise<LocalTransitSlice[]> {
    const lineModel = this.ownerModels.getModel<CardtraderTransitLineDocument>(
      CardtraderTransitLine.name,
      owner,
    );
    const lotModel = this.ownerModels.getModel<CardtraderTransitLotDocument>(
      CardtraderTransitLot.name,
      owner,
    );
    const lines = await lineModel.find().lean().exec();
    const lotIds = [...new Set(lines.map((l) => l.lot_id))];
    const lots = lotIds.length
      ? await lotModel.find({ _id: { $in: lotIds } }).lean().exec()
      : [];
    const lotDate = new Map<string, string | null>();
    for (const lot of lots) {
      lotDate.set(
        String(lot._id),
        lot.purchase_date ? new Date(lot.purchase_date).toISOString() : null,
      );
    }
    return lines.map((line) => ({
      card_id: line.card_id,
      card_name: line.card_name ?? line.card_id,
      language: line.language,
      rareza: normalizeOperationalRareza(line.rareza),
      image_url: line.image_url ?? '',
      remaining_quantity: line.remaining_quantity ?? 0,
      lot_id: line.lot_id,
      purchase_date: lotDate.get(line.lot_id) ?? null,
    }));
  }

  private async loadReservas(owner: OwnerKey): Promise<LocalReservaSlice[]> {
    const reservaModel = this.ownerModels.getModel<ReservaDocument>(
      Reserva.name,
      owner,
    );
    const stockModel = this.ownerModels.getModel<StockDocument>(
      Stock.name,
      owner,
    );
    const reservas = await reservaModel.find().lean().exec();
    if (reservas.length === 0) return [];
    const stockIds = [...new Set(reservas.map((r) => r.stock_id))];
    const stocks = await stockModel
      .find({ _id: { $in: stockIds } })
      .select('card_id language languaje rareza')
      .lean()
      .exec();
    const stockById = new Map(stocks.map((s) => [String(s._id), s]));
    return reservas.map((r) => {
      const stock = stockById.get(r.stock_id);
      return {
        stock_id: r.stock_id,
        card_id: stock?.card_id ?? '',
        language: (stock?.language ?? stock?.languaje ?? 'en') as string,
        rareza: normalizeOperationalRareza(stock?.rareza),
        quantity: r.quantity ?? 1,
        created_at: r.created_at
          ? new Date(r.created_at).toISOString()
          : null,
        pedido_id: r.pedido_id ?? null,
      };
    });
  }

  private async loadSales(owner: OwnerKey): Promise<LocalSaleSlice[]> {
    const saleModel = this.ownerModels.getModel<SaleDocument>(Sale.name, owner);
    const stockModel = this.ownerModels.getModel<StockDocument>(
      Stock.name,
      owner,
    );
    const sales = await saleModel
      .find({ type: 'venta' })
      .sort({ created_at: -1 })
      .lean()
      .exec();
    if (sales.length === 0) return [];
    const stockIds = [...new Set(sales.map((s) => s.stock_id))];
    const stocks = await stockModel
      .find({ _id: { $in: stockIds } })
      .select('language languaje')
      .lean()
      .exec();
    const stockById = new Map(stocks.map((s) => [String(s._id), s]));
    return sales.map((s) => ({
      card_id: s.card_id,
      rareza: normalizeOperationalRareza(s.rareza_snapshot),
      language: (stockById.get(s.stock_id)?.language ??
        stockById.get(s.stock_id)?.languaje ??
        'en') as string,
      created_at: s.created_at ? new Date(s.created_at) : new Date(),
      stock_id: s.stock_id,
      amount_cop: s.amount_cop,
    }));
  }
}
