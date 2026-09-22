import {
  parseCardNumberFromCardId,
  parseExpansionFromSetField,
  parseSetIdFromSetField,
  storeCardMetaFromDto,
  isUnreliableStoreCardName,
  isCjkCardName,
  pickStoreExportCardName,
  resolveStoreExportCardMeta,
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

describe('parseSetIdFromSetField', () => {
  it('extrae id antes del paréntesis', () => {
    expect(parseSetIdFromSetField('sv08(Surging Sparks)')).toBe('sv08');
    expect(parseSetIdFromSetField('BW9(メガロキャノン)')).toBe('BW9');
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
      rarity: 'Double Rare',
      category: 'Pokemon',
      types: ['Metal'],
      hp: 300,
      legal: { standard: true, expanded: true },
      set: 'sv08(Surging Sparks)',
      image: 'https://example.com/low.png',
      images: { small: '', large: '' },
    });
    expect(meta.expansion).toBe('Surging Sparks');
    expect(meta.card_number).toBe('130');
    expect(meta.name).toBe('Archaludon ex');
    expect(meta.tcg_rarity).toBe('Double Rare');
    expect(meta.category).toBe('Pokemon');
    expect(meta.types).toEqual(['Metal']);
    expect(meta.hp).toBe(300);
  });

  it('prioriza setEnglishName sobre el nombre localizado del set', () => {
    const meta = storeCardMetaFromDto({
      id: 'SV5a-001',
      localId: '001',
      name: 'Test',
      rarity: '',
      category: '',
      legal: { standard: true, expanded: true },
      set: 'SV5a(クリムゾンヘイズ)',
      setEnglishName: 'Crimson Haze',
      image: '',
      images: { small: '', large: '' },
    });
    expect(meta.expansion).toBe('Crimson Haze');
  });
});

describe('isUnreliableStoreCardName', () => {
  it('marca nombres vacíos o de una sola letra', () => {
    expect(isUnreliableStoreCardName('')).toBe(true);
    expect(isUnreliableStoreCardName('b')).toBe(true);
    expect(isUnreliableStoreCardName('Lanturn')).toBe(false);
  });
});

describe('isCjkCardName', () => {
  it('detecta escritura japonesa', () => {
    expect(isCjkCardName('ランターン')).toBe(true);
    expect(isCjkCardName('Lanturn')).toBe(false);
  });
});

describe('resolveStoreExportCardMeta', () => {
  it('prefiere nombre EN cuando el localizado es corrupto', () => {
    const meta = resolveStoreExportCardMeta({
      cardId: 'neo3-032',
      localized: { name: 'b', image: '', expansion: 'めざめる伝説' },
      english: {
        name: 'Lanturn',
        image: 'https://example.com/lanturn.png',
        expansion: 'Neo Revelation',
        card_number: '32',
      },
    });
    expect(meta.name).toBe('Lanturn');
    expect(meta.expansion).toBe('Neo Revelation');
  });

  it('usa nombre de origen si TCGdex no resuelve', () => {
    const meta = resolveStoreExportCardMeta({
      cardId: 'neo3-032',
      sourceName: 'Lanturn',
    });
    expect(meta.name).toBe('Lanturn');
  });

  it('prioriza el nombre local de inventario sobre TCGdex en japonés', () => {
    const meta = resolveStoreExportCardMeta({
      cardId: 's10a-045',
      sourceName: 'Snorunt',
      localized: {
        name: 'ユキカブリ',
        image: '',
        expansion: 'ダークファンタズマ',
      },
      english: {
        name: 'Snorunt',
        image: 'https://assets.tcgdex.net/en/swsh/swsh10/45/low.png',
        expansion: 'Dark Phantasma',
      },
    });
    expect(meta.name).toBe('Snorunt');
    expect(meta.expansion).toBe('Dark Phantasma');
  });
});

describe('pickStoreExportCardName', () => {
  it('ignora candidatos poco fiables', () => {
    expect(pickStoreExportCardName('b', 'Lanturn', 'neo3-032')).toBe('Lanturn');
  });
});
