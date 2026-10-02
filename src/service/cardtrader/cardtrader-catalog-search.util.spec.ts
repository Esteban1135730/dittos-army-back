import {
  rankCatalogNamesForCardTraderSearch,
  stripCatalogVariantSuffix,
} from './cardtrader-catalog-search.util';

describe('stripCatalogVariantSuffix', () => {
  it('quita el sufijo de variante final', () => {
    expect(stripCatalogVariantSuffix('Zoro-Juurou (SP)')).toBe('Zoro-Juurou');
    expect(stripCatalogVariantSuffix('Monkey.D.Luffy (Parallel)')).toBe('Monkey.D.Luffy');
    expect(stripCatalogVariantSuffix('Lightning Bolt')).toBe('Lightning Bolt');
    expect(stripCatalogVariantSuffix('(SP)')).toBe('(SP)');
  });
});

describe('rankCatalogNamesForCardTraderSearch', () => {
  it('incluye el query como primer candidato', () => {
    const out = rankCatalogNamesForCardTraderSearch('Ash Blossom', [
      'Ash Blossom & Joyous Spring',
      'Other Card',
    ]);
    expect(out[0]).toBe('Ash Blossom');
    expect(out).toContain('Ash Blossom & Joyous Spring');
  });

  it('prioriza prefijo sobre substring y limita', () => {
    const out = rankCatalogNamesForCardTraderSearch(
      'Blue-Eyes',
      [
        'Something Blue-Eyes End',
        'Blue-Eyes White Dragon',
        'Blue-Eyes Abyss Dragon',
        'Unrelated',
      ],
      3,
    );
    expect(out[0]).toBe('Blue-Eyes');
    expect(out[1]).toBe('Blue-Eyes Abyss Dragon');
    expect(out[2]).toBe('Blue-Eyes White Dragon');
    expect(out).toHaveLength(3);
  });

  it('deduplica por case-insensitive', () => {
    const out = rankCatalogNamesForCardTraderSearch('exodia', [
      'Exodia',
      'EXODIA',
      'Exodia the Forbidden One',
    ]);
    expect(out.filter((n) => n.toLowerCase() === 'exodia')).toHaveLength(1);
    expect(out).toContain('Exodia the Forbidden One');
  });
});
