export const STORE_DEMAND_WINDOW_DAYS = 90;

export function storeDemandWindowUtc(now = new Date()): {
  from: Date;
  to: Date;
} {
  const to = new Date(now.getTime());
  const from = new Date(
    to.getTime() - STORE_DEMAND_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  return { from, to };
}

/**
 * Cada venta tipo `venta` = 1 unidad (igual que métricas 036: `card.units += 1`).
 */
export function countSoldUnitsByCardId(
  sales: Array<{ card_id?: string | null }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sale of sales) {
    const key =
      sale.card_id && String(sale.card_id).trim()
        ? String(sale.card_id)
        : 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function soldUnits90dForCard(
  cardId: string,
  counts: Map<string, number> | null | undefined,
): number {
  if (!counts) return 0;
  return counts.get(cardId) ?? 0;
}

export function applySoldUnits90d<T extends { card_id: string }>(
  items: T[],
  counts: Map<string, number> | null | undefined,
): Array<T & { sold_units_90d: number }> {
  return items.map((item) => ({
    ...item,
    sold_units_90d: soldUnits90dForCard(item.card_id, counts),
  }));
}

/** Filtra ventas por `created_at` en [from, to] (inclusive), para tests del recorte 90d. */
export function filterSalesInWindow<
  T extends { created_at?: Date | string | null },
>(sales: T[], from: Date, to: Date): T[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  return sales.filter((s) => {
    if (s.created_at == null) return false;
    const ms = new Date(s.created_at).getTime();
    if (Number.isNaN(ms)) return false;
    return ms >= fromMs && ms <= toMs;
  });
}
