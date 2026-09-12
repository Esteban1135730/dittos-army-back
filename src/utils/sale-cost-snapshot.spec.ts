import { enrichSaleCreatePayload } from './sale-cost-snapshot';

describe('enrichSaleCreatePayload', () => {
  beforeEach(() => {
    process.env.EUR_TO_COP = '5000';
  });

  it('persiste cost_cop_snapshot, received_at y metadatos', () => {
    const payload = enrichSaleCreatePayload(
      {
        stock_id: 's1',
        card_id: 'c1',
        type: 'venta',
        amount_cop: 50000,
      },
      {
        shipment: 100,
        cards_in_shipmet: 10,
        unity_cost: 5,
        currency: 'COP',
        product_kind: 'unit',
        rareza: 'holofoil',
        stocked_at: new Date('2026-01-01T00:00:00.000Z'),
        _id: '507f1f77bcf86cd799439011',
      },
      { pvp_cop_snapshot: 55000, tags_snapshot: ['jugable'] },
    );

    expect(payload.cost_cop_snapshot).toBe(15);
    expect(payload.product_kind_snapshot).toBe('unit');
    expect(payload.rareza_snapshot).toBe('holofoil');
    expect(payload.pvp_cop_snapshot).toBe(55000);
    expect(payload.amount_cop).toBe(50000);
    expect(payload.received_at_snapshot?.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(payload.tags_snapshot).toEqual(['jugable']);
  });

  it('envio persiste costo = amount para ganancia 0 y conserva el precio', () => {
    const payload = enrichSaleCreatePayload(
      {
        stock_id: 's-env',
        card_id: 'da-envio',
        type: 'venta',
        amount_cop: 8000,
      },
      {
        shipment: 0,
        cards_in_shipmet: 1,
        unity_cost: 0,
        currency: 'COP',
        product_kind: 'quantity',
      },
    );

    expect(payload.amount_cop).toBe(8000);
    expect(payload.cost_cop_snapshot).toBe(8000);
  });

  it('usa 0 si el costo no es finito (stock vacío)', () => {
    const payload = enrichSaleCreatePayload(
      { type: 'venta', amount_cop: 100 },
      {
        shipment: undefined as unknown as number,
        cards_in_shipmet: undefined as unknown as number,
        unity_cost: undefined as unknown as number,
        currency: 'COP',
      },
    );
    expect(payload.cost_cop_snapshot).toBe(0);
  });
});
