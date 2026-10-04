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
  matchBlueprintsByNameThenNumber,
  matchBlueprintsForQuoteLine,
  normalizeCollectorNumber,
} from './cardtrader-quote-blueprint-match';
import {
  buildLiveExpansionIndex,
  matchLiveExpansions,
} from './cardtrader-quote-live-expansion';
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

  it('detecta el idioma y Perfecto aunque vengan con notas del cliente', () => {
    expect(mapQuoteLanguageLabel('normal y holo Inglés')).toBe('en');
    expect(mapQuoteLanguageLabel('Inglés, normal y reverse')).toBe('en');
    expect(mapQuoteLanguageLabel('first edition Inglés')).toBe('en');
    expect(mapQuoteLanguageLabel('Inglés o Japonés')).toBeNull();
    expect(mapQuoteConditionLabel('normal y reverse Perfecto')).toBe(
      'Near Mint',
    );
  });
});

describe('normalizeCollectorNumber', () => {
  it('iguala 079 y 79; conserva RC2 y GG30', () => {
    expect(normalizeCollectorNumber('079')).toBe('79');
    expect(normalizeCollectorNumber('79')).toBe('79');
    expect(normalizeCollectorNumber('RC2')).toBe('RC2');
    expect(normalizeCollectorNumber('GG30')).toBe('GG30');
  });

  it('ignora el total del set: 003/189 → 3, TG01/TG30 → TG1', () => {
    expect(normalizeCollectorNumber('003/189')).toBe('3');
    expect(normalizeCollectorNumber('47 / 64')).toBe('47');
    expect(normalizeCollectorNumber('TG01/TG30')).toBe('TG1');
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

describe('matchLiveExpansions', () => {
  const live = buildLiveExpansionIndex([
    { id: 1, name: 'Scarlet & Violet—151', code: 'mew' },
    { id: 2, name: 'Crown Zenith', code: 'swsh12pt5' },
    { id: 3, name: 'Crown Zenith: Galarian Gallery', code: 'swsh12pt5gg' },
    { id: 4, name: 'Paldean Fates', code: 'sv4pt5' },
    { name: 'Sin id' },
  ]);

  it('ignora & vs and, guiones largos y tildes', () => {
    expect(
      matchLiveExpansions(live, 'Scarlet and Violet 151').map(
        (h) => h.expansionId,
      ),
    ).toEqual([1]);
  });

  it('exacto primero y luego subsets que empiezan igual; los dos puntos no importan', () => {
    expect(
      matchLiveExpansions(live, 'Crown Zenith Galarian Gallery').map(
        (h) => h.expansionId,
      ),
    ).toEqual([3]);
    expect(
      matchLiveExpansions(live, 'crown zenith').map((h) => h.expansionId),
    ).toEqual([2, 3]);
  });

  it('acepta el código de expansión y el nombre CT contenido en el mensaje', () => {
    expect(matchLiveExpansions(live, 'SV4PT5')[0]?.expansionId).toBe(4);
    expect(
      matchLiveExpansions(live, 'Paldean Fates Shiny Vault')[0]?.expansionId,
    ).toBe(4);
  });

  it('sin coincidencia → lista vacía', () => {
    expect(matchLiveExpansions(live, 'Set Inventado')).toEqual([]);
    expect(matchLiveExpansions(buildLiveExpansionIndex(null), 'X')).toEqual([]);
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

  it('número del cliente 3 coincide con collector CT 003/189', () => {
    const hits = matchBlueprintsForQuoteLine({
      blueprints: [
        {
          id: 145025,
          name: 'Paras',
          fixed_properties: { collector_number: '003/189' },
        },
        {
          id: 145026,
          name: 'Parasect',
          fixed_properties: { collector_number: '004/189' },
        },
      ],
      expansionId: 2082,
      expansionName: 'Darkness Ablaze',
      collectorNumber: '3',
      cardName: 'Paras',
    });
    expect(hits.map((h) => h.blueprint_id)).toEqual([145025]);
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

describe('matchBlueprintsByNameThenNumber', () => {
  const exp = (
    expansionId: number,
    blueprints: Array<{ id: number; name: string; num: string }>,
  ) => ({
    expansionId,
    expansionName: `Exp ${expansionId}`,
    blueprints: blueprints.map((b) => ({
      id: b.id,
      name: b.name,
      fixed_properties: { collector_number: b.num },
    })),
  });

  it('un solo blueprint con el nombre → unique aunque el número venga distinto', () => {
    const r = matchBlueprintsByNameThenNumber({
      expansions: [
        exp(1, [
          { id: 1, name: 'Paras', num: '004/149' },
          { id: 2, name: 'Parasect', num: '005/149' },
        ]),
      ],
      cardName: 'Paras',
      collectorNumber: '7',
    });
    expect(r).toEqual({
      unique: true,
      candidates: [expect.objectContaining({ blueprint_id: 1 })],
    });
  });

  it('varios con el mismo nombre en distintas expansiones → desempata por número', () => {
    const r = matchBlueprintsByNameThenNumber({
      expansions: [
        exp(1, [{ id: 1, name: 'Pikachu', num: '26' }]),
        exp(2, [{ id: 2, name: 'Pikachu', num: 'RC29' }]),
      ],
      cardName: 'Pikachu',
      collectorNumber: 'RC29',
    });
    expect(r.unique).toBe(true);
    expect(r.candidates[0]).toMatchObject({ blueprint_id: 2, expansion_id: 2 });
  });

  it('varios con el nombre y ninguno con el número → ambiguous con todos', () => {
    const r = matchBlueprintsByNameThenNumber({
      expansions: [
        exp(1, [
          { id: 1, name: 'Pikachu', num: '26' },
          { id: 2, name: 'Pikachu', num: '27' },
        ]),
      ],
      cardName: 'Pikachu',
      collectorNumber: '99',
    });
    expect(r.unique).toBe(false);
    expect(r.candidates.map((c) => c.blueprint_id)).toEqual([1, 2]);
  });

  it('palabras completas: Pikachu ex sí, Parasect no; apóstrofos tipográficos', () => {
    const ex = matchBlueprintsByNameThenNumber({
      expansions: [exp(1, [{ id: 1, name: 'Mew ex', num: '151' }])],
      cardName: 'Mew',
      collectorNumber: '151',
    });
    expect(ex.unique).toBe(true);
    const parasect = matchBlueprintsByNameThenNumber({
      expansions: [exp(1, [{ id: 2, name: 'Parasect', num: '1' }])],
      cardName: 'Paras',
      collectorNumber: '1',
    });
    expect(parasect.unique).toBe(false);
    const erika = matchBlueprintsByNameThenNumber({
      expansions: [exp(1, [{ id: 3, name: 'Erika’s Paras', num: '071/132' }])],
      cardName: "Erika's Paras",
      collectorNumber: '71',
    });
    expect(erika.unique).toBe(true);
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

  it('lote grande: conserva el orden, limita concurrencia y pide el export una sola vez', async () => {
    let active = 0;
    let peak = 0;
    const cardTrader = {
      getBlueprintsExport: jest.fn().mockImplementation(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return [
          {
            id: 99,
            name: 'Shroomish',
            fixed_properties: { collector_number: 'RC2' },
          },
        ];
      }),
    } as unknown as CardTraderService;
    const svc = new CardTraderQuoteResolveService(cardTrader);
    svc.replaceExpansionIndex(index);
    const lines = Array.from({ length: 12 }, (_, i) =>
      i % 3 === 0
        ? { name: 'X', expansion: 'Set Inventado', collector_number: '1' }
        : {
            name: 'Shroomish',
            expansion: 'Generations',
            collector_number: i % 2 ? 'RC2' : 'ZZZ',
          },
    );
    const { results } = await svc.resolveLines(lines);
    expect(results.map((r) => r.index)).toEqual(lines.map((_, i) => i));
    const expected = await Promise.all(
      lines.map((l, i) => svc.resolveLine(l, i)),
    );
    expect(results).toEqual(expected);
    expect(cardTrader.getBlueprintsExport).toHaveBeenCalledTimes(1);
    expect(peak).toBe(1);
  });

  describe('fallback por nombre de set en CardTrader', () => {
    function liveService(
      expansions: unknown,
      exportsById: Record<number, unknown[]>,
    ) {
      const cardTrader = {
        getExpansions:
          expansions instanceof Error
            ? jest.fn().mockRejectedValue(expansions)
            : jest.fn().mockResolvedValue(expansions),
        getBlueprintsExport: jest
          .fn()
          .mockImplementation((id: number) =>
            Promise.resolve(exportsById[id] ?? []),
          ),
      };
      const svc = new CardTraderQuoteResolveService(
        cardTrader as unknown as CardTraderService,
      );
      svc.replaceExpansionIndex(index);
      return { svc, cardTrader };
    }

    it('resuelve un set sin homologación si el nombre existe en CardTrader', async () => {
      const { svc, cardTrader } = liveService(
        [
          { id: 4100, game_id: 5, name: 'Scarlet & Violet—151', code: 'mew' },
          { id: 4101, game_id: 5, name: 'Other Set', code: 'oth' },
        ],
        {
          4100: [
            {
              id: 700,
              name: 'Mew ex',
              fixed_properties: { collector_number: '151' },
            },
          ],
        },
      );
      const result = await svc.resolveLine(
        {
          name: 'Mew ex',
          expansion: 'Scarlet and Violet 151',
          collector_number: '151',
        },
        0,
      );
      expect(result).toMatchObject({
        status: 'matched',
        blueprint_id: 700,
        expansion_id: 4100,
        expansion_name: 'Scarlet & Violet—151',
        error: null,
      });
      expect(cardTrader.getExpansions).toHaveBeenCalledWith(
        undefined,
        undefined,
        5,
      );
    });

    it('si la homologación no tiene el número, prueba la expansión CT con el mismo nombre', async () => {
      const { svc } = liveService(
        [{ id: 9001, game_id: 5, name: 'Generations' }],
        {
          1577: [],
          9001: [
            {
              id: 801,
              name: 'Shroomish',
              fixed_properties: { collector_number: 'RC2' },
            },
          ],
        },
      );
      const result = await svc.resolveLine(
        {
          name: 'Shroomish',
          expansion: 'Generations',
          collector_number: 'RC2',
        },
        0,
      );
      expect(result).toMatchObject({
        status: 'matched',
        blueprint_id: 801,
        expansion_id: 9001,
      });
    });

    it('si el nombre existe en CT pero el número no, devuelve blueprint_not_found con la expansión CT', async () => {
      const { svc } = liveService(
        [{ id: 4100, game_id: 5, name: 'Paldean Fates' }],
        { 4100: [] },
      );
      const result = await svc.resolveLine(
        { name: 'X', expansion: 'Paldean Fates', collector_number: '999' },
        0,
      );
      expect(result).toMatchObject({
        status: 'not_found',
        expansion_id: 4100,
        expansion_name: 'Paldean Fates',
        error: 'blueprint_not_found',
      });
    });

    it('expansion_not_mapped si CardTrader no tiene el set o falla', async () => {
      const notFound = liveService([{ id: 1, game_id: 5, name: 'Otro' }], {});
      const failing = liveService(new Error('429'), {});
      for (const { svc } of [notFound, failing]) {
        const result = await svc.resolveLine(
          { name: 'X', expansion: 'Set Inventado 999', collector_number: '1' },
          0,
        );
        expect(result.error).toBe('expansion_not_mapped');
        expect(result.expansion_id).toBeNull();
      }
    });

    it('incluye subsets CT que empiezan con el nombre del set (Shiny Vault)', async () => {
      const { svc } = liveService(
        [
          { id: 2000, game_id: 5, name: 'Hidden Fates' },
          { id: 2001, game_id: 5, name: 'Hidden Fates: Shiny Vault' },
        ],
        {
          2000: [
            {
              id: 10,
              name: 'Charizard-GX',
              fixed_properties: { collector_number: '9/68' },
            },
          ],
          2001: [
            {
              id: 11,
              name: 'Charizard-GX',
              fixed_properties: { collector_number: 'SV49/SV94' },
            },
          ],
        },
      );
      const result = await svc.resolveLine(
        {
          name: 'Charizard-GX',
          expansion: 'Hidden Fates',
          collector_number: 'SV49',
        },
        0,
      );
      expect(result).toMatchObject({
        status: 'matched',
        blueprint_id: 11,
        expansion_id: 2001,
        expansion_name: 'Hidden Fates: Shiny Vault',
      });
    });

    it('pide /expansions una sola vez para un lote', async () => {
      const { svc, cardTrader } = liveService(
        [{ id: 4100, game_id: 5, name: 'Paldean Fates' }],
        {
          4100: [
            {
              id: 1,
              name: 'Charizard ex',
              fixed_properties: { collector_number: '54' },
            },
          ],
        },
      );
      const { results } = await svc.resolveLines(
        Array.from({ length: 6 }, () => ({
          name: 'Charizard ex',
          expansion: 'Paldean Fates',
          collector_number: '054',
        })),
      );
      expect(results.every((r) => r.status === 'matched')).toBe(true);
      expect(cardTrader.getExpansions).toHaveBeenCalledTimes(1);
    });
  });

  it('un único blueprint con otro nombre no se da por matched: queda como candidato', async () => {
    const svc = serviceWith([
      {
        id: 377877,
        name: 'Pikachu',
        version: 'Evolution Pack "Raichu BREAK" SNP | 001/010',
      },
    ]);
    const result = await svc.resolveLine(
      { name: 'Paras', expansion: 'Generations', collector_number: '1' },
      0,
    );
    expect(result.status).toBe('ambiguous');
    expect(result.blueprint_id).toBeNull();
    expect(result.candidates.map((c) => c.blueprint_id)).toEqual([377877]);
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
