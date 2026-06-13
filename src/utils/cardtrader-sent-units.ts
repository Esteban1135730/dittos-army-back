export type CtOrderMoney = {
  cents?: number;
  currency?: string;
};

export type CtOrderItem = {
  id: number;
  name: string;
  quantity?: number;
  expansion?: string;
  blueprint_id?: number;
  buyer_price?: CtOrderMoney;
  seller_price?: CtOrderMoney;
  properties?: Record<string, unknown>;
  created_at?: string;
};

export type CtOrder = {
  id: number;
  code: string;
  state: string;
  paid_at?: string;
  sent_at?: string;
  order_items?: CtOrderItem[];
};

export type ParsedSentUnit = {
  unit_key: string;
  line_key: string;
  unit_index: number;
  order_id: number;
  order_code: string;
  order_item_id: number;
  name: string;
  expansion: string;
  language: string;
  blueprint_id: number;
  collector_number: string | null;
  rareza: string | null;
  unit_price_eur: number | null;
  price_currency: string;
  unit_price_raw: number;
  paid_at: string;
  sent_at: string | null;
  order_state: string;
  properties: Record<string, unknown>;
};

function moneyToUnits(money: CtOrderMoney | undefined): number {
  if (!money || typeof money.cents !== 'number') return 0;
  return money.cents / 100;
}

function readCtLanguage(properties: Record<string, unknown> | undefined): string {
  const lang = properties?.pokemon_language ?? properties?.language;
  return typeof lang === 'string' ? lang.trim() : '';
}

function inferRarezaFromCtExpansion(expansion: string): string | null {
  const e = expansion.toLowerCase();
  if (e.includes('master ball') || e.includes('masterball')) return 'masterball';
  if (e.includes('poke ball') || e.includes('pokeball') || e.includes('poké ball')) {
    return 'pokeball';
  }
  if (e.includes('reverse holo') || e.includes('reverse holofoil')) return 'foil';
  return null;
}

function isActiveTruthy(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (!s || s === 'false' || s === 'no' || s === 'none' || s === '0') return false;
    return true;
  }
  if (typeof value === 'number') return value !== 0;
  return false;
}

function inferRarezaFromCtProperties(
  props: Record<string, unknown> | undefined,
): string | null {
  if (!props) return null;
  if (isActiveTruthy(props.first_edition)) return 'first edition';
  if (isActiveTruthy(props.master_ball_reverse_holo)) return 'masterball';
  if (isActiveTruthy(props.poke_ball_reverse_holo)) return 'pokeball';
  if (
    isActiveTruthy(props.reverse) ||
    isActiveTruthy(props.pokemon_reverse) ||
    isActiveTruthy(props.reverse_holo)
  ) {
    return 'foil';
  }
  if (
    isActiveTruthy(props.foil) ||
    isActiveTruthy(props.pokemon_foil) ||
    isActiveTruthy(props.mtg_foil) ||
    isActiveTruthy(props.holofoil)
  ) {
    return 'foil';
  }
  return null;
}

export function inferSentUnitRareza(
  expansion: string,
  properties?: Record<string, unknown>,
): string | null {
  return inferRarezaFromCtProperties(properties) ?? inferRarezaFromCtExpansion(expansion);
}

function readCollectorNumber(
  properties: Record<string, unknown> | undefined,
): string | null {
  const n = properties?.collector_number ?? properties?.number;
  if (n == null) return null;
  const s = String(n).trim();
  return s || null;
}

export function normalizeCtOrdersResponse(raw: unknown): CtOrder[] {
  if (Array.isArray(raw)) return raw as CtOrder[];
  if (raw && typeof raw === 'object') {
    const obj = raw as { data?: unknown; orders?: unknown };
    if (Array.isArray(obj.data)) return obj.data as CtOrder[];
    if (Array.isArray(obj.orders)) return obj.orders as CtOrder[];
  }
  return [];
}

export function filterSentOrders(orders: CtOrder[]): CtOrder[] {
  return orders.filter((o) => String(o.state ?? '').toLowerCase() === 'sent');
}

export function expandSentUnitsFromOrders(orders: CtOrder[]): ParsedSentUnit[] {
  const units: ParsedSentUnit[] = [];

  for (const order of filterSentOrders(orders)) {
    const items = order.order_items ?? [];
    if (items.length === 0) continue;

    const paidAt =
      order.paid_at ??
      order.sent_at ??
      items[0]?.created_at ??
      String(order.id);
    const sentAt = order.sent_at ?? null;

    for (const item of items) {
      const qty = Math.max(1, Math.floor(item.quantity ?? 1));
      const money = item.buyer_price ?? item.seller_price;
      const amount = moneyToUnits(money);
      const currency = money?.currency ?? 'EUR';
      const eur = currency === 'EUR' ? amount : null;
      const lineKey = `order-${order.id}-${item.id}`;

      for (let unitIndex = 0; unitIndex < qty; unitIndex++) {
        units.push({
          unit_key: `${lineKey}#${unitIndex}`,
          line_key: lineKey,
          unit_index: unitIndex,
          order_id: order.id,
          order_code: order.code,
          order_item_id: item.id,
          name: item.name,
          expansion: item.expansion ?? '',
          language: readCtLanguage(item.properties),
          blueprint_id: item.blueprint_id ?? 0,
          collector_number: readCollectorNumber(item.properties),
          rareza: inferSentUnitRareza(item.expansion ?? '', item.properties),
          unit_price_eur: eur,
          price_currency: currency,
          unit_price_raw: amount,
          paid_at: paidAt,
          sent_at: sentAt,
          order_state: order.state,
          properties: item.properties ?? {},
        });
      }
    }
  }

  units.sort((a, b) => Date.parse(b.paid_at) - Date.parse(a.paid_at));
  return units;
}
