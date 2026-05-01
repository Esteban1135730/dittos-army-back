import {
  effectiveOperationalRarezaFromStock,
  groupPvpsByCardId,
  resolvePvpForLine,
  stockLineRareza,
} from './pvp-resolve';
import { normalizeOperationalRareza } from '../constants/item-rareza';

describe('stockLineRareza', () => {
  it('normaliza vacío a null', () => {
    expect(stockLineRareza(undefined)).toBeNull();
    expect(stockLineRareza(null)).toBeNull();
    expect(stockLineRareza('  ')).toBeNull();
  });

  it('preserva valor', () => {
    expect(stockLineRareza('foil')).toBe('foil');
    expect(stockLineRareza('league card')).toBe('league card');
    expect(stockLineRareza('holofoil')).toBe('holofoil');
  });

  it('alias league_card → league card', () => {
    expect(normalizeOperationalRareza('league_card')).toBe('league card');
    expect(stockLineRareza('League_Card')).toBe('league card');
  });
});

describe('effectiveOperationalRarezaFromStock', () => {
  it('usa rareza del campo si existe', () => {
    expect(
      effectiveOperationalRarezaFromStock({
        rareza: 'foil',
        league_card: true,
      }),
    ).toBe('foil');
  });

  it('liga sin campo rareza', () => {
    expect(
      effectiveOperationalRarezaFromStock({ league_card: true }),
    ).toBe('league card');
  });

  it('holofoil sin campo rareza', () => {
    expect(effectiveOperationalRarezaFromStock({ holofoil: true })).toBe(
      'holofoil',
    );
  });
});

describe('resolvePvpForLine', () => {
  const base = { card_id: 'c1', pvp: 10, currency: 'COP', rareza: null as string | null };
  const foil = { card_id: 'c1', pvp: 25, currency: 'COP', rareza: 'foil' };

  it('usa variante si existe', () => {
    expect(resolvePvpForLine([base, foil], 'foil')).toEqual({
      pvp: 25,
      pvp_currency: 'COP',
    });
  });

  it('sin variante usa base', () => {
    expect(resolvePvpForLine([base, foil], null)).toEqual({
      pvp: 10,
      pvp_currency: 'COP',
    });
  });

  it('variante sin doc cae a base', () => {
    expect(resolvePvpForLine([base], 'pokeball')).toEqual({
      pvp: 10,
      pvp_currency: 'COP',
    });
  });

  it('solo variante sin base: coincide variante', () => {
    expect(resolvePvpForLine([foil], 'foil')).toEqual({
      pvp: 25,
      pvp_currency: 'COP',
    });
  });

  it('solo variante sin base y línea sin rareza → undefined', () => {
    expect(resolvePvpForLine([foil], null)).toBeUndefined();
  });

  it('línea con rareza sin ningún PVP → undefined', () => {
    expect(resolvePvpForLine([], 'foil')).toBeUndefined();
  });
});

describe('groupPvpsByCardId', () => {
  it('agrupa por card_id', () => {
    const m = groupPvpsByCardId([
      { card_id: 'a', pvp: 1, currency: 'COP' },
      { card_id: 'a', pvp: 2, currency: 'COP', rareza: 'foil' },
      { card_id: 'b', pvp: 3, currency: 'EUR' },
    ]);
    expect(m.get('a')?.length).toBe(2);
    expect(m.get('b')?.length).toBe(1);
  });
});
