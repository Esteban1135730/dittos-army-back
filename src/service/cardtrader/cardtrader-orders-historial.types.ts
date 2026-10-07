export type HistorialOrderAs = 'buyer' | 'seller' | 'all';

export type HistorialEventKind =
  | 'ct_buy'
  | 'ct_sell'
  | 'transit'
  | 'stock_sellable'
  | 'sale_local'
  | 'reserva';

export type HistorialEvent = {
  at: string;
  kind: HistorialEventKind;
  label: string;
  quantity: number;
  refs: Record<string, string | number | null>;
};

export type HistorialVariantRow = {
  variant_key: string;
  card_id: string;
  card_name: string;
  language: string;
  rareza: string | null;
  image_url: string;
  qty_ct_buy: number;
  qty_ct_sell: number;
  qty_transit: number;
  qty_stock_sellable: number;
  qty_reserved: number;
  qty_sold_local: number;
  last_sold_local_at: string | null;
  flags: { in_reserva_now: boolean };
};

export type HistorialMeta = {
  generated_at: string;
  ct_orders_scanned: { buyer: number; seller: number };
  unresolved_ct_items: number;
  partial_ct_fetch: boolean;
  /** true si se omitieron homologaciones TCGdex por límite de volumen */
  tcgdex_resolve_capped?: boolean;
  from: string;
  to: string;
  order_as: HistorialOrderAs;
};

export type HistorialSnapshot = {
  meta: HistorialMeta;
  rows: HistorialVariantRow[];
  eventsByVariant: Record<string, HistorialEvent[]>;
};

export type CtHistorialUnitInput = {
  side: 'buyer' | 'seller';
  order_id: number;
  order_code: string;
  order_state: string;
  paid_at: string;
  card_id: string | null;
  card_name: string;
  language: string;
  rareza: string | null;
  image_url: string;
  quantity: number;
  unresolved: boolean;
};

export type LocalStockSlice = {
  card_id: string;
  card_name: string;
  language: string;
  rareza: string | null;
  image_url: string;
  card_state: string;
  product_kind?: string;
  quantity?: number;
  stock_id: string;
};

export type LocalTransitSlice = {
  card_id: string;
  card_name: string;
  language: string;
  rareza: string | null;
  image_url: string;
  remaining_quantity: number;
  lot_id: string;
  purchase_date: string | null;
};

export type LocalReservaSlice = {
  stock_id: string;
  card_id: string;
  language: string;
  rareza: string | null;
  quantity: number;
  created_at: string | null;
  pedido_id: string | null;
};

export type LocalSaleSlice = {
  card_id: string;
  rareza: string | null;
  language: string;
  created_at: Date;
  stock_id: string;
  amount_cop: number;
};
