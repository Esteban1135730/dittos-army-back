export const SELLABLE_STOCK_STATES = new Set([
  'disponible',
  'en_stock_colombia',
]);

/**
 * Valores legacy de «condición física» que el formulario /add-stock
 * guardaba por error en `card_state` (colisión semántica con inventario).
 */
export const LEGACY_CONDITION_CARD_STATES = new Set([
  'mint',
  'near_mint',
  'played',
  'good',
  'poor',
]);

/**
 * Si `card_state` es una condición física legacy, lo mapea a `disponible`.
 * Otros valores (inventario / ciclo de vida) se dejan igual.
 */
export function normalizeInventoryCardState(
  cardState: string | null | undefined,
): string | undefined {
  if (cardState == null) return undefined;
  const trimmed = String(cardState).trim();
  if (!trimmed) return undefined;
  const key = trimmed.toLowerCase().replace(/\s+/g, '_');
  if (LEGACY_CONDITION_CARD_STATES.has(key)) return 'disponible';
  return trimmed;
}

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
