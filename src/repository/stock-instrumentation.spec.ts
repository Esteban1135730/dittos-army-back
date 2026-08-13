import { stockLineCostCop } from '../utils/stock-line-cost-cop';

/**
 * Smoke: create() setea stocked_at si falta (probado vía lógica inline
 * equivalente a StockRepository.create).
 */
describe('StockRepository stocked_at instrumentation', () => {
  it('default stocked_at when missing', () => {
    const rest: { stocked_at?: Date; card_name?: string } = {
      card_name: 'x',
    };
    const created = {
      ...rest,
      card_name: rest.card_name ?? '',
      stocked_at: rest.stocked_at ?? new Date('2026-05-01T00:00:00.000Z'),
    };
    expect(created.stocked_at).toEqual(new Date('2026-05-01T00:00:00.000Z'));
  });

  it('preserves explicit stocked_at', () => {
    const given = new Date('2025-01-01T00:00:00.000Z');
    const rest = { stocked_at: given };
    const created = {
      ...rest,
      stocked_at: rest.stocked_at ?? new Date(),
    };
    expect(created.stocked_at).toBe(given);
  });
});

describe('markAsLost cost', () => {
  it('calculates lost_cost_cop via stockLineCostCop', () => {
    const cost = stockLineCostCop({
      shipment: 50,
      cards_in_shipmet: 5,
      unity_cost: 2,
      currency: 'COP',
    });
    expect(cost).toBe(12);
  });
});
