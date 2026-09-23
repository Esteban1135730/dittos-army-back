import {
  rankYugiohNamesForCardTraderSearch,
} from './cardtrader-yugioh-search.util';

describe('rankYugiohNamesForCardTraderSearch', () => {
  it('incluye el query como primer candidato', () => {
    const out = rankYugiohNamesForCardTraderSearch('Ash Blossom', [
      'Ash Blossom & Joyous Spring',
      'Other Card',
    ]);
    expect(out[0]).toBe('Ash Blossom');
    expect(out).toContain('Ash Blossom & Joyous Spring');
  });

  it('prioriza prefijo sobre substring y limita', () => {
    const out = rankYugiohNamesForCardTraderSearch(
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
    const out = rankYugiohNamesForCardTraderSearch('exodia', [
      'Exodia',
      'EXODIA',
      'Exodia the Forbidden One',
    ]);
    expect(out.filter((n) => n.toLowerCase() === 'exodia')).toHaveLength(1);
    expect(out).toContain('Exodia the Forbidden One');
  });
});
