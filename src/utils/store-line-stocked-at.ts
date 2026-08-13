import { resolveStockReceivedAt } from './stock-received-at';

/**
 * ISO de la fecha de recepción más reciente entre unidades.
 * Si ninguna resuelve fecha, `null`.
 */
export function latestStockedAtIso(
  units: Array<{ stocked_at?: Date | string | null; _id?: unknown }>,
): string | null {
  let maxMs = -Infinity;
  let found = false;
  for (const unit of units) {
    const { date } = resolveStockReceivedAt(unit);
    if (date == null) continue;
    const ms = date.getTime();
    if (ms > maxMs) {
      maxMs = ms;
      found = true;
    }
  }
  return found ? new Date(maxMs).toISOString() : null;
}
