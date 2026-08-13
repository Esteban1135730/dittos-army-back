import { amountToCop, stockLineCostCop } from './stock-line-cost-cop';

describe('stockLineCostCop', () => {
  beforeEach(() => {
    process.env.EUR_TO_COP = '5000';
    process.env.USD_TO_COP = '4500';
  });

  it('calcula costo COP con shipment + unity_cost', () => {
    expect(
      stockLineCostCop({
        shipment: 100,
        cards_in_shipmet: 10,
        unity_cost: 5,
        currency: 'COP',
      }),
    ).toBe(15);
  });

  it('usa divisor 1 si cards_in_shipmet es 0', () => {
    expect(
      stockLineCostCop({
        shipment: 20,
        cards_in_shipmet: 0,
        unity_cost: 10,
        currency: 'COP',
      }),
    ).toBe(30);
  });

  it('aplica FX EUR', () => {
    expect(
      stockLineCostCop({
        shipment: 0,
        cards_in_shipmet: 1,
        unity_cost: 2,
        currency: 'EUR',
      }),
    ).toBe(10000);
  });
});

describe('amountToCop', () => {
  it('redondea COP', () => {
    expect(amountToCop(10.4, 'COP')).toBe(10);
  });
});
