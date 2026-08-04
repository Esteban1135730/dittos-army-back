import {
  evaluateStockSellable,
  type StockSellRejectReason,
} from './stock-sellable';

describe('stock-sellable', () => {
  it('acepta disponible con PVP', () => {
    expect(evaluateStockSellable('disponible', 1000)).toEqual({
      sellable: true,
    });
  });

  it('rechaza sin PVP', () => {
    expect(evaluateStockSellable('disponible', null)).toEqual({
      sellable: false,
      reject_reason: 'sin_pvp',
    });
  });

  it('rechaza vendida', () => {
    expect(evaluateStockSellable('vendida', 1000)).toEqual({
      sellable: false,
      reject_reason: 'ya_vendida',
    });
  });

  it('rechaza reserva', () => {
    expect(evaluateStockSellable('reserva', 1000)).toEqual({
      sellable: false,
      reject_reason: 'reservada',
    });
  });

  it('rechaza propiedad', () => {
    expect(evaluateStockSellable('propiedad', 1000)).toEqual({
      sellable: false,
      reject_reason: 'propiedad',
    });
  });

  it('rechaza quantity product sin stock', () => {
    expect(
      evaluateStockSellable('disponible', 2000, {
        product_kind: 'quantity',
        quantity: 0,
      }),
    ).toEqual({
      sellable: false,
      reject_reason: 'sin_stock',
    });
  });

  it('acepta quantity product con stock', () => {
    expect(
      evaluateStockSellable('disponible', 2000, {
        product_kind: 'quantity',
        quantity: 5,
      }),
    ).toEqual({ sellable: true });
  });
});
