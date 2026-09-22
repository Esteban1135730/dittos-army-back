import type { Stock } from '../schema/stock.schema';

/** Convierte monto a COP (misma lógica que dashboard / ventas). */
export function amountToCop(amount: number, currency: string): number {
  if (currency === 'COP') return Math.round(amount);
  if (currency === 'EUR') {
    const rate = parseFloat(process.env.EUR_TO_COP || '0') || 5000;
    return Math.round(amount * rate);
  }
  if (currency === 'USD') {
    const rate = parseFloat(process.env.USD_TO_COP || '0') || 4500;
    return Math.round(amount * rate);
  }
  return Math.round(amount);
}

/**
 * Costo de línea en COP:
 * `(shipment / cards_in_shipmet) + unity_cost` → FX a COP.
 * Usa `cards_in_shipmet || 1` para evitar división por cero.
 */
export function stockLineCostCop(
  stock: Pick<
    Stock,
    'shipment' | 'unity_cost' | 'cards_in_shipmet' | 'currency'
  >,
): number {
  const cardsInShipment = stock.cards_in_shipmet || 1;
  const unitCost =
    (stock.shipment ?? 0) / cardsInShipment + (stock.unity_cost ?? 0);
  return amountToCop(unitCost, stock.currency ?? 'COP');
}
