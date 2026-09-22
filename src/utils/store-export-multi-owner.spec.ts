import {
  mergePublicTagMaps,
  mergeSoldUnitCounts,
  pickStoreExportPvp,
} from './store-export-multi-owner';

describe('pickStoreExportPvp', () => {
  it('Pablo pvp=50000, Esteban pvp=40000 → 50000', () => {
    expect(
      pickStoreExportPvp(
        { pvp: 50000, currency: 'COP' },
        { pvp: 40000, currency: 'COP' },
      ),
    ).toEqual({ pvp: 50000, currency: 'COP' });
  });

  it('Pablo ausente / 0, Esteban 45000 → 45000', () => {
    expect(
      pickStoreExportPvp(undefined, { pvp: 45000, currency: 'COP' }),
    ).toEqual({ pvp: 45000, currency: 'COP' });
    expect(
      pickStoreExportPvp(
        { pvp: 0, currency: 'COP' },
        { pvp: 45000, currency: 'COP' },
      ),
    ).toEqual({ pvp: 45000, currency: 'COP' });
  });

  it('ambos 0 o ausentes → undefined', () => {
    expect(pickStoreExportPvp(undefined, undefined)).toBeUndefined();
    expect(
      pickStoreExportPvp(
        { pvp: 0, currency: 'COP' },
        { pvp: 0, currency: 'COP' },
      ),
    ).toBeUndefined();
  });
});

describe('mergeSoldUnitCounts', () => {
  it('suma por card_id (swsh1: 2 + 3 → 5)', () => {
    const a = new Map([['swsh1', 2]]);
    const b = new Map([
      ['swsh1', 3],
      ['sv01-1', 1],
    ]);
    const merged = mergeSoldUnitCounts(a, b);
    expect(merged.get('swsh1')).toBe(5);
    expect(merged.get('sv01-1')).toBe(1);
  });

  it('null se trata como vacío', () => {
    const a = new Map([['swsh1', 2]]);
    expect(mergeSoldUnitCounts(a, null).get('swsh1')).toBe(2);
    expect(mergeSoldUnitCounts(null, null).size).toBe(0);
  });
});

describe('mergePublicTagMaps', () => {
  it('Pablo vintage + Esteban jugable → ambos', () => {
    const pablo = new Map([['sv08-130', ['vintage']]]);
    const esteban = new Map([['sv08-130', ['jugable']]]);
    expect(mergePublicTagMaps(pablo, esteban).get('sv08-130')).toEqual([
      'vintage',
      'jugable',
    ]);
  });
});
