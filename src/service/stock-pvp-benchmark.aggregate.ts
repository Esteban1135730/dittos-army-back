import type { OwnerKey } from '../config/owners.config';
import type {
  PvpByVariant,
  SaleBenchmarkInput,
  StockBenchmarkInput,
  StockPvpBenchmarkHint,
  StockPvpBenchmarkRow,
} from './stock-pvp-benchmark.types';

export type SaleStats = {
  count: number;
  min: number | null;
  max: number | null;
  min_owner: OwnerKey | null;
  max_owner: OwnerKey | null;
  last_cop: number | null;
  last_at: Date | null;
};

export function aggregateSalesByVariant(
  sales: SaleBenchmarkInput[],
): Map<string, SaleStats> {
  const map = new Map<string, SaleStats>();
  for (const s of sales) {
    let row = map.get(s.variant_key);
    if (!row) {
      row = {
        count: 0,
        min: null,
        max: null,
        min_owner: null,
        max_owner: null,
        last_cop: null,
        last_at: null,
      };
      map.set(s.variant_key, row);
    }
    row.count += 1;
    const amt = s.amount_cop;
    if (row.min == null || amt < row.min) {
      row.min = amt;
      row.min_owner = s.owner;
    }
    if (row.max == null || amt > row.max) {
      row.max = amt;
      row.max_owner = s.owner;
    }
    if (!row.last_at || s.created_at > row.last_at) {
      row.last_at = s.created_at;
      row.last_cop = amt;
    }
  }
  return map;
}

export function mergeStockByVariant(
  lines: StockBenchmarkInput[],
): Map<string, StockBenchmarkInput & { qty_stock: number; cost_sum: number }> {
  const map = new Map<
    string,
    StockBenchmarkInput & { qty_stock: number; cost_sum: number }
  >();
  for (const line of lines) {
    const existing = map.get(line.variant_key);
    if (!existing) {
      map.set(line.variant_key, {
        ...line,
        qty_stock: line.units,
        cost_sum: line.card_cost * line.units,
      });
      continue;
    }
    existing.qty_stock += line.units;
    existing.cost_sum += line.card_cost * line.units;
    if (!existing.card_name && line.card_name) existing.card_name = line.card_name;
    if (!existing.image_url && line.image_url) existing.image_url = line.image_url;
  }
  return map;
}

export function resolveBenchmarkHint(params: {
  pvp_current: number | null;
  sale_min: number | null;
  sale_max: number | null;
  sales_count: number;
  stock_owner: OwnerKey;
  pvp_pablo: number | null;
  pvp_esteban: number | null;
}): StockPvpBenchmarkHint {
  const { pvp_current, sale_min, sale_max, sales_count, stock_owner } = params;
  if (pvp_current == null || !Number.isFinite(pvp_current)) return 'no_pvp';
  if (sales_count === 0 || sale_min == null || sale_max == null) return 'no_sales';

  if (pvp_current > sale_max) return 'above_max_sale';
  if (pvp_current < sale_min) return 'below_min_sale';

  const partner =
    stock_owner === 'pablo'
      ? params.pvp_esteban
      : stock_owner === 'esteban'
        ? params.pvp_pablo
        : null;
  if (partner != null && Number.isFinite(partner)) {
    if (pvp_current > partner * 1.05) return 'pvp_higher_than_partner';
    if (pvp_current < partner * 0.95) return 'pvp_lower_than_partner';
  }

  return 'within_sale_range';
}

export function buildBenchmarkRows(params: {
  stockByVariant: Map<
    string,
    StockBenchmarkInput & { qty_stock: number; cost_sum: number }
  >;
  salesByVariant: Map<string, SaleStats>;
  pvpPablo: PvpByVariant;
  pvpEsteban: PvpByVariant;
  stock_owner: OwnerKey;
  includePartnerPvp: boolean;
}): StockPvpBenchmarkRow[] {
  const rows: StockPvpBenchmarkRow[] = [];
  for (const [variant_key, stock] of params.stockByVariant) {
    const sales = params.salesByVariant.get(variant_key);
    const pvp_pablo = params.includePartnerPvp
      ? (params.pvpPablo.get(variant_key) ?? null)
      : params.stock_owner === 'pablo'
        ? stock.pvp_current
        : null;
    const pvp_esteban = params.includePartnerPvp
      ? (params.pvpEsteban.get(variant_key) ?? null)
      : params.stock_owner === 'esteban'
        ? stock.pvp_current
        : null;

    const sale_min = sales?.min ?? null;
    const sale_max = sales?.max ?? null;
    const sales_count = sales?.count ?? 0;

    rows.push({
      variant_key,
      card_id: stock.card_id,
      card_name: stock.card_name,
      language: stock.language,
      rareza: stock.rareza,
      image_url: stock.image_url,
      qty_stock: stock.qty_stock,
      card_cost_avg:
        stock.qty_stock > 0 ? stock.cost_sum / stock.qty_stock : null,
      pvp_current: stock.pvp_current,
      pvp_pablo,
      pvp_esteban,
      sales_count,
      sale_min_cop: sale_min,
      sale_max_cop: sale_max,
      sale_min_owner: sales?.min_owner ?? null,
      sale_max_owner: sales?.max_owner ?? null,
      sale_last_cop: sales?.last_cop ?? null,
      sale_last_at: sales?.last_at
        ? sales.last_at.toISOString()
        : null,
      hint: resolveBenchmarkHint({
        pvp_current: stock.pvp_current,
        sale_min,
        sale_max,
        sales_count,
        stock_owner: params.stock_owner,
        pvp_pablo,
        pvp_esteban,
      }),
    });
  }
  return rows;
}

/** Prioridad para ordenar filas “accionables” arriba. */
export const HINT_SORT_ORDER: Record<StockPvpBenchmarkHint, number> = {
  above_max_sale: 0,
  below_min_sale: 1,
  pvp_higher_than_partner: 2,
  pvp_lower_than_partner: 3,
  no_pvp: 4,
  no_sales: 5,
  within_sale_range: 6,
};

export function sortBenchmarkRows(rows: StockPvpBenchmarkRow[]): void {
  rows.sort((a, b) => {
    const ha = HINT_SORT_ORDER[a.hint];
    const hb = HINT_SORT_ORDER[b.hint];
    if (ha !== hb) return ha - hb;
    return a.card_name.localeCompare(b.card_name, 'es');
  });
}
