import { describe, expect, it } from '@jest/globals';
import {
  isActiveTcg,
  resolveTcgFromRequest,
  runWithTcg,
  getCurrentTcg,
} from './tcg-context';

describe('tcg-context', () => {
  it('acepta los TCG configurados', () => {
    expect(isActiveTcg('pokemon')).toBe(true);
    expect(isActiveTcg('yugioh')).toBe(true);
    expect(isActiveTcg('magic')).toBe(true);
    expect(isActiveTcg('onepiece')).toBe(true);
    expect(isActiveTcg('lorcana')).toBe(false);
  });

  it('prioriza header X-Tcg', () => {
    expect(
      resolveTcgFromRequest({
        header: 'yugioh',
        path: '/pokemon/stock',
      }),
    ).toBe('yugioh');
  });

  it('infiere yugioh desde el path', () => {
    expect(resolveTcgFromRequest({ path: '/yugioh/sets' })).toBe('yugioh');
    expect(resolveTcgFromRequest({ path: '/pokemon/stock' })).toBe('pokemon');
    expect(resolveTcgFromRequest({ path: '/onepiece/stock' })).toBe('onepiece');
  });

  it('rechaza TCG inválido', () => {
    expect(resolveTcgFromRequest({ header: 'lorcana' })).toBeNull();
  });

  it('runWithTcg fija el ALS', () => {
    expect(getCurrentTcg()).toBe('pokemon');
    runWithTcg('yugioh', () => {
      expect(getCurrentTcg()).toBe('yugioh');
    });
    expect(getCurrentTcg()).toBe('pokemon');
  });
});
