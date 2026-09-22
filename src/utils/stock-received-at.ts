import { Types } from 'mongoose';

export type ReceivedAtSource = 'stocked_at' | 'objectid' | 'missing';

/**
 * Fecha de ingreso a inventario (parcial OK):
 * 1) `stocked_at` si existe
 * 2) timestamp embebido en `_id` ObjectId (casi siempre disponible en Mongo)
 * 3) missing
 */
export function resolveStockReceivedAt(stock: {
  stocked_at?: Date | string | null;
  _id?: unknown;
}): { date: Date | null; source: ReceivedAtSource } {
  if (stock.stocked_at != null && stock.stocked_at !== '') {
    const d = new Date(stock.stocked_at);
    if (!Number.isNaN(d.getTime())) {
      return { date: d, source: 'stocked_at' };
    }
  }
  const raw = stock._id;
  if (raw == null) {
    return { date: null, source: 'missing' };
  }
  const idStr =
    typeof raw === 'object' &&
    raw !== null &&
    'toString' in raw &&
    typeof (raw as { toString(): string }).toString === 'function'
      ? (raw as { toString(): string }).toString()
      : String(raw);
  if (!Types.ObjectId.isValid(idStr)) {
    return { date: null, source: 'missing' };
  }
  try {
    const oid = raw instanceof Types.ObjectId ? raw : new Types.ObjectId(idStr);
    return { date: oid.getTimestamp(), source: 'objectid' };
  } catch {
    return { date: null, source: 'missing' };
  }
}
