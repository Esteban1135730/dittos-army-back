import {
  expandSentUnitsFromOrders,
  filterSentOrders,
} from './cardtrader-sent-units';

describe('cardtrader-sent-units', () => {
  it('solo incluye pedidos sent', () => {
    const orders = [
      { id: 1, code: 'A', state: 'sent', order_items: [] },
      { id: 2, code: 'B', state: 'paid', order_items: [] },
    ];
    expect(filterSentOrders(orders as any).map((o) => o.id)).toEqual([1]);
  });

  it('expande qty en unidades individuales', () => {
    const orders = [
      {
        id: 10,
        code: 'ORD-10',
        state: 'sent',
        paid_at: '2026-01-01T00:00:00Z',
        order_items: [
          {
            id: 99,
            name: 'Pikachu',
            quantity: 2,
            expansion: 'Base',
            product_id: 555001,
            blueprint_id: 123,
            buyer_price: { cents: 150, currency: 'EUR' },
            properties: { pokemon_language: 'EN' },
          },
        ],
      },
    ];
    const units = expandSentUnitsFromOrders(orders as any);
    expect(units).toHaveLength(2);
    expect(units[0].unit_key).toBe('order-10-99#0');
    expect(units[1].unit_key).toBe('order-10-99#1');
    expect(units[0].unit_price_eur).toBe(1.5);
    expect(units[0].language).toBe('EN');
    expect(units[0].product_id).toBe(555001);
  });

  it('infiere rareza pokeball desde expansion', () => {
    const orders = [
      {
        id: 11,
        code: 'ORD-11',
        state: 'sent',
        paid_at: '2026-01-01T00:00:00Z',
        order_items: [
          {
            id: 1,
            name: 'Dreepy',
            quantity: 1,
            expansion: 'Prismatic Evolutions - Poké Ball Reverse Holo',
            blueprint_id: 1,
            buyer_price: { cents: 90, currency: 'USD' },
            properties: {},
          },
        ],
      },
    ];
    const units = expandSentUnitsFromOrders(orders as any);
    expect(units[0].rareza).toBe('pokeball');
    expect(units[0].unit_price_raw).toBe(0.9);
    expect(units[0].price_currency).toBe('USD');
  });
});
