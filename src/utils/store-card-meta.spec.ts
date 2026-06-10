import {
  parseCardNumberFromCardId,
  parseExpansionFromSetField,
  storeCardMetaFromDto,
} from './store-card-meta';

describe('parseExpansionFromSetField', () => {
  it('extrae nombre entre paréntesis', () => {
    expect(parseExpansionFromSetField('sv08(Surging Sparks)')).toBe(
      'Surging Sparks',
    );
  });

  it('devuelve undefined si vacío', () => {
    expect(parseExpansionFromSetField('')).toBeUndefined();
    expect(parseExpansionFromSetField(null)).toBeUndefined();
  });
});

describe('parseCardNumberFromCardId', () => {
  it('toma el segmento tras el último guion', () => {
    expect(parseCardNumberFromCardId('sv08.5-079')).toBe('079');
    expect(parseCardNumberFromCardId('sv08-130')).toBe('130');
  });
});

describe('storeCardMetaFromDto', () => {
  it('mapea expansión y número local', () => {
    const meta = storeCardMetaFromDto({
      id: 'sv08-130',
      localId: '130',
      name: 'Archaludon ex',
      rarity: '',
      category: '',
      legal: { standard: true, expanded: true },
      set: 'sv08(Surging Sparks)',
      image: 'https://example.com/low.png',
      images: { small: '', large: '' },
    });
    expect(meta.expansion).toBe('Surging Sparks');
    expect(meta.card_number).toBe('130');
    expect(meta.name).toBe('Archaludon ex');
  });
});
