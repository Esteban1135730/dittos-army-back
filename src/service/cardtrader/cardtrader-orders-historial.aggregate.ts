import { normalizeOperationalRareza } from '../../constants/item-rareza';
import type {
  CtHistorialUnitInput,
  HistorialEvent,
  HistorialVariantRow,
  LocalReservaSlice,
  LocalSaleSlice,
  LocalStockSlice,
  LocalTransitSlice,
} from './cardtrader-orders-historial.types';

const SELLABLE_STATES = new Set([
  'disponible',
  'en_stock_colombia',
  'en_stock',
]);

const RESERVED_STOCK_STATES = new Set(['reserva', 'reservada']);

export function normalizeHistorialLanguage(raw: string | null | undefined): string {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return 'en';
  if (v === 'jp') return 'ja';
  return v;
}

export function buildVariantKey(
  cardId: string,
  language: string,
  rareza: string | null | undefined,
): string {
  const id = cardId.trim();
  const lang = normalizeHistorialLanguage(language);
  const rz = normalizeOperationalRareza(rareza) ?? '';
  return `${id}|${lang}|${rz}`;
}

export function parseVariantKey(variantKey: string): {
  card_id: string;
  language: string;
  rareza: string | null;
} | null {
  const parts = variantKey.split('|');
  if (parts.length < 2) return null;
  const [card_id, language, rarezaRaw = ''] = parts;
  if (!card_id?.trim()) return null;
  return {
    card_id: card_id.trim(),
    language: normalizeHistorialLanguage(language),
    rareza: rarezaRaw.trim() ? normalizeOperationalRareza(rarezaRaw) : null,
  };
}

export type HistorialMutableRow = HistorialVariantRow & {
  _events: HistorialEvent[];
};
type MutableRow = HistorialMutableRow;

function ensureRow(
  map: Map<string, MutableRow>,
  cardId: string,
  language: string,
  rareza: string | null,
  cardName: string,
  imageUrl: string,
): MutableRow {
  const key = buildVariantKey(cardId, language, rareza);
  let row = map.get(key);
  if (!row) {
    row = {
      variant_key: key,
      card_id: cardId.trim(),
      card_name: cardName.trim() || cardId.trim(),
      language: normalizeHistorialLanguage(language),
      rareza: normalizeOperationalRareza(rareza),
      image_url: imageUrl.trim(),
      qty_ct_buy: 0,
      qty_ct_sell: 0,
      qty_transit: 0,
      qty_stock_sellable: 0,
      qty_reserved: 0,
      qty_sold_local: 0,
      last_sold_local_at: null,
      flags: { in_reserva_now: false },
      _events: [],
    };
    map.set(key, row);
  } else {
    if (!row.card_name && cardName.trim()) row.card_name = cardName.trim();
    if (!row.image_url && imageUrl.trim()) row.image_url = imageUrl.trim();
  }
  return row;
}

function stockUnits(stock: LocalStockSlice): number {
  if (stock.product_kind === 'quantity') {
    return Math.max(0, Math.floor(stock.quantity ?? 0));
  }
  return 1;
}

function pushEvent(row: MutableRow, event: HistorialEvent): void {
  row._events.push(event);
}

export function mergeCtUnits(
  map: Map<string, MutableRow>,
  units: CtHistorialUnitInput[],
): number {
  let unresolved = 0;
  for (const u of units) {
    if (u.unresolved || !u.card_id?.trim()) {
      unresolved += u.quantity;
      continue;
    }
    const row = ensureRow(
      map,
      u.card_id,
      u.language,
      u.rareza,
      u.card_name,
      u.image_url,
    );
    const at = u.paid_at || new Date(0).toISOString();
    if (u.side === 'buyer') {
      row.qty_ct_buy += u.quantity;
      pushEvent(row, {
        at,
        kind: 'ct_buy',
        label: `Compra CT ${u.order_code}`,
        quantity: u.quantity,
        refs: {
          order_id: u.order_id,
          order_code: u.order_code,
          order_state: u.order_state,
        },
      });
    } else {
      row.qty_ct_sell += u.quantity;
      pushEvent(row, {
        at,
        kind: 'ct_sell',
        label: `Venta CT ${u.order_code}`,
        quantity: u.quantity,
        refs: {
          order_id: u.order_id,
          order_code: u.order_code,
          order_state: u.order_state,
        },
      });
    }
  }
  return unresolved;
}

export function mergeLocalStock(
  map: Map<string, MutableRow>,
  stocks: LocalStockSlice[],
): void {
  for (const s of stocks) {
    if (!s.card_id?.trim()) continue;
    const state = String(s.card_state ?? '').toLowerCase();
    const units = stockUnits(s);
    if (units <= 0) continue;
    const row = ensureRow(
      map,
      s.card_id,
      s.language,
      s.rareza,
      s.card_name,
      s.image_url,
    );
    if (SELLABLE_STATES.has(state)) {
      row.qty_stock_sellable += units;
      pushEvent(row, {
        at: new Date().toISOString(),
        kind: 'stock_sellable',
        label: 'En inventario vendible',
        quantity: units,
        refs: { stock_id: s.stock_id, card_state: state },
      });
    }
    if (state === 'vendida') {
      row.qty_sold_local += units;
    }
    if (RESERVED_STOCK_STATES.has(state)) {
      row.qty_reserved += units;
      row.flags.in_reserva_now = true;
    }
  }
}

export function mergeTransit(
  map: Map<string, MutableRow>,
  lines: LocalTransitSlice[],
): void {
  for (const line of lines) {
    if (!line.card_id?.trim() || line.remaining_quantity <= 0) continue;
    const row = ensureRow(
      map,
      line.card_id,
      line.language,
      line.rareza,
      line.card_name,
      line.image_url,
    );
    row.qty_transit += line.remaining_quantity;
    pushEvent(row, {
      at: line.purchase_date ?? new Date().toISOString(),
      kind: 'transit',
      label: 'En tránsito (lote CT)',
      quantity: line.remaining_quantity,
      refs: { lot_id: line.lot_id },
    });
  }
}

export function mergeReservas(
  map: Map<string, MutableRow>,
  reservas: LocalReservaSlice[],
): void {
  for (const r of reservas) {
    if (!r.card_id?.trim()) continue;
    const qty = Math.max(1, Math.floor(r.quantity ?? 1));
    const row = ensureRow(map, r.card_id, r.language, r.rareza, '', '');
    row.qty_reserved += qty;
    row.flags.in_reserva_now = true;
    pushEvent(row, {
      at: r.created_at ?? new Date().toISOString(),
      kind: 'reserva',
      label: r.pedido_id ? 'Reserva (pedido cliente)' : 'Reserva activa',
      quantity: qty,
      refs: {
        stock_id: r.stock_id,
        pedido_id: r.pedido_id,
      },
    });
  }
}

export function mergeSales(
  map: Map<string, MutableRow>,
  sales: LocalSaleSlice[],
): void {
  for (const sale of sales) {
    if (!sale.card_id?.trim()) continue;
    const row = ensureRow(
      map,
      sale.card_id,
      sale.language,
      sale.rareza,
      '',
      '',
    );
    row.qty_sold_local += 1;
    const at = sale.created_at.toISOString();
    if (
      !row.last_sold_local_at ||
      Date.parse(at) > Date.parse(row.last_sold_local_at)
    ) {
      row.last_sold_local_at = at;
    }
    pushEvent(row, {
      at,
      kind: 'sale_local',
      label: 'Venta local',
      quantity: 1,
      refs: {
        stock_id: sale.stock_id,
        amount_cop: sale.amount_cop,
      },
    });
  }
}

export function finalizeHistorialRows(
  map: Map<string, MutableRow>,
): {
  rows: HistorialVariantRow[];
  eventsByVariant: Record<string, HistorialEvent[]>;
} {
  const rows: HistorialVariantRow[] = [];
  const eventsByVariant: Record<string, HistorialEvent[]> = {};

  for (const row of map.values()) {
    const { _events, ...rest } = row;
    rows.push(rest);
    _events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    eventsByVariant[row.variant_key] = _events;
  }

  rows.sort((a, b) => a.card_name.localeCompare(b.card_name, 'es'));
  return { rows, eventsByVariant };
}

export function filterHistorialRows(
  rows: HistorialVariantRow[],
  q: string | undefined,
): HistorialVariantRow[] {
  const needle = q?.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) =>
      r.card_name.toLowerCase().includes(needle) ||
      r.card_id.toLowerCase().includes(needle) ||
      r.variant_key.toLowerCase().includes(needle),
  );
}

export function paginateRows<T>(
  rows: T[],
  page: number,
  limit: number,
): { items: T[]; total: number } {
  const total = rows.length;
  const start = (page - 1) * limit;
  return { items: rows.slice(start, start + limit), total };
}
