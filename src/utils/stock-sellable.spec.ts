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
});
