export const SELLABLE_STOCK_STATES = new Set([
  'disponible',
  'en_stock_colombia',
]);

export type StockSellRejectReason =
  | 'sin_pvp'
  | 'estado_no_vendible'
  | 'ya_vendida'
  | 'reservada'
  | 'propiedad';

export function evaluateStockSellable(
  cardState: string,
  priceCop: number | null,
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
  return { sellable: true };
}
