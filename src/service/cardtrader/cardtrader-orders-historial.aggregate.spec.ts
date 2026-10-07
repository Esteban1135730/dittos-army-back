import {
  buildVariantKey,
  finalizeHistorialRows,
  mergeCtUnits,
  mergeReservas,
  mergeSales,
  type HistorialMutableRow,
} from './cardtrader-orders-historial.aggregate';

describe('cardtrader-orders-historial.aggregate', () => {
  it('suma compras CT de la misma variante', () => {
    const map = new Map<string, HistorialMutableRow>();
    mergeCtUnits(map, [
      {
        side: 'buyer',
        order_id: 1,
        order_code: 'A',
        order_state: 'sent',
        paid_at: '2026-01-01T00:00:00.000Z',
        card_id: 'sv08-001',
        card_name: 'Pikachu',
        language: 'en',
        rareza: 'foil',
        image_url: '',
        quantity: 2,
        unresolved: false,
      },
      {
        side: 'buyer',
        order_id: 2,
        order_code: 'B',
        order_state: 'sent',
        paid_at: '2026-02-01T00:00:00.000Z',
        card_id: 'sv08-001',
        card_name: 'Pikachu',
        language: 'en',
        rareza: 'foil',
        image_url: '',
        quantity: 1,
        unresolved: false,
      },
    ]);
    const { rows } = finalizeHistorialRows(map);
    expect(rows).toHaveLength(1);
    expect(rows[0].qty_ct_buy).toBe(3);
  });

  it('separa rarezas distintas', () => {
    const map = new Map<string, HistorialMutableRow>();
    mergeCtUnits(map, [
      {
        side: 'buyer',
        order_id: 1,
        order_code: 'A',
        order_state: 'sent',
        paid_at: '2026-01-01T00:00:00.000Z',
        card_id: 'sv08-001',
        card_name: 'Pikachu',
        language: 'en',
        rareza: 'foil',
        image_url: '',
        quantity: 1,
        unresolved: false,
      },
      {
        side: 'buyer',
        order_id: 1,
        order_code: 'A',
        order_state: 'sent',
        paid_at: '2026-01-01T00:00:00.000Z',
        card_id: 'sv08-001',
        card_name: 'Pikachu',
        language: 'en',
        rareza: null,
        image_url: '',
        quantity: 1,
        unresolved: false,
      },
    ]);
    const { rows } = finalizeHistorialRows(map);
    expect(rows).toHaveLength(2);
    expect(buildVariantKey('sv08-001', 'en', 'foil')).not.toBe(
      buildVariantKey('sv08-001', 'en', null),
    );
  });

  it('marca reserva activa y venta local con fecha', () => {
    const map = new Map<string, HistorialMutableRow>();
    mergeReservas(map, [
      {
        stock_id: 's1',
        card_id: 'sv08-002',
        language: 'es',
        rareza: null,
        quantity: 1,
        created_at: '2026-03-01T00:00:00.000Z',
        pedido_id: 'ped1',
      },
    ]);
    mergeSales(map, [
      {
        card_id: 'sv08-002',
        language: 'es',
        rareza: null,
        created_at: new Date('2026-04-01T00:00:00.000Z'),
        stock_id: 's2',
        amount_cop: 10000,
      },
    ]);
    const { rows } = finalizeHistorialRows(map);
    expect(rows[0].qty_reserved).toBe(1);
    expect(rows[0].flags.in_reserva_now).toBe(true);
    expect(rows[0].qty_sold_local).toBe(1);
    expect(rows[0].last_sold_local_at).toBe('2026-04-01T00:00:00.000Z');
  });
});
