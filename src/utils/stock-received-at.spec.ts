import { resolveStockReceivedAt } from './stock-received-at';

describe('resolveStockReceivedAt', () => {
  it('prioriza stocked_at', () => {
    const d = new Date('2026-01-15T12:00:00.000Z');
    const res = resolveStockReceivedAt({
      stocked_at: d,
      _id: '507f1f77bcf86cd799439011',
    });
    expect(res.source).toBe('stocked_at');
    expect(res.date?.toISOString()).toBe(d.toISOString());
  });

  it('usa timestamp de ObjectId si no hay stocked_at', () => {
    const res = resolveStockReceivedAt({
      _id: '507f1f77bcf86cd799439011',
    });
    expect(res.source).toBe('objectid');
    expect(res.date).toBeInstanceOf(Date);
    expect(Number.isNaN(res.date!.getTime())).toBe(false);
  });

  it('missing sin id ni stocked_at', () => {
    expect(resolveStockReceivedAt({}).source).toBe('missing');
  });
});
