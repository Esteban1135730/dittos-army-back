import type { OwnerKey } from '../config/owners.config';

export type StockPvpBenchmarkHint =
  | 'no_pvp'
  | 'no_sales'
  | 'above_max_sale'
  | 'below_min_sale'
  | 'within_sale_range'
  | 'pvp_higher_than_partner'
  | 'pvp_lower_than_partner';

export type StockPvpBenchmarkRow = {
  variant_key: string;
  card_id: string;
  card_name: string;
  language: string;
  rareza: string | null;
  image_url: string;
  qty_stock: number;
  card_cost_avg: number | null;
  pvp_current: number | null;
  pvp_pablo: number | null;
  pvp_esteban: number | null;
  sales_count: number;
  sale_min_cop: number | null;
  sale_max_cop: number | null;
  sale_min_owner: OwnerKey | null;
  sale_max_owner: OwnerKey | null;
  sale_last_cop: number | null;
  sale_last_at: string | null;
  hint: StockPvpBenchmarkHint;
};

export type StockPvpBenchmarkMeta = {
  stock_owner: OwnerKey;
  compare_owners: OwnerKey[];
  sales_from: string | null;
  sales_to: string | null;
  generated_at: string;
  row_count: number;
};

export type StockPvpBenchmarkResponse = {
  meta: StockPvpBenchmarkMeta;
  rows: StockPvpBenchmarkRow[];
};

export type SaleBenchmarkInput = {
  variant_key: string;
  amount_cop: number;
  owner: OwnerKey;
  created_at: Date;
};

export type StockBenchmarkInput = {
  variant_key: string;
  card_id: string;
  card_name: string;
  language: string;
  rareza: string | null;
  image_url: string;
  units: number;
  card_cost: number;
  pvp_current: number | null;
};

export type PvpByVariant = Map<string, number | null>;
