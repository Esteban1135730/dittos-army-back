export const SELLABLE_STOCK_STATES = new Set([
  'disponible',
  'en_stock_colombia',
]);

export type StockSellRejectReason =
  | 'sin_pvp'
  | 'estado_no_vendible'
  | 'ya_vendida'
  | 'reservada'
  | 'propiedad'
  | 'sin_stock';

export function evaluateStockSellable(
  cardState: string,
  priceCop: number | null,
  opts?: { product_kind?: string | null; quantity?: number | null },
): { sellable: boolean; reject_reason?: StockSellRejectReason } {
  if (cardState === 'vendida') {
    return { sellable: false, reject_reason: 'ya_vendida' };
  }
  if (cardState === 'reserva') {
    return { sellable: false, reject_reason: 'reservada' };
  }
  if (cardState === 'propiedad') {
    return { sellable: false, reject_reason: 'propiedad' };
  }
  if (!SELLABLE_STOCK_STATES.has(cardState)) {
    return { sellable: false, reject_reason: 'estado_no_vendible' };
  }
  if (priceCop == null || priceCop <= 0) {
    return { sellable: false, reject_reason: 'sin_pvp' };
  }
  if (String(opts?.product_kind ?? '').trim() === 'quantity') {
    const qty = opts?.quantity;
    if (qty == null || !Number.isFinite(qty) || qty <= 0) {
      return { sellable: false, reject_reason: 'sin_stock' };
    }
  }
  return { sellable: true };
}
