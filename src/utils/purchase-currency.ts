export type CardsCostCurrency = 'EUR' | 'USD';

export function normalizeCardsCostCurrency(raw: unknown): CardsCostCurrency {
  const c = String(raw ?? 'EUR')
    .trim()
    .toUpperCase();
  if (c === 'USD') return 'USD';
  return 'EUR';
}

export function fxUnitPriceFromSentUnit(unit: {
  unit_price_fx?: number | null;
  unit_price_raw?: number | null;
  unit_price_eur?: number | null;
  purchase_price_fx?: number | null;
  purchase_price_eur?: number | null;
  price_currency?: string | null;
  purchase_price_currency?: string | null;
}): number | null {
  const candidates = [
    unit.purchase_price_fx,
    unit.unit_price_fx,
    unit.unit_price_raw,
    unit.purchase_price_eur,
    unit.unit_price_eur,
  ];
  for (const value of candidates) {
    if (value != null && value > 0) return value;
  }
  return null;
}

export function copFromFxUnit(
  fxAmount: number | null | undefined,
  copPerFxUnit: number | null | undefined,
): number | null {
  if (fxAmount == null || copPerFxUnit == null || fxAmount <= 0 || copPerFxUnit <= 0) {
    return null;
  }
  return fxAmount * copPerFxUnit;
}
