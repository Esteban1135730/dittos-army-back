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

/** Normaliza collector CardTrader (p. ej. 115/149 → 115). */
export function normalizeCollectorNumberForTcgdex(
  raw: string | null | undefined,
): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const slashMatch = /^(\d+)\s*\/\s*\d+$/.exec(s);
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

/** Sets SV/ME y promos SV usan localId numérico a 3 dígitos en TCGdex. */
export function usesPaddedLocalIdsForSet(
  setId: string | null | undefined,
): boolean {
  const id = String(setId ?? '').trim();
  const lower = id.toLowerCase();
  if (!id) return false;
  if (/^me(\d|[.])/i.test(id) || lower === 'mep' || lower === 'mee') {
    return true;
  }
  if (/^sv[\d.]/i.test(id) || id === 'Svpromo') return true;
  return false;
}

/** Promos SWSH usan prefijo SWSH + número (swshp-SWSH222). */
export function formatPromoLocalIdForSet(
  setId: string | null | undefined,
  localId: string,
): string {
  const setLower = String(setId ?? '')
    .trim()
    .toLowerCase();
  if (setLower === 'swshp' && /^\d+$/.test(localId)) {
    return `SWSH${localId.replace(/^0+/, '') || '0'}`;
  }
  return localId;
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

  for (const setCandidate of [setId, rawSetId]) {
    for (const locale of locales) {
      const formatted = formatLocalIdForLocale(localId, locale, setCandidate);
      if (formatted) push(`${setCandidate}-${formatted}`);
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
    if (String(mapped ?? '').trim().toLowerCase() === target) {
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
  const m = /^(sv|me|swsh|sm|xy|dp|pt|bw|base|gym|neo)(\d+[a-z0-9.]*)$/i.exec(trimmed);
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
