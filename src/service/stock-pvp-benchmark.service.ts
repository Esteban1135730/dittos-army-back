import { BadRequestException, Injectable } from '@nestjs/common';
import {
  getOwnerDefinition,
  otherOwner,
  ownersForTcg,
  type OwnerKey,
} from '../config/owners.config';
import { effectiveProductKind } from '../constants/bulk-product';
import { normalizeOperationalRareza } from '../constants/item-rareza';
import { getCurrentOwner } from '../owner/owner-context';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Pvp, PvpDocument } from '../schema/pvp.schema';
import { Sale, SaleDocument } from '../schema/sale.schema';
import { Stock, StockDocument } from '../schema/stock.schema';
import {
  buildVariantKey,
  normalizeHistorialLanguage,
  parseVariantKey,
} from './cardtrader/cardtrader-orders-historial.aggregate';
import {
  aggregateSalesByVariant,
  buildBenchmarkRows,
  mergeStockByVariant,
  sortBenchmarkRows,
} from './stock-pvp-benchmark.aggregate';
import type {
  PvpByVariant,
  SaleBenchmarkInput,
  StockBenchmarkInput,
  StockPvpBenchmarkResponse,
} from './stock-pvp-benchmark.types';
import {
  groupPvpsByCardId,
  resolvePvpForLine,
  type PvpLike,
} from '../utils/pvp-resolve';

function pvpForVariant(
  byCard: Map<string, PvpLike[]>,
  variantKey: string,
): number | null {
  const parsed = parseVariantKey(variantKey);
  if (!parsed) return null;
  const list = byCard.get(parsed.card_id) ?? [];
  return resolvePvpForLine(list, parsed.rareza)?.pvp ?? null;
}

function pvpMapForVariants(
  byCard: Map<string, PvpLike[]>,
  variantKeys: Iterable<string>,
): PvpByVariant {
  const map: PvpByVariant = new Map();
  for (const vk of variantKeys) {
    map.set(vk, pvpForVariant(byCard, vk));
  }
  return map;
}

const SELLABLE_STATES = new Set([
  'disponible',
  'en_stock_colombia',
  'en_stock',
]);

const POKEMON_COMPARE: OwnerKey[] = ['pablo', 'esteban'];

function parseOptionalDate(
  raw: string | undefined,
  label: string,
): Date | null {
  const v = raw?.trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) {
    throw new BadRequestException(`Fecha inválida (${label})`);
  }
  return d;
}

function stockUnits(stock: {
  product_kind?: string | null;
  quantity?: number | null;
}): number {
  if (effectiveProductKind(stock.product_kind) === 'quantity') {
    return Math.max(0, Math.floor(stock.quantity ?? 0));
  }
  return 1;
}

function isSellable(stock: { card_state?: string | null }): boolean {
  const st = String(stock.card_state ?? '').toLowerCase();
  return SELLABLE_STATES.has(st);
}

@Injectable()
export class StockPvpBenchmarkService {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  async getBenchmark(query: {
    from?: string;
    to?: string;
  }): Promise<StockPvpBenchmarkResponse> {
    const stockOwner = getCurrentOwner();
    const tcg = getOwnerDefinition(stockOwner).tcg;
    const compareOwners =
      tcg === 'pokemon'
        ? POKEMON_COMPARE
        : ownersForTcg(tcg).map((o) => o.key);

    const from = parseOptionalDate(query.from, 'from');
    let to = parseOptionalDate(query.to, 'to');
    if (to) {
      to = new Date(to);
      to.setUTCHours(23, 59, 59, 999);
    }
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('from no puede ser posterior a to');
    }

    const sales = await this.loadSales(compareOwners, from, to);
    const salesByVariant = aggregateSalesByVariant(sales);

    const stockLines = await this.loadSellableStock(stockOwner);
    const stockByVariant = mergeStockByVariant(stockLines);
    const variantKeys = [...stockByVariant.keys()];
    const cardIds = [...new Set(stockLines.map((l) => l.card_id))];

    const includePartnerPvp = tcg === 'pokemon' && otherOwner(stockOwner) != null;
    const pvpPablo = includePartnerPvp
      ? pvpMapForVariants(
          await this.loadPvpByCard('pablo', cardIds),
          variantKeys,
        )
      : new Map<string, number | null>();
    const pvpEsteban = includePartnerPvp
      ? pvpMapForVariants(
          await this.loadPvpByCard('esteban', cardIds),
          variantKeys,
        )
      : new Map<string, number | null>();
    const rows = buildBenchmarkRows({
      stockByVariant,
      salesByVariant,
      pvpPablo,
      pvpEsteban,
      stock_owner: stockOwner,
      includePartnerPvp,
    });
    sortBenchmarkRows(rows);

    return {
      meta: {
        stock_owner: stockOwner,
        compare_owners: compareOwners,
        sales_from: from ? from.toISOString().slice(0, 10) : null,
        sales_to: to ? to.toISOString().slice(0, 10) : null,
        generated_at: new Date().toISOString(),
        row_count: rows.length,
      },
      rows,
    };
  }

  private async loadSellableStock(
    owner: OwnerKey,
  ): Promise<StockBenchmarkInput[]> {
    const stockModel = this.ownerModels.getModel<StockDocument>(
      Stock.name,
      owner,
    );
    const stocks = await stockModel.find({}).lean().exec();
    const cardIds = [...new Set(stocks.map((s) => s.card_id).filter(Boolean))];
    const pvpByCard = await this.loadPvpByCard(owner, cardIds);

    const lines: StockBenchmarkInput[] = [];
    for (const stock of stocks) {
      if (!isSellable(stock)) continue;
      const units = stockUnits(stock);
      if (units <= 0) continue;
      const rareza = normalizeOperationalRareza(stock.rareza);
      const language = normalizeHistorialLanguage(
        stock.language ?? stock.languaje,
      );
      const variant_key = buildVariantKey(stock.card_id, language, rareza);
      const card_cost =
        (Number(stock.shipment) || 0) / (Number(stock.cards_in_shipmet) || 1) +
        (Number(stock.unity_cost) || 0);

      lines.push({
        variant_key,
        card_id: stock.card_id,
        card_name: String(stock.card_name ?? '').trim() || stock.card_id,
        language,
        rareza,
        image_url: String(stock.image_url ?? '').trim(),
        units,
        card_cost,
        pvp_current: pvpForVariant(pvpByCard, variant_key),
      });
    }
    return lines;
  }

  private async loadPvpByCard(
    owner: OwnerKey,
    cardIds: string[],
  ): Promise<Map<string, PvpLike[]>> {
    if (cardIds.length === 0) return new Map();
    const pvpModel = this.ownerModels.getModel<PvpDocument>(Pvp.name, owner);
    const pvps = await pvpModel
      .find({ card_id: { $in: cardIds } })
      .lean()
      .exec();
    return groupPvpsByCardId(pvps);
  }

  private async loadSales(
    owners: OwnerKey[],
    from: Date | null,
    to: Date | null,
  ): Promise<SaleBenchmarkInput[]> {
    const out: SaleBenchmarkInput[] = [];
    for (const owner of owners) {
      const saleModel = this.ownerModels.getModel<SaleDocument>(
        Sale.name,
        owner,
      );
      const stockModel = this.ownerModels.getModel<StockDocument>(
        Stock.name,
        owner,
      );
      const filter: Record<string, unknown> = { type: 'venta' };
      if (from || to) {
        const range: Record<string, Date> = {};
        if (from) range.$gte = from;
        if (to) range.$lte = to;
        filter.created_at = range;
      }
      const sales = await saleModel.find(filter).lean().exec();
      if (sales.length === 0) continue;

      const stockIds = [...new Set(sales.map((s) => s.stock_id))];
      const stocks = await stockModel
        .find({ _id: { $in: stockIds } })
        .select('card_id language languaje rareza')
        .lean()
        .exec();
      const stockById = new Map(stocks.map((s) => [String(s._id), s]));

      for (const s of sales) {
        const stock = stockById.get(s.stock_id);
        const language = normalizeHistorialLanguage(
          stock?.language ?? stock?.languaje,
        );
        const rareza = normalizeOperationalRareza(
          s.rareza_snapshot ?? stock?.rareza,
        );
        const card_id = s.card_id || stock?.card_id || '';
        if (!card_id) continue;
        const variant_key = buildVariantKey(card_id, language, rareza);
        const amount = Number(s.amount_cop);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        out.push({
          variant_key,
          amount_cop: amount,
          owner,
          created_at: s.created_at ? new Date(s.created_at) : new Date(),
        });
      }
    }
    return out;
  }
}
