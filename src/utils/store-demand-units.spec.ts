import {
  applySoldUnits90d,
  countSoldUnitsByCardId,
  filterSalesInWindow,
  soldUnits90dForCard,
  storeDemandWindowUtc,
} from './store-demand-units';

describe('countSoldUnitsByCardId', () => {
  it('cada venta = 1 unidad; agrupa por card_id', () => {
    const counts = countSoldUnitsByCardId([
      { card_id: 'sv08-130' },
      { card_id: 'sv08-130' },
      { card_id: 'sv01-1' },
    ]);
    expect(counts.get('sv08-130')).toBe(2);
    expect(counts.get('sv01-1')).toBe(1);
  });

  it('sin ventas → mapa vacío; carta sin ventas → 0', () => {
    const counts = countSoldUnitsByCardId([]);
    expect(soldUnits90dForCard('sv08-130', counts)).toBe(0);
  });
});

describe('storeDemandWindowUtc + filterSalesInWindow', () => {
  it('venta en ventana 90d cuenta; venta de hace 120d no cuenta', () => {
    const now = new Date('2026-08-12T20:00:00.000Z');
    const { from, to } = storeDemandWindowUtc(now);
    const saleInWindow = new Date('2026-07-01T00:00:00.000Z');
    const sale120d = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);

    const sales = [
      { card_id: 'sv08-130', created_at: saleInWindow },
      { card_id: 'sv08-130', created_at: sale120d },
      { card_id: 'other', created_at: saleInWindow },
    ];
    const inWindow = filterSalesInWindow(sales, from, to);
    const counts = countSoldUnitsByCardId(inWindow);
    expect(counts.get('sv08-130')).toBe(1);
    expect(counts.get('other')).toBe(1);
  });
});

describe('applySoldUnits90d', () => {
  it('inyecta recuento por card_id; sin ventas → 0', () => {
    const counts = countSoldUnitsByCardId([{ card_id: 'alpha' }]);
    const rows = applySoldUnits90d(
      [
        { card_id: 'alpha', name: 'A' },
        { card_id: 'beta', name: 'B' },
      ],
      counts,
    );
    expect(rows[0].sold_units_90d).toBe(1);
    expect(rows[1].sold_units_90d).toBe(0);
  });

  it('si el recuento falla (counts null) todas las líneas quedan en 0', () => {
    const rows = applySoldUnits90d(
      [{ card_id: 'alpha' }, { card_id: 'beta' }],
      null,
    );
    expect(rows.every((r) => r.sold_units_90d === 0)).toBe(true);
  });
});
