import { fxUnitPriceFromSentUnit } from './purchase-currency';

export const FALLBACK_NOVEDAD_UNIT_COST_COP = 1;

export type HomologTrmRates = {
  euro_to_cop: number;
  usd_to_cop: number;
};

export function copFromHomologTrm(
  fxAmount: number | null | undefined,
  currency: string | null | undefined,
  rates: HomologTrmRates,
): number | null {
  if (fxAmount == null || !Number.isFinite(fxAmount) || fxAmount <= 0) {
    return null;
  }
  const c = String(currency ?? 'USD')
    .trim()
    .toUpperCase();
  const copPerUnit = c === 'EUR' ? rates.euro_to_cop : rates.usd_to_cop;
  if (!Number.isFinite(copPerUnit) || copPerUnit <= 0) return null;
  return fxAmount * copPerUnit;
}

export function resolveHomologNovedadUnitCostCop(
  unit: {
    unit_cost_cop?: number | null;
    unit_price_fx?: number | null;
    unit_price_eur?: number | null;
    purchase_price_fx?: number | null;
    purchase_price_eur?: number | null;
    price_currency?: string | null;
    purchase_price_currency?: string | null;
  },
  rates: HomologTrmRates,
  ctCatalog?: {
    unit_price_raw?: number;
    unit_price_eur?: number | null;
    price_currency?: string;
  } | null,
): number {
  if (unit.unit_cost_cop != null && unit.unit_cost_cop > 0) {
    return unit.unit_cost_cop;
  }

  const fx = fxUnitPriceFromSentUnit({
    ...unit,
    unit_price_fx:
      unit.unit_price_fx ??
      (ctCatalog?.unit_price_raw != null && ctCatalog.unit_price_raw > 0
        ? ctCatalog.unit_price_raw
        : null),
    unit_price_eur: unit.unit_price_eur ?? ctCatalog?.unit_price_eur ?? null,
    price_currency: unit.price_currency ?? ctCatalog?.price_currency ?? 'USD',
  });

  if (fx == null || fx <= 0) {
    return FALLBACK_NOVEDAD_UNIT_COST_COP;
  }

  const currency =
    unit.purchase_price_currency ??
    unit.price_currency ??
    ctCatalog?.price_currency ??
    'USD';

  return (
    copFromHomologTrm(fx, currency, rates) ?? FALLBACK_NOVEDAD_UNIT_COST_COP
  );
}
