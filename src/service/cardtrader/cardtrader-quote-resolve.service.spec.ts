import {
  mapQuoteConditionLabel,
  mapQuoteLanguageLabel,
} from './cardtrader-quote-labels';
import {
  buildQuoteExpansionIndex,
  listExpansionsForTcgdexSet,
  resolveQuoteExpansion,
} from './cardtrader-quote-homolog';
import {
  matchBlueprintsForQuoteLine,
  normalizeCollectorNumber,
} from './cardtrader-quote-blueprint-match';
import {
  CardTraderQuoteResolveService,
  searchLocaleOrder,
} from './cardtrader-quote-resolve.service';
import { CardTraderService } from './cardtrader.service';

describe('mapQuoteLanguageLabel / mapQuoteConditionLabel', () => {
  it('mapea Inglés → en y No importa → null', () => {
    expect(mapQuoteLanguageLabel('Inglés')).toBe('en');
    expect(mapQuoteLanguageLabel('No importa el idioma')).toBeNull();
    expect(mapQuoteLanguageLabel('Japonés')).toBe('jp');
  });

  it('mapea Perfecto → Near Mint y deja el resto en null', () => {
    expect(mapQuoteConditionLabel('Perfecto')).toBe('Near Mint');
    expect(mapQuoteConditionLabel('Puede tener imperfecciones')).toBeNull();
  });
});

describe('normalizeCollectorNumber', () => {
  it('iguala 079 y 79; conserva RC2 y GG30', () => {
    expect(normalizeCollectorNumber('079')).toBe('79');
    expect(normalizeCollectorNumber('79')).toBe('79');
    expect(normalizeCollectorNumber('RC2')).toBe('RC2');
    expect(normalizeCollectorNumber('GG30')).toBe('GG30');
  });
});

describe('resolveQuoteExpansion', () => {
  const index = buildQuoteExpansionIndex({
    sets: {
      'en:g1': {
        names: {
          en_cardtrader: 'Generations',
          database: { en: 'Generations' },
        },
        cardtrader: { id: 1577 },
      },
      'en:swsh12.5': {
        names: {
          en_cardtrader: 'Crown Zenith',
          database: { en: 'Crown Zenith' },
        },
        cardtrader: { id: 3171 },
      },
      'en:sv08.5': {
        names: {
          en_cardtrader: 'Prismatic Evolutions',
          database: { en: 'Prismatic Evolutions' },
        },
        cardtrader: { id: 4001 },
      },
      'en:sv08.5pb': {
        names: {
          en_cardtrader: 'Prismatic Evolutions - Poké Ball Reverse Holo',
          database: { en: 'Prismatic Evolutions' },
        },
        cardtrader: { id: 4053 },
      },
    },
    cardtrader_only: [{ id: 3221, name: 'SV Black Star Promos' }],
  });

  it('match exacto Generations', () => {
    const hit = resolveQuoteExpansion(index, 'Generations');
    expect(hit).toMatchObject({
      expansionId: 1577,
      expansionName: 'Generations',
    });
  });

  it('alias SVP Black Star Promos → SV Black Star Promos', () => {
    const hit = resolveQuoteExpansion(index, 'SVP Black Star Promos');
    expect(hit).toMatchObject({ expansionId: 3221 });
  });

  it('Crown Zenith Galarian Gallery → Crown Zenith', () => {
    const hit = resolveQuoteExpansion(index, 'Crown Zenith Galarian Gallery');
    expect(hit).toMatchObject({
      expansionId: 3171,
      expansionName: 'Crown Zenith',
    });
  });

  it('Prismatic Evolutions exacto no se confunde con Poké Ball RH', () => {
    const hit = resolveQuoteExpansion(index, 'Prismatic Evolutions');
    expect(hit).toMatchObject({ expansionId: 4001 });
  });
});

describe('listExpansionsForTcgdexSet', () => {
  const index = buildQuoteExpansionIndex({
    sets: {
      'zh-tw:SV8a': {
        tcgdex_set_id: 'SV8a',
        locale: 'zh-tw',
        names: { en_cardtrader: 'Terastal Festival ex' },
        cardtrader: { id: 3928 },
      },
      'ja:SV8a': {
        tcgdex_set_id: 'SV8a',
        locale: 'ja',
        names: {
          en_cardtrader: 'Terastal Festival ex - Master Ball Reverse Holo',
        },
        cardtrader: { id: 3985 },
      },
    },
  });

  it('prioriza ja:SV8a frente al set chino con el mismo tcgdex_set_id', () => {
    const hits = listExpansionsForTcgdexSet(index, 'SV8a', 'ja');
    expect(hits.map((h) => h.expansionId)).toEqual([3985, 3928]);
  });

  it('prioriza zh-tw:SV8a cuando el locale es chino', () => {
    const hits = listExpansionsForTcgdexSet(index, 'SV8a', 'zh-tw');
    expect(hits[0]?.expansionId).toBe(3928);
  });
});

describe('searchLocaleOrder', () => {
  it('pone ja primero si hay kana y zh si hay hanzi', () => {
    expect(searchLocaleOrder('ピカチュウ')[0]).toBe('ja');
    expect(searchLocaleOrder('皮卡丘')[0]).toBe('zh-tw');
    expect(searchLocaleOrder('Pikachu')[0]).toBe('en');
  });
});

describe('matchBlueprintsForQuoteLine', () => {
  const blueprints = [
    {
      id: 10,
      name: 'Shroomish',
      fixed_properties: { collector_number: 'RC2' },
      image_url: 'https://cdn.example/shroomish.jpg',
    },
    {
      id: 11,
      name: 'Fuecoco',
      fixed_properties: { collector_number: '079' },
    },
    {
      id: 12,
      name: 'Fuecoco',
      version: 'Promo',
      fixed_properties: { collector_number: '079' },
    },
  ];

  it('match único por número RC2', () => {
    const hits = matchBlueprintsForQuoteLine({
      blueprints,
      expansionId: 1577,
      expansionName: 'Generations',
      collectorNumber: 'RC2',
      cardName: 'Shroomish',
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].blueprint_id).toBe(10);
    expect(hits[0].image_url).toContain('shroomish');
  });

  it('079 coincide con collector 079', () => {
    const hits = matchBlueprintsForQuoteLine({
      blueprints,
      expansionId: 3221,
      expansionName: 'SV Black Star Promos',
      collectorNumber: '079',
      cardName: 'Fuecoco',
    });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(
      hits.every((h) => h.blueprint_id === 11 || h.blueprint_id === 12),
    ).toBe(true);
  });
});

describe('CardTraderQuoteResolveService', () => {
  const index = buildQuoteExpansionIndex({
    sets: {
      'en:g1': {
        tcgdex_set_id: 'g1',
        names: {
          en_cardtrader: 'Generations',
          database: { en: 'Generations' },
        },
        cardtrader: { id: 1577 },
      },
    },
  });

  function serviceWith(
    exportData: unknown,
    tcgDex?: { findCardByName: jest.Mock },
  ) {
    const cardTrader = {
      getBlueprintsExport: jest.fn().mockResolvedValue(exportData),
    } as unknown as CardTraderService;
    const svc = new CardTraderQuoteResolveService(cardTrader, tcgDex as never);
    svc.replaceExpansionIndex(index);
    return svc;
  }

  it('resuelve una línea homologable a matched', async () => {
    const svc = serviceWith([
      {
        id: 99,
        name: 'Shroomish',
        fixed_properties: { collector_number: 'RC2' },
        image_url: 'https://cdn.example/s.jpg',
      },
    ]);
    const { results } = await svc.resolveLines([
      {
        name: 'Shroomish',
        expansion: 'Generations',
        collector_number: 'RC2',
        language_label: 'Inglés',
        condition_label: 'Perfecto',
      },
    ]);
    expect(results[0]).toMatchObject({
      status: 'matched',
      blueprint_id: 99,
      expansion_id: 1577,
      pokemon_language: 'en',
      condition: 'Near Mint',
      error: null,
    });
  });

  it('devuelve not_found expansion_not_mapped si el set no existe', async () => {
    const svc = serviceWith([]);
    const { results } = await svc.resolveLines([
      {
        name: 'X',
        expansion: 'Set Inventado 999',
        collector_number: '1',
      },
    ]);
    expect(results[0].status).toBe('not_found');
    expect(results[0].error).toBe('expansion_not_mapped');
  });

  it('devuelve not_found blueprint_not_found si el número no está', async () => {
    const svc = serviceWith([
      { id: 1, name: 'Other', fixed_properties: { collector_number: '1' } },
    ]);
    const { results } = await svc.resolveLines([
      { name: 'Shroomish', expansion: 'Generations', collector_number: 'RC2' },
    ]);
    expect(results[0].status).toBe('not_found');
    expect(results[0].error).toBe('blueprint_not_found');
  });

  it('línea incompleta → invalid_line', async () => {
    const svc = serviceWith([]);
    const result = await svc.resolveLine({ name: 'X' }, 0);
    expect(result.error).toBe('invalid_line');
    expect(result.status).toBe('not_found');
  });

  it('lote: matched y not_found en la misma respuesta', async () => {
    const svc = serviceWith([
      {
        id: 99,
        name: 'Shroomish',
        fixed_properties: { collector_number: 'RC2' },
      },
    ]);
    const { results } = await svc.resolveLines([
      { name: 'Shroomish', expansion: 'Generations', collector_number: 'RC2' },
      { name: 'Missing', expansion: 'Generations', collector_number: 'ZZZ' },
    ]);
    expect(results[0].status).toBe('matched');
    expect(results[1].status).toBe('not_found');
    expect(results[1].error).toBe('blueprint_not_found');
  });

  it('ambiguous si hay varios blueprints del mismo número y nombre distinto', async () => {
    const svc = serviceWith([
      { id: 1, name: 'Alpha', fixed_properties: { collector_number: 'RC2' } },
      { id: 2, name: 'Beta', fixed_properties: { collector_number: 'RC2' } },
    ]);
    const { results } = await svc.resolveLines([
      { name: 'Gamma', expansion: 'Generations', collector_number: 'RC2' },
    ]);
    expect(results[0].status).toBe('ambiguous');
    expect(results[0].candidates).toHaveLength(2);
  });

  it('searchBlueprintsByName omite cartas sin homologación y topea a 40', async () => {
    const tcgDex = {
      findCardByName: jest
        .fn()
        .mockImplementation(async (_q: string, locale?: string) => {
          if (locale && locale !== 'en') return [];
          return [
            { id: 'unknown-1', localId: '1', name: 'Nope' },
            { id: 'g1-RC2', localId: 'RC2', name: 'Shroomish' },
          ];
        }),
    };
    const svc = serviceWith(
      [
        {
          id: 99,
          name: 'Shroomish',
          fixed_properties: { collector_number: 'RC2' },
        },
      ],
      tcgDex,
    );
    const { items } = await svc.searchBlueprintsByName('Shroom');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      blueprint_id: 99,
      expansion_id: 1577,
      name: 'Shroomish',
    });
    expect(tcgDex.findCardByName).toHaveBeenCalledWith('Shroom', 'ja');
  });

  it('searchBlueprintsByName incluye set japonés aunque haya varios blueprints del mismo número', async () => {
    const asianIndex = buildQuoteExpansionIndex({
      sets: {
        'zh-tw:SV8a': {
          tcgdex_set_id: 'SV8a',
          locale: 'zh-tw',
          names: { en_cardtrader: 'Terastal Festival ex' },
          cardtrader: { id: 3928 },
        },
        'ja:SV8a': {
          tcgdex_set_id: 'SV8a',
          locale: 'ja',
          names: {
            en_cardtrader: 'Terastal Festival ex - Master Ball Reverse Holo',
          },
          cardtrader: { id: 3985 },
        },
      },
    });
    const tcgDex = {
      findCardByName: jest
        .fn()
        .mockImplementation(async (_q: string, locale?: string) => {
          if (locale === 'ja') {
            return [{ id: 'SV8a-001', localId: '001', name: 'ピカチュウ' }];
          }
          return [];
        }),
    };
    const cardTrader = {
      getBlueprintsExport: jest
        .fn()
        .mockImplementation(async (expansionId: number) => {
          if (expansionId === 3985) {
            return [
              {
                id: 501,
                name: 'Pikachu',
                fixed_properties: { collector_number: '001' },
              },
              {
                id: 502,
                name: 'Pikachu ex',
                fixed_properties: { collector_number: '001' },
              },
            ];
          }
          return [];
        }),
    } as unknown as CardTraderService;
    const svc = new CardTraderQuoteResolveService(cardTrader, tcgDex as never);
    svc.replaceExpansionIndex(asianIndex);
    const { items } = await svc.searchBlueprintsByName('ピカチュウ');
    expect(items.map((i) => i.blueprint_id).sort()).toEqual([501, 502]);
    expect(
      items.every((i) => i.expansion_id === 3985 && i.locale === 'ja'),
    ).toBe(true);
  });
});
