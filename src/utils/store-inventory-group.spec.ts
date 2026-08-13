import { Types } from 'mongoose';
import { groupStockUnitsByLine } from './store-inventory-group';
import { latestStockedAtIso } from './store-line-stocked-at';

describe('latestStockedAtIso', () => {
  it('elige la fecha más reciente', () => {
    const older = new Date('2026-01-01T00:00:00.000Z');
    const newer = new Date('2026-06-15T12:00:00.000Z');
    expect(
      latestStockedAtIso([{ stocked_at: older }, { stocked_at: newer }]),
    ).toBe(newer.toISOString());
  });

  it('sin fecha resoluble → null', () => {
    expect(latestStockedAtIso([{}, { stocked_at: 'no-es-fecha' }])).toBeNull();
  });
});

describe('groupStockUnitsByLine', () => {
  it('dos stock mismo lineId y fechas distintas → un ítem, quantity 2, stocked_at más nueva', () => {
    const older = new Date('2026-01-10T00:00:00.000Z');
    const newer = new Date('2026-07-01T08:00:00.000Z');
    const groups = groupStockUnitsByLine([
      {
        card_id: 'sv08-130',
        language: 'en',
        rareza: null,
        stocked_at: older,
      },
      {
        card_id: 'sv08-130',
        language: 'en',
        rareza: null,
        stocked_at: newer,
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].lineId).toBe('sv08-130::en::');
    expect(groups[0].quantity).toBe(2);
    expect(groups[0].stocked_at).toBe(newer.toISOString());
  });

  it('sin stocked_at ni id parseable → stocked_at null', () => {
    const groups = groupStockUnitsByLine([
      { card_id: 'sv08-130', language: 'en', rareza: 'foil' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].quantity).toBe(1);
    expect(groups[0].stocked_at).toBeNull();
  });

  it('usa timestamp ObjectId si no hay stocked_at', () => {
    const oid = new Types.ObjectId();
    const groups = groupStockUnitsByLine([
      { card_id: 'sv01-1', language: 'es', _id: oid },
    ]);
    expect(groups[0].stocked_at).toBe(oid.getTimestamp().toISOString());
  });
});
