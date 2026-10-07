import type { CtOrder, CtOrderItem } from '../../utils/cardtrader-sent-units';
import {
  inferSentUnitRareza,
  normalizeCtOrdersResponse,
} from '../../utils/cardtrader-sent-units';
import type { CtHistorialUnitInput } from './cardtrader-orders-historial.types';

const EXCLUDED_ORDER_STATES = new Set([
  'canceled',
  'request_for_cancel',
  'lost',
]);

function readCtLanguage(
  properties: Record<string, unknown> | undefined,
): string {
  const lang = properties?.pokemon_language ?? properties?.language;
  return typeof lang === 'string' ? lang.trim() : '';
}

function readCollectorNumber(
  properties: Record<string, unknown> | undefined,
): string | undefined {
  const n = properties?.collector_number ?? properties?.number;
  if (n == null) return undefined;
  const s = String(n).trim();
  return s || undefined;
}

export function filterHistorialOrders(orders: CtOrder[]): CtOrder[] {
  return orders.filter((o) => {
    const s = String(o.state ?? '').toLowerCase();
    return s.length > 0 && !EXCLUDED_ORDER_STATES.has(s);
  });
}

export type CtItemResolveKey = {
  key: string;
  expansionName?: string;
  expansionId?: number;
  collectorNumber?: string;
  cardName?: string;
  language?: string;
  blueprint_id?: number;
};

export function resolveKeyFromOrderItem(item: CtOrderItem): CtItemResolveKey {
  const blueprint_id =
    typeof item.blueprint_id === 'number' && item.blueprint_id > 0
      ? item.blueprint_id
      : undefined;
  const language = readCtLanguage(item.properties);
  const collectorNumber = readCollectorNumber(item.properties);
  const expansionName = item.expansion?.trim() || undefined;
  const key = [
    blueprint_id ?? '',
    expansionName ?? '',
    collectorNumber ?? '',
    language,
    item.name?.trim() ?? '',
  ].join('::');
  return {
    key,
    expansionName,
    collectorNumber,
    cardName: item.name?.trim() || undefined,
    language: language || undefined,
    blueprint_id,
  };
}

export function expandCtOrdersToHistorialUnits(args: {
  orders: CtOrder[];
  side: 'buyer' | 'seller';
  cardIdByResolveKey: Map<string, string | null>;
}): CtHistorialUnitInput[] {
  const units: CtHistorialUnitInput[] = [];
  for (const order of filterHistorialOrders(args.orders)) {
    const items = order.order_items ?? [];
    const paidAt =
      order.paid_at ??
      order.sent_at ??
      items[0]?.created_at ??
      String(order.id);

    for (const item of items) {
      const qty = Math.max(1, Math.floor(item.quantity ?? 1));
      const resolveKey = resolveKeyFromOrderItem(item);
      const cardId = args.cardIdByResolveKey.get(resolveKey.key) ?? null;
      const rareza = inferSentUnitRareza(
        item.expansion ?? '',
        item.properties,
      );
      units.push({
        side: args.side,
        order_id: order.id,
        order_code: order.code,
        order_state: order.state,
        paid_at: paidAt,
        card_id: cardId,
        card_name: item.name ?? '',
        language: readCtLanguage(item.properties) || 'en',
        rareza,
        image_url: '',
        quantity: qty,
        unresolved: !cardId,
      });
    }
  }
  return units;
}

export { normalizeCtOrdersResponse };
