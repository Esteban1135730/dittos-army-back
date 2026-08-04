import {
  ctCodeToSetId,
  expansionLabel,
  formatLocalIdForLocale,
  formatPromoLocalIdForSet,
  adjustSetIdForCatalog,
  normalizeCollectorNumberForTcgdex,
  expansionLookupKeys,
  normExpansionKey,
  normalizeMangledAsiaSetId,
  resolveSetFromLocaleAliases,
  resolveSetFromLocaleMap,
  catalogLocaleForLanguage,
  usesPaddedLocalIds,
  usesPaddedLocalIdsForSet,
  matchLocaleSetIdFromEnCatalog,
  normalizeCrossLocaleSetToken,
  buildTcgdexCardIdLookupCandidates,
  tcgDexCatalogLocaleForExpansion,
} from './tcgdex-set-resolve';

describe('tcgdex-set-resolve', () => {
  it('elige catálogo TCGdex para expansión según idioma de stock', () => {
    expect(tcgDexCatalogLocaleForExpansion('en')).toBe('en');
    expect(tcgDexCatalogLocaleForExpansion('es')).toBe('en');
    expect(tcgDexCatalogLocaleForExpansion('ja')).toBe('ja');
    expect(tcgDexCatalogLocaleForExpansion('jp')).toBe('ja');
    expect(tcgDexCatalogLocaleForExpansion('ko')).toBe('ja');
    expect(tcgDexCatalogLocaleForExpansion('zh')).toBe('zh-cn');
    expect(tcgDexCatalogLocaleForExpansion('zh-cn')).toBe('zh-cn');
  });

  it('normaliza la etiqueta de expansión antes del pipe', () => {
    expect(expansionLabel('Inferno X | Master Ball')).toBe('Inferno X');
  });

  it('convierte códigos CardTrader a ids TCGdex', () => {
    expect(ctCodeToSetId('svpromo')).toBe('Svpromo');
    expect(ctCodeToSetId('m2')).toBe('M2');
    expect(ctCodeToSetId('csm25')).toBe('CSM2.5');
    expect(ctCodeToSetId('csm15')).toBe('CSM1.5');
    expect(ctCodeToSetId('csm2a')).toBe('CSM2a');
    expect(ctCodeToSetId('csm2c')).toBe('CSM2c');
    expect(ctCodeToSetId('csm1c')).toBe('CSM1c');
  });

  it('rellena ids locales a 3 dígitos en sets asiáticos', () => {
    expect(formatLocalIdForLocale('83', 'ja')).toBe('083');
    expect(formatLocalIdForLocale('083', 'ja')).toBe('083');
  });

  it('elimina ceros a la izquierda en sets clásicos (base1)', () => {
    expect(formatLocalIdForLocale('071', 'en', 'base1')).toBe('71');
    expect(formatLocalIdForLocale('004', 'en', 'base1')).toBe('4');
  });

  it('rellena a 3 dígitos en sets SV y ME', () => {
    expect(usesPaddedLocalIdsForSet('me02')).toBe(true);
    expect(usesPaddedLocalIdsForSet('sv08.5')).toBe(true);
    expect(formatLocalIdForLocale('81', 'en', 'me02')).toBe('081');
    expect(formatLocalIdForLocale('3', 'en', 'me01')).toBe('003');
    expect(formatLocalIdForLocale('11', 'en', 'sv08.5')).toBe('011');
    expect(formatLocalIdForLocale('071', 'en', 'sv08.5')).toBe('071');
    expect(formatLocalIdForLocale('24', 'en', 'sv09')).toBe('024');
  });

  it('normaliza collector con fracción CardTrader', () => {
    expect(normalizeCollectorNumberForTcgdex('115/149')).toBe('115');
    expect(formatLocalIdForLocale('115/149', 'en', 'sm1')).toBe('115');
  });

  it('formatea promos swshp con prefijo SWSH', () => {
    expect(formatLocalIdForLocale('222', 'en', 'swshp')).toBe('SWSH222');
    expect(formatLocalIdForLocale('255', 'en', 'swshp')).toBe('SWSH255');
  });

  it('normaliza Gem Pack zh 03-06/09 → 03-06_09', () => {
    expect(normalizeCollectorNumberForTcgdex('03-06/09')).toBe('03-06_09');
  });

  it('adjustSetIdForCatalog: EN SV promos → svp, zh CSV → CSV5C', () => {
    expect(adjustSetIdForCatalog('Svpromo', 'en')).toEqual({
      tcgdex_set_id: 'svp',
      locale: 'en',
    });
    expect(adjustSetIdForCatalog('Csv5', 'zh-cn')).toEqual({
      tcgdex_set_id: 'CSV5C',
      locale: 'zh-cn',
    });
    expect(adjustSetIdForCatalog('Csv7', 'zh-cn')).toEqual({
      tcgdex_set_id: 'CSV7C',
      locale: 'zh-cn',
    });
  });

  it('expansionLookupKeys incluye nombre tras dos puntos', () => {
    expect(expansionLookupKeys('CSV5: Dark Crystal Blaze')).toContain(
      'dark crystal blaze',
    );
  });

  it('resuelve alias CardTrader EN -> set japonés', () => {
    const hit = resolveSetFromLocaleAliases({
      expansionName: 'SV Black Star Promos',
      language: 'en',
      aliases: {
        'sv black star promos': { ja: 'Svpromo', ko: 'Svpromo' },
      },
    });
    expect(hit?.tcgdex_set_id).toBe('Svpromo');
    expect(hit?.locale).toBe('ja');
  });

  it('resuelve sets japoneses por nombre en inglés de CardTrader', () => {
    const hit = resolveSetFromLocaleAliases({
      expansionName: 'Inferno X',
      language: 'jp',
      aliases: {
        'inferno x': { ja: 'M2', ko: 'M2' },
      },
    });
    expect(hit?.tcgdex_set_id).toBe('M2');
  });

  it('catalogLocaleForLanguage mapea jp/ko a ja', () => {
    expect(catalogLocaleForLanguage('jp')).toBe('ja');
    expect(catalogLocaleForLanguage('en')).toBe('en');
  });

  it('usesPaddedLocalIds detecta locales asiáticos', () => {
    expect(usesPaddedLocalIds('ja')).toBe(true);
    expect(usesPaddedLocalIds('en')).toBe(false);
  });

  it('normExpansionKey colapsa espacios', () => {
    expect(normExpansionKey('  SV   Black   Star   Promos ')).toBe(
      'sv black star promos',
    );
  });
});

describe('set_locale_map', () => {
  it('resuelve Surging Sparks EN -> sv08', () => {
    const hit = resolveSetFromLocaleMap({
      expansionName: 'Surging Sparks',
      language: 'en',
      localeMap: {
        locale_set_to_en: { ja: { SV8: 'SV8' }, en: { sv08: 'sv08' } },
        expansion_to_en_set: { 'surging sparks': 'sv08' },
      },
    });
    expect(hit?.tcgdex_set_id).toBe('sv08');
    expect(hit?.locale).toBe('en');
  });

  it('resuelve Surging Sparks JP -> SV8 vía locale_set_to_en', () => {
    const hit = resolveSetFromLocaleMap({
      expansionName: 'Surging Sparks',
      language: 'jp',
      localeMap: {
        locale_set_to_en: { ja: { SV8: 'SV8' } },
        expansion_to_en_set: { 'surging sparks': 'sv08' },
      },
    });
    expect(hit?.tcgdex_set_id).toBe('SV8');
    expect(hit?.locale).toBe('ja');
  });

  it('resuelve nombre japonés directo en expansion_to_en_set', () => {
    const hit = resolveSetFromLocaleMap({
      expansionName: '超電突圍',
      language: 'jp',
      localeMap: {
        locale_set_to_en: { ja: { SV8: 'SV8' } },
        expansion_to_en_set: { '超電突圍': 'SV8' },
      },
    });
    expect(hit?.tcgdex_set_id).toBe('SV8');
  });

  it('empareja sv08 EN con SV8 JA', () => {
    expect(normalizeCrossLocaleSetToken('sv08')).toBe('sv8');
    expect(normalizeCrossLocaleSetToken('SV8')).toBe('sv8');
    expect(
      matchLocaleSetIdFromEnCatalog('sv08', { SV8: 'SV8', SV9: 'SV9' }),
    ).toBe('SV8');
  });

  it('genera variantes de id para sets clásicos con ceros (neo3-032 → neo3-32)', () => {
    expect(buildTcgdexCardIdLookupCandidates('neo3-032', 'it')).toEqual([
      'neo3-32',
      'neo3-032',
    ]);
    expect(buildTcgdexCardIdLookupCandidates('sv10-023', 'en')).toEqual([
      'sv10-023',
    ]);
    expect(buildTcgdexCardIdLookupCandidates('base1-026', 'it')).toEqual([
      'base1-26',
      'base1-026',
    ]);
  });

  it('normaliza ids mangled Csm25 / Csm2a hacia CSM2.5 / CSM2a', () => {
    expect(normalizeMangledAsiaSetId('Csm25')).toBe('CSM2.5');
    expect(normalizeMangledAsiaSetId('csm25')).toBe('CSM2.5');
    expect(normalizeMangledAsiaSetId('Csm2a')).toBe('CSM2a');
    expect(normalizeMangledAsiaSetId('CSM2C')).toBe('CSM2c');
    expect(buildTcgdexCardIdLookupCandidates('Csm25-044', 'zh')).toEqual(
      expect.arrayContaining(['CSM2.5-044', 'Csm25-044']),
    );
  });
});
