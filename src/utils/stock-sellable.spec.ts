import {
  evaluateStockSellable,
  normalizeInventoryCardState,
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

  it('rechaza near_mint (condición legacy, no inventario)', () => {
    expect(evaluateStockSellable('near_mint', 1000)).toEqual({
      sellable: false,
      reject_reason: 'estado_no_vendible' satisfies StockSellRejectReason,
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

describe('normalizeInventoryCardState', () => {
  it('mapea condiciones físicas a disponible', () => {
    expect(normalizeInventoryCardState('near_mint')).toBe('disponible');
    expect(normalizeInventoryCardState('Mint')).toBe('disponible');
    expect(normalizeInventoryCardState('Near Mint')).toBe('disponible');
    expect(normalizeInventoryCardState('played')).toBe('disponible');
    expect(normalizeInventoryCardState('good')).toBe('disponible');
    expect(normalizeInventoryCardState('poor')).toBe('disponible');
  });

  it('conserva estados de inventario', () => {
    expect(normalizeInventoryCardState('disponible')).toBe('disponible');
    expect(normalizeInventoryCardState('en_stock_colombia')).toBe(
      'en_stock_colombia',
    );
    expect(normalizeInventoryCardState('reserva')).toBe('reserva');
    expect(normalizeInventoryCardState('vendida')).toBe('vendida');
    expect(normalizeInventoryCardState('propiedad')).toBe('propiedad');
  });

  it('tolera vacío / null', () => {
    expect(normalizeInventoryCardState(null)).toBeUndefined();
    expect(normalizeInventoryCardState('')).toBeUndefined();
    expect(normalizeInventoryCardState('  ')).toBeUndefined();
  });
});
