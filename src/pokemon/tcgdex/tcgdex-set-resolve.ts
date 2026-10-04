/** Helpers aligned with scripts/card-trader/tcgdex_locale.py */

const CATALOG_LOCALE_BY_LANG: Record<string, string> = {
  jp: 'ja',
  ja: 'ja',
  ko: 'ja',
  kr: 'ja',
  zh: 'zh-cn',
  cn: 'zh-cn',
  zht: 'zh-tw',
  'zh-tw': 'zh-tw',
  'zh-hant': 'zh-tw',
  'zh-cn': 'zh-cn',
  'zh-hans': 'zh-cn',
};

export function expansionLabel(expansion: string | null | undefined): string {
  return String(expansion ?? '')
    .split('|')[0]
    .trim();
}

export function normExpansionKey(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function catalogLocaleForLanguage(
  language: string | null | undefined,
): string | null {
  const lang = String(language ?? '')
    .trim()
    .toLowerCase();
  if (!lang || lang === 'en') return 'en';
  return CATALOG_LOCALE_BY_LANG[lang] ?? null;
}

/** Locale TCGdex para resolver la carta/set según idioma de stock (oriental → ja/zh). */
export function tcgDexCatalogLocaleForExpansion(
  language: string | null | undefined,
): 'en' | 'ja' | 'zh-cn' | 'zh-tw' {
  const catalog = catalogLocaleForLanguage(language) ?? 'en';
  if (catalog === 'zh-cn' || catalog === 'zh-tw') return catalog;
  if (catalog === 'ja' || catalog === 'ko') return 'ja';
  return 'en';
}

/**
 * Códigos CardTrader que no coinciden 1:1 con el id TCGdex
 * (p. ej. CT omite el punto: csm25 → CSM2.5).
 */
const CT_CODE_TO_TCGDEX_SET: Record<string, string> = {
  csm15: 'CSM1.5',
  csm25: 'CSM2.5',
  csm1a: 'CSM1a',
  csm1b: 'CSM1b',
  csm1c: 'CSM1c',
  csm1d: 'CSM1d',
  csm2a: 'CSM2a',
  csm2b: 'CSM2b',
  csm2c: 'CSM2c',
  csm2d: 'CSM2d',
};

export function ctCodeToSetId(code: string | null | undefined): string {
  const c = String(code ?? '').trim();
  if (!c) return c;
  const override = CT_CODE_TO_TCGDEX_SET[c.toLowerCase()];
  if (override) return override;
  // Sufijo C chino (csv5c, cbb1c), no letras de set CSM2c (cubiertas arriba).
  if (/^cs/i.test(c) && c.endsWith('c')) return c.toUpperCase();
  if (/^cbb/i.test(c)) return c.toUpperCase();
  if (/^m\d/i.test(c)) return c[0].toUpperCase() + c.slice(1);
  if (/^[a-z]/.test(c)) return c[0].toUpperCase() + c.slice(1);
  return c;
}

export function usesPaddedLocalIds(locale: string | null | undefined): boolean {
  const loc = String(locale ?? '')
    .trim()
    .toLowerCase();
  return ['ja', 'ko', 'jp', 'kr', 'zh-cn', 'zh-tw', 'zh'].includes(loc);
}

/** Normaliza collector CardTrader (p. ej. 115/149 → 115, 103a/147 → 103a). */
export function normalizeCollectorNumberForTcgdex(
  raw: string | null | undefined,
): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const slashMatch = /^(\d+[a-zA-Z]?)\s*\/\s*\d+$/.exec(s);
  if (slashMatch) return slashMatch[1];
  // Gem Pack zh: 03-06/09 → 03-06_09 (TCGdex CBB1C)
  const gemPackMatch = /^(\d{2}-\d{2})\/(\d{2})$/.exec(s);
  if (gemPackMatch) return `${gemPackMatch[1]}_${gemPackMatch[2]}`;
  return s;
}

/** Ajusta set resuelto según catálogo (EN svp vs JA Svpromo, zh CSV5C vs Csv5). */
export function adjustSetIdForCatalog(
  setId: string,
  catalog: string | null,
): { tcgdex_set_id: string; locale: string } {
  const id = setId.trim();
  const cat = String(catalog ?? 'en').toLowerCase();

  if (cat === 'en' && id.toLowerCase() === 'svpromo') {
    return { tcgdex_set_id: 'svp', locale: 'en' };
  }

  if (cat === 'zh-cn' || cat === 'zh-tw') {
    const csv = /^csv(\d+)(c)?$/i.exec(id);
    if (csv && !csv[2]) {
      return {
        tcgdex_set_id: `CSV${csv[1]}C`,
        locale: cat === 'zh-tw' ? 'zh-tw' : 'zh-cn',
      };
    }
  }

  return {
    tcgdex_set_id: id,
    locale: cat === 'ko' ? 'ja' : cat || 'en',
  };
}

export function expansionLookupKeys(expansionName?: string): string[] {
  const keys = new Set<string>();
  const label = expansionLabel(expansionName);
  for (const candidate of [label, expansionName ?? '']) {
    const key = normExpansionKey(candidate);
    if (key) keys.add(key);
    const afterColon = candidate.includes(':')
      ? candidate.split(':').slice(1).join(':').trim()
      : '';
    const subKey = normExpansionKey(afterColon);
    if (subKey) keys.add(subKey);
  }
  return [...keys];
}

/** Sets SV/ME, Brilliant Stars en adelante (swsh9+) y promos SV usan localId numérico a 3 dígitos. */
export function usesPaddedLocalIdsForSet(
  setId: string | null | undefined,
): boolean {
  const id = String(setId ?? '').trim();
  const lower = id.toLowerCase();
  if (!id) return false;
  if (/^me(\d|[.])/i.test(id) || lower === 'mep' || lower === 'mee') {
    return true;
  }
  if (lower === '30th' || lower === '30th-c') return true;
  if (/^sv[\d.]/i.test(id) || id === 'Svpromo') return true;
  // swsh1–swsh8 van sin ceros (swsh1-1). Desde Brilliant Stars (swsh9) van a 3 dígitos.
  if (/^swsh(?:9|1[0-2])(?:\.|$)/i.test(id)) return true;
  return false;
}

/** Promos SWSH usan prefijo SWSH + número a 3 dígitos (swshp-SWSH011, swshp-SWSH222). */
export function formatPromoLocalIdForSet(
  setId: string | null | undefined,
  localId: string,
): string {
  const setLower = String(setId ?? '')
    .trim()
    .toLowerCase();
  if (setLower !== 'swshp') return localId;

  const digitsOnly = /^\d+$/.test(localId)
    ? localId
    : /^SWSH(\d+)$/i.exec(localId)?.[1];
  if (!digitsOnly) return localId;

  const digits = digitsOnly.replace(/^0+/, '') || '0';
  return `SWSH${digits.padStart(3, '0')}`;
}

/** CardTrader lista Trainer Gallery bajo el set padre (Lost Origin + #TG23). */
const SWSH_TRAINER_GALLERY_BY_PARENT: Record<string, string> = {
  swsh9: 'swsh9tg',
  swsh10: 'swsh10tg',
  swsh11: 'swsh11tg',
  swsh12: 'swsh12tg',
};

export function isTrainerGalleryLocalId(
  localId: string | null | undefined,
): boolean {
  return /^TG\d+/i.test(String(localId ?? '').trim());
}

/** CardTrader lista Galarian Gallery bajo Crown Zenith (#GG64). */
const SWSH_GALARIAN_GALLERY_BY_PARENT: Record<string, string> = {
  'swsh12.5': 'swsh12.5gg',
};

export function isGalarianGalleryLocalId(
  localId: string | null | undefined,
): boolean {
  return /^GG\d+/i.test(String(localId ?? '').trim());
}

/** Sufijo de colisión CardTrader: `{localId}_{blueprintId}` (p. ej. M2a-205_360075). */
const BLUEPRINT_COLLISION_SUFFIX = /_(\d{5,})$/;

export function tcgdexLocalIdWithBlueprintCollision(
  localId: string,
  blueprintId?: number | null,
): string {
  const base = localId.trim();
  if (
    !base ||
    blueprintId == null ||
    !Number.isInteger(blueprintId) ||
    blueprintId < 10000
  ) {
    return base;
  }
  if (base.endsWith(`_${blueprintId}`)) return base;
  return `${base}_${blueprintId}`;
}

export function stripBlueprintCollisionLocalId(localId: string): string | null {
  const match = BLUEPRINT_COLLISION_SUFFIX.exec(localId.trim());
  if (!match) return null;
  const stripped = localId.trim().slice(0, -match[0].length);
  return stripped || null;
}

type KnownCardTraderPrint = {
  tcgdex_card_id: string;
  tcgdex_set_id: string;
  locale: string;
  blueprintId?: number;
  expansionId?: number;
  expansionName?: string;
  collectorNumbers: string[];
};

/**
 * Prints whose CardTrader collector/expansion do not match the TCGdex localId
 * (CT "Miscellaneous Promos" is a dump; Ancient Mew #011 = miscp-001).
 */
const KNOWN_CARDTRADER_PRINTS: KnownCardTraderPrint[] = [
  {
    tcgdex_card_id: 'miscp-001',
    tcgdex_set_id: 'miscp',
    locale: 'en',
    blueprintId: 152261,
    expansionId: 1470,
    expansionName: 'Miscellaneous Promos',
    collectorNumbers: ['011', '11'],
  },
  /**
   * CT lista Classic Collection bajo Celebrations; #009 choca con cel25-9
   * (Surfing Pikachu VMAX). Solo blueprint — no matchear por collector solo.
   */
  {
    tcgdex_card_id: 'cel25cc-CC011',
    tcgdex_set_id: 'cel25cc',
    locale: 'en',
    blueprintId: 201767,
    collectorNumbers: [],
  },
];

function collectorKey(raw: string | null | undefined): string {
  const normalized = normalizeCollectorNumberForTcgdex(raw);
  if (!normalized) return '';
  if (/^\d+$/.test(normalized)) {
    return String(Number(normalized));
  }
  return normalized.toLowerCase();
}

/** Override puntual CardTrader → id TCGdex real (no remapear el set entero). */
export function resolveKnownCardTraderPrint(args: {
  expansionName?: string;
  expansionId?: number;
  collectorNumber?: string;
  blueprint_id?: number;
}): { tcgdex_card_id: string; tcgdex_set_id: string; locale: string } | null {
  const collector = collectorKey(args.collectorNumber);
  const expansionKey = normExpansionKey(expansionLabel(args.expansionName));
  const blueprintId =
    args.blueprint_id != null && Number.isInteger(args.blueprint_id)
      ? args.blueprint_id
      : null;

  for (const print of KNOWN_CARDTRADER_PRINTS) {
    if (blueprintId != null && print.blueprintId === blueprintId) {
      return {
        tcgdex_card_id: print.tcgdex_card_id,
        tcgdex_set_id: print.tcgdex_set_id,
        locale: print.locale,
      };
    }
    const collectorHit = print.collectorNumbers.some(
      (n) => collectorKey(n) === collector && collector !== '',
    );
    if (!collectorHit) continue;
    const expansionHit =
      (print.expansionId != null && print.expansionId === args.expansionId) ||
      (print.expansionName != null &&
        expansionKey === normExpansionKey(print.expansionName));
    if (expansionHit) {
      return {
        tcgdex_card_id: print.tcgdex_card_id,
        tcgdex_set_id: print.tcgdex_set_id,
        locale: print.locale,
      };
    }
  }
  return null;
}

/** swsh11 + TG23 → swsh11tg. */
export function remapSetIdForTrainerGallery(
  setId: string,
  localId: string | null | undefined,
): string {
  if (!isTrainerGalleryLocalId(localId)) return setId;
  const lower = setId.trim().toLowerCase();
  return SWSH_TRAINER_GALLERY_BY_PARENT[lower] ?? setId;
}

/** swsh12.5 + GG64 → swsh12.5gg (Crown Zenith Galarian Gallery). */
export function remapSetIdForGalarianGallery(
  setId: string,
  localId: string | null | undefined,
): string {
  if (!isGalarianGalleryLocalId(localId)) return setId;
  const lower = setId.trim().toLowerCase();
  return SWSH_GALARIAN_GALLERY_BY_PARENT[lower] ?? setId;
}

/** Shining Fates Shiny Vault: swsh4.5 + #SV035 → swsh4.5sv. */
export function remapSetIdForShinyVault(
  setId: string,
  localId: string | null | undefined,
): string {
  if (!/^SV\d+/i.test(String(localId ?? '').trim())) return setId;
  return setId.trim().toLowerCase() === 'swsh4.5' ? 'swsh4.5sv' : setId;
}

/** Subset TG/GG/SV de un set padre SWSH (orden: TG, GG, Shiny Vault). */
export function remapSetIdForGallerySubset(
  setId: string,
  localId: string | null | undefined,
): string {
  return remapSetIdForShinyVault(
    remapSetIdForGalarianGallery(
      remapSetIdForTrainerGallery(setId, localId),
      localId,
    ),
    localId,
  );
}

/**
 * CardTrader lista la Classic Collection dentro de "30th Celebration"
 * con números de la carta original (BS 4, TEU 33…). TCGdex las separa en 30th-c.
 */
const CELEBRATION_30TH_CLASSIC_LOCAL_ID: Record<string, string> = {
  bs4: '001',
  rs5: '002',
  ds11: '003',
  plb97: '004',
  gh18: '005',
  trr19: '006',
  ng25: '007',
  teu33: '008',
  bkp41: '009',
  la43: '010',
  pl47: '011',
  viv50: '012',
  cin57: '013',
  bs58: '014',
  gc69: '015',
  drx85: '016',
  sum89: '017',
  tm94: '018',
  tm99: '019',
  tm100: '020',
  nvi101: '021',
  ge106: '022',
  prc106: '023',
  nde106: '024',
  uf108: '025',
  fst114: '026',
  brs123: '027',
  ssh138: '028',
  aq149: '029',
  pal203: '030',
};

export function remap30thCelebrationCard(
  setId: string,
  localId: string | null | undefined,
): { setId: string; localId: string | null } {
  const trimmedSet = setId.trim();
  const rawLocal = String(localId ?? '').trim();
  if (!rawLocal || trimmedSet.toLowerCase() !== '30th') {
    return { setId: trimmedSet, localId: rawLocal || null };
  }
  const compact = rawLocal.toLowerCase().replace(/\s+/g, '');
  const classic = CELEBRATION_30TH_CLASSIC_LOCAL_ID[compact];
  if (!classic) return { setId: trimmedSet, localId: rawLocal };
  return { setId: '30th-c', localId: classic };
}

/** Local `swsh11.5tg` vs producción `swsh11tg`, más el padre `swsh11`. */
export function trainerGallerySetIdAliases(setId: string): string[] {
  const trimmed = setId.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const aliases = [trimmed];
  const push = (id: string) => {
    if (id && !aliases.some((x) => x.toLowerCase() === id.toLowerCase())) {
      aliases.push(id);
    }
  };

  const dotted = /^swsh(\d+)\.5tg$/i.exec(lower);
  if (dotted) {
    push(`swsh${dotted[1]}.5tg`);
    push(`swsh${dotted[1]}tg`);
    push(`swsh${dotted[1]}`);
    return aliases;
  }
  const prod = /^swsh(\d+)tg$/i.exec(lower);
  if (prod) {
    push(`swsh${prod[1]}.5tg`);
    push(`swsh${prod[1]}tg`);
    push(`swsh${prod[1]}`);
    return aliases;
  }
  const gallery = SWSH_TRAINER_GALLERY_BY_PARENT[lower];
  if (gallery) {
    push(gallery);
    push(gallery.replace(/tg$/i, '.5tg'));
    push(gallery.replace('.5tg', 'tg'));
  }
  return aliases;
}

/** Local `swsh12.5gg` y el padre `swsh12.5`. */
export function galarianGallerySetIdAliases(setId: string): string[] {
  const trimmed = setId.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const aliases = [trimmed];
  const push = (id: string) => {
    if (id && !aliases.some((x) => x.toLowerCase() === id.toLowerCase())) {
      aliases.push(id);
    }
  };

  if (/^swsh12\.5gg$/i.test(lower)) {
    push('swsh12.5gg');
    push('swsh12.5');
    return aliases;
  }
  const gallery = SWSH_GALARIAN_GALLERY_BY_PARENT[lower];
  if (gallery) push(gallery);
  return aliases;
}

export function formatLocalIdForLocale(
  raw: string | null | undefined,
  locale: string | null | undefined,
  setId?: string | null,
): string | null {
  const normalized = normalizeCollectorNumberForTcgdex(raw);
  if (!normalized) return null;

  const shouldPad =
    usesPaddedLocalIds(locale) || usesPaddedLocalIdsForSet(setId);

  let localId: string;
  if (shouldPad) {
    if (/^\d+$/.test(normalized)) {
      localId = normalized.padStart(3, '0');
    } else {
      localId = normalized;
    }
  } else {
    const withoutLeadingZeros = normalized.replace(/^0+(?=\d)/, '');
    localId = withoutLeadingZeros || '0';
  }

  return formatPromoLocalIdForSet(setId, localId);
}

/** Corrige set ids mangled por códigos CT sin punto (Csm25 → CSM2.5). */
export function normalizeMangledAsiaSetId(setId: string): string {
  const trimmed = setId.trim();
  if (!trimmed) return trimmed;
  const fromCode = CT_CODE_TO_TCGDEX_SET[trimmed.toLowerCase()];
  if (fromCode) return fromCode;
  // Csm25 / CSM25 → CSM2.5 ; Csm15 → CSM1.5
  const undotted = /^csm(\d)(\d)$/i.exec(trimmed);
  if (undotted) return `CSM${undotted[1]}.${undotted[2]}`;
  // Csm2a → CSM2a ; CSM2C → CSM2c (letra de set, no sufijo chino)
  const csmLetter = /^csm(\d+)([a-d])$/i.exec(trimmed);
  if (csmLetter) {
    return `CSM${csmLetter[1]}${csmLetter[2].toLowerCase()}`;
  }
  return trimmed;
}

/** Variantes de id TCGdex para lookup (p. ej. neo3-032 → neo3-32 en EN). */
export function buildTcgdexCardIdLookupCandidates(
  cardId: string,
  language?: string | null,
): string[] {
  const trimmed = (cardId ?? '').trim();
  if (!trimmed) return [];

  const dash = trimmed.lastIndexOf('-');
  if (dash <= 0) return [trimmed];

  const rawSetId = trimmed.slice(0, dash);
  const localId = trimmed.slice(dash + 1);
  const setId = normalizeMangledAsiaSetId(rawSetId);
  const remappedSetId = remapSetIdForGallerySubset(setId, localId);
  const strippedLocalId = stripBlueprintCollisionLocalId(localId);
  const ordered: string[] = [];
  const push = (id: string) => {
    const v = id.trim();
    if (v && !ordered.includes(v)) ordered.push(v);
  };

  const locales = [
    'en',
    catalogLocaleForLanguage(language) ?? 'en',
    'ja',
  ].filter((loc, index, arr) => arr.indexOf(loc) === index);

  const setCandidates = [
    remappedSetId,
    ...trainerGallerySetIdAliases(remappedSetId),
    ...trainerGallerySetIdAliases(setId),
    ...galarianGallerySetIdAliases(remappedSetId),
    ...galarianGallerySetIdAliases(setId),
    rawSetId,
  ];

  const localIdCandidates = [localId, strippedLocalId].filter(
    (id): id is string => Boolean(id),
  );

  for (const setCandidate of setCandidates) {
    for (const locale of locales) {
      for (const localCandidate of localIdCandidates) {
        const formatted = formatLocalIdForLocale(
          localCandidate,
          locale,
          setCandidate,
        );
        if (formatted) push(`${setCandidate}-${formatted}`);
      }
    }
  }

  push(trimmed);
  if (setId !== rawSetId) {
    push(`${setId}-${localId}`);
  }
  return ordered;
}

export type LocaleAliasMap = Record<string, Record<string, string>>;

export type SetLocaleMapFile = {
  locale_set_to_en?: Record<string, Record<string, string>>;
  expansion_to_en_set?: Record<string, string>;
};

export function localeMapForLanguage(
  localeMap: SetLocaleMapFile,
  language?: string,
): Record<string, string> {
  const catalog = catalogLocaleForLanguage(language) ?? 'en';
  const byLoc = localeMap.locale_set_to_en ?? {};
  if (catalog === 'ko') {
    return { ...(byLoc.ja ?? {}), ...(byLoc.ko ?? {}) };
  }
  if (catalog === 'zh-cn' && !byLoc['zh-cn']) {
    return {
      ...(byLoc['zh-tw'] ?? {}),
      ...((byLoc['zh-cn'] as Record<string, string> | undefined) ?? {}),
    };
  }
  return byLoc[catalog] ?? byLoc.en ?? {};
}

export function localeIdFromEn(
  enId: string,
  locMap: Record<string, string>,
): string | null {
  const target = enId.trim().toLowerCase();
  if (!target) return null;
  for (const [lid, mapped] of Object.entries(locMap)) {
    if (
      String(mapped ?? '')
        .trim()
        .toLowerCase() === target
    ) {
      return lid;
    }
  }
  return null;
}

export function localeIdVariants(code: string, catalog: string): string[] {
  const c = code.trim();
  if (!c) return [];
  const out = [c, c.toUpperCase(), c.toLowerCase()];
  if (catalog === 'zh-cn' && /^cs(v)?\d/i.test(c) && !/c$/i.test(c)) {
    out.push(`${c.toUpperCase()}C`);
  }
  return [...new Set(out)];
}

/** Normaliza ids tipo sv08 / SV8 / me02 / ME02 para emparejar catálogos EN↔JA. */
export function normalizeCrossLocaleSetToken(id: string): string | null {
  const trimmed = id.trim();
  const m = /^(sv|me|swsh|sm|xy|dp|pt|bw|base|gym|neo)(\d+[a-z0-9.]*)$/i.exec(
    trimmed,
  );
  if (!m) return null;
  const prefix = m[1].toLowerCase();
  const suffix = m[2].replace(/^0+(?=\d)/, '');
  return `${prefix}${suffix}`.toLowerCase();
}

export function matchLocaleSetIdFromEnCatalog(
  enId: string,
  locMap: Record<string, string>,
): string | null {
  const target = normalizeCrossLocaleSetToken(enId);
  if (!target) return null;
  for (const localeId of Object.keys(locMap)) {
    if (normalizeCrossLocaleSetToken(localeId) === target) {
      return localeId;
    }
  }
  return null;
}

export function resolveSetFromLocaleMap(args: {
  expansionName?: string;
  language?: string;
  localeMap: SetLocaleMapFile;
}): { tcgdex_set_id: string; locale: string } | null {
  const expansionToEn = args.localeMap.expansion_to_en_set ?? {};
  const catalog = catalogLocaleForLanguage(args.language) ?? 'en';
  const locMap = localeMapForLanguage(args.localeMap, args.language);
  const knownLocaleIds = new Set(Object.keys(locMap));

  const label = expansionLabel(args.expansionName);
  for (const key of expansionLookupKeys(args.expansionName)) {
    if (!(key in expansionToEn)) continue;

    const enId = expansionToEn[key]?.trim();
    if (!enId) continue;

    const fromLoc = localeIdFromEn(enId, locMap);
    if (fromLoc) {
      return {
        tcgdex_set_id: fromLoc,
        locale: catalog === 'ko' ? 'ja' : catalog,
      };
    }

    const crossLocale = matchLocaleSetIdFromEnCatalog(enId, locMap);
    if (crossLocale) {
      return {
        tcgdex_set_id: crossLocale,
        locale: catalog === 'ko' ? 'ja' : catalog,
      };
    }

    for (const cand of localeIdVariants(enId, catalog)) {
      if (knownLocaleIds.has(cand)) {
        return {
          tcgdex_set_id: cand,
          locale: catalog === 'ko' ? 'ja' : catalog,
        };
      }
      const caseInsensitive = [...knownLocaleIds].find(
        (id) => id.toLowerCase() === cand.toLowerCase(),
      );
      if (caseInsensitive) {
        return {
          tcgdex_set_id: caseInsensitive,
          locale: catalog === 'ko' ? 'ja' : catalog,
        };
      }
    }

    if (catalog === 'en' || !catalogLocaleForLanguage(args.language)) {
      return { tcgdex_set_id: enId, locale: 'en' };
    }

    if (/^[A-Z]/.test(enId) || /^CS/i.test(enId)) {
      return {
        tcgdex_set_id: enId,
        locale: catalog === 'ko' ? 'ja' : catalog,
      };
    }
  }

  return null;
}

export function resolveSetFromLocaleAliases(args: {
  expansionName?: string;
  language?: string;
  aliases: LocaleAliasMap;
}): { tcgdex_set_id: string; locale: string } | null {
  const label = expansionLabel(args.expansionName);
  const keys = new Set<string>();
  for (const candidate of [label, args.expansionName ?? '']) {
    const key = normExpansionKey(candidate);
    if (key) keys.add(key);
  }
  if (keys.size === 0) return null;

  const catalog = catalogLocaleForLanguage(args.language) ?? 'en';
  const lookupLocales = [
    catalog,
    catalog === 'en' ? 'ja' : catalog,
    'ja',
    'ko',
    'zh-cn',
    'zh-tw',
    'en',
  ].filter((loc, index, arr) => arr.indexOf(loc) === index);

  for (const key of keys) {
    const hit = args.aliases[key];
    if (!hit || typeof hit !== 'object') continue;
    for (const loc of lookupLocales) {
      const setId = hit[loc]?.trim();
      if (setId) {
        return { tcgdex_set_id: setId, locale: loc === 'en' ? 'en' : loc };
      }
    }
    const first = Object.entries(hit).find(
      ([, setId]) => typeof setId === 'string' && setId.trim(),
    );
    if (first) {
      const [loc, setId] = first;
      return { tcgdex_set_id: setId.trim(), locale: loc };
    }
  }

  return null;
}
