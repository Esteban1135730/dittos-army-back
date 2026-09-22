import {
  fallbackCardImageUrl,
  officialPokemonComCardImageUrl,
  sanitizeCardImageUrl,
  tcgdexJaSwordShieldCdnUrl,
  tcgdexJaSwordShieldCdnUrlFromCardId,
} from './card-image-url';

describe('sanitizeCardImageUrl', () => {
  it('vacía el arte roto del SDK (undefined/low.png)', () => {
    expect(sanitizeCardImageUrl('undefined/low.png')).toBe('');
    expect(sanitizeCardImageUrl('undefined')).toBe('');
    expect(sanitizeCardImageUrl('')).toBe('');
  });

  it('conserva CDN válido', () => {
    expect(
      sanitizeCardImageUrl('https://assets.tcgdex.net/en/sv/sv08/130/low.png'),
    ).toBe('https://assets.tcgdex.net/en/sv/sv08/130/low.png');
  });
});

describe('officialPokemonComCardImageUrl', () => {
  it('mep-080 → MEP_EN_80', () => {
    expect(officialPokemonComCardImageUrl('mep', '080')).toBe(
      'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_80.png',
    );
  });

  it('no inventa pokemon.com para sets japoneses S4a', () => {
    expect(officialPokemonComCardImageUrl('S4a', '291')).toBeUndefined();
  });

  it('swsh12.5gg GG33 → SWSH12PT5GG', () => {
    expect(officialPokemonComCardImageUrl('swsh12.5gg', 'GG33')).toBe(
      'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/SWSH12PT5GG/SWSH12PT5GG_EN_GG33.png',
    );
  });
});

describe('fallbackCardImageUrl', () => {
  it('usa oficial si la imagen TCGdex falta', () => {
    expect(
      fallbackCardImageUrl({
        image: '',
        setId: 'mep',
        localId: '080',
      }),
    ).toContain('MEP_EN_80.png');
  });

  it('usa CDN ja/S para Shiny Star V si no hay arte API', () => {
    expect(
      fallbackCardImageUrl({
        image: '',
        setId: 'S4a',
        localId: '291',
      }),
    ).toBe('https://assets.tcgdex.net/ja/S/S4a/291/low.png');
    expect(tcgdexJaSwordShieldCdnUrlFromCardId('S4a-227')).toBe(
      'https://assets.tcgdex.net/ja/S/S4a/227/low.png',
    );
    expect(tcgdexJaSwordShieldCdnUrl('sv08', '130')).toBeUndefined();
  });
});
