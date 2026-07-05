import * as fs from 'fs';
import * as path from 'path';
import {
  ctCodeToSetId,
  normExpansionKey,
  type LocaleAliasMap,
  type SetLocaleMapFile,
} from './tcgdex-set-resolve';

export type HomologSetEntry = {
  tcgdex_set_id?: string;
  locale?: string;
  names?: {
    en_cardtrader?: string | null;
    englishName?: string | null;
    database?: Record<string, string | null>;
  };
  cardtrader?: {
    id?: number;
    code?: string;
  };
};

export type CardTraderOnlyEntry = {
  id?: number;
  code?: string;
  name?: string;
};

export type SetEnglishLabelsFile = {
  sets?: Record<string, HomologSetEntry>;
  cardtrader_en_to_locale?: LocaleAliasMap;
  bySetId?: Record<string, string>;
  byJaName?: Record<string, string>;
};

export type SetResolveMeta = {
  tcgdex_set_id: string;
  locale: string;
};

export type TcgdexSetResolveIndex = {
  byCtExpansionId: Map<number, SetResolveMeta>;
  byCtExpansionName: Map<string, SetResolveMeta>;
  localeAliases: LocaleAliasMap;
  setLocaleById: Map<string, string>;
  localeMap?: SetLocaleMapFile;
};

export function resolveSetEnglishLabelsPath(): string | null {
  const fromEnv = process.env.SET_ENGLISH_LABELS_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, '..', 'cards-database', 'meta', 'set-english-labels.json'),
    path.join(cwd, '..', '..', 'cards-database', 'meta', 'set-english-labels.json'),
    path.join(cwd, 'data', 'set_name_homologs.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveCardTraderHomologPath(): string | null {
  const fromEnv = process.env.CARDTRADER_TCGDEX_HOMOLOG_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }
  const candidate = path.join(process.cwd(), 'data', 'cardtrader_tcgdex_homolog.json');
  return fs.existsSync(candidate) ? candidate : null;
}

export function resolveSetLocaleMapPath(): string | null {
  const fromEnv = process.env.SET_LOCALE_MAP_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'data', 'set_locale_map.json'),
    path.join(cwd, '..', 'scripts', 'card-trader', 'data', 'set_locale_map.json'),
    path.join(cwd, '..', '..', 'scripts', 'card-trader', 'data', 'set_locale_map.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function inferPrimaryLocale(
  setId: string,
  sets: Record<string, HomologSetEntry>,
): string {
  for (const prefix of ['ja', 'ko', 'zh-cn', 'zh-tw', 'en']) {
    const entry = sets[`${prefix}:${setId}`];
    if (entry?.locale?.trim()) {
      return entry.locale.trim();
    }
  }
  if (/^cbb/i.test(setId)) return 'zh-cn';
  if (/^(cs|csv|cbb)/i.test(setId)) return 'zh-cn';
  if (/^(M|S|SV|SM|BW|XY|DP|Pt|L|E|neo|ADV|PCG|H|XY|CP|SM|SWSH)/i.test(setId)) {
    return 'ja';
  }
  return 'en';
}

function collectSetNames(entry: HomologSetEntry): string[] {
  const names = new Set<string>();
  if (entry.names?.en_cardtrader) names.add(String(entry.names.en_cardtrader));
  if (entry.names?.englishName) names.add(String(entry.names.englishName));
  const db = entry.names?.database;
  if (db && typeof db === 'object') {
    for (const v of Object.values(db)) {
      if (v) names.add(String(v));
    }
  }
  return [...names];
}

function registerSetMeta(
  index: TcgdexSetResolveIndex,
  meta: SetResolveMeta,
  names: Iterable<string | null | undefined>,
  expansionId?: number,
): void {
  index.setLocaleById.set(meta.tcgdex_set_id, meta.locale);
  if (typeof expansionId === 'number' && expansionId > 0) {
    index.byCtExpansionId.set(expansionId, meta);
  }
  for (const raw of names) {
    const key = normExpansionKey(raw);
    if (key) index.byCtExpansionName.set(key, meta);
  }
}

function mergeLocaleAliases(
  target: LocaleAliasMap,
  source: LocaleAliasMap | undefined,
): void {
  if (!source || typeof source !== 'object') return;
  for (const [key, hit] of Object.entries(source)) {
    if (!key || !hit || typeof hit !== 'object') continue;
    target[key] = { ...(target[key] ?? {}), ...hit };
  }
}

function registerLocaleAliasBucket(
  aliases: LocaleAliasMap,
  label: string,
  locale: string,
  setId: string,
): void {
  const key = normExpansionKey(label);
  if (!key || !setId) return;
  const bucket = aliases[key] ?? {};
  bucket[locale] = setId;
  if (locale === 'ja') bucket.ko = setId;
  aliases[key] = bucket;
}

export function buildTcgdexSetResolveIndex(
  labels: SetEnglishLabelsFile,
  cardtraderHomolog?: {
    sets?: Record<string, HomologSetEntry>;
    cardtrader_only?: CardTraderOnlyEntry[];
  },
  localeMap?: SetLocaleMapFile,
): TcgdexSetResolveIndex {
  const index: TcgdexSetResolveIndex = {
    byCtExpansionId: new Map(),
    byCtExpansionName: new Map(),
    localeAliases: {},
    setLocaleById: new Map(),
    localeMap,
  };

  const sets = labels.sets ?? {};
  mergeLocaleAliases(index.localeAliases, labels.cardtrader_en_to_locale);

  for (const [mapKey, entry] of Object.entries(sets)) {
    const setId = entry.tcgdex_set_id?.trim();
    if (!setId) continue;
    const locale =
      entry.locale?.trim() || mapKey.split(':')[0]?.trim() || inferPrimaryLocale(setId, sets);
    const meta: SetResolveMeta = { tcgdex_set_id: setId, locale };
    registerSetMeta(index, meta, collectSetNames(entry), entry.cardtrader?.id);
  }

  const englishLabelToSetId = new Map<string, string>();
  for (const [setId, label] of Object.entries(labels.bySetId ?? {})) {
    const key = normExpansionKey(label);
    if (key) englishLabelToSetId.set(key, setId);
  }

  for (const [setId, label] of Object.entries(labels.bySetId ?? {})) {
    const locale = inferPrimaryLocale(setId, sets);
    const meta: SetResolveMeta = { tcgdex_set_id: setId, locale };
    registerSetMeta(index, meta, [label]);
    if (locale !== 'en') {
      registerLocaleAliasBucket(index.localeAliases, label, locale, setId);
    } else {
      registerLocaleAliasBucket(index.localeAliases, label, 'en', setId);
    }
  }

  for (const [jaName, enLabel] of Object.entries(labels.byJaName ?? {})) {
    const setId =
      englishLabelToSetId.get(normExpansionKey(enLabel)) ??
      index.localeAliases[normExpansionKey(enLabel)]?.ja;
    if (!setId) continue;
    const locale = inferPrimaryLocale(setId, sets);
    const meta: SetResolveMeta = { tcgdex_set_id: setId, locale };
    registerSetMeta(index, meta, [jaName, enLabel]);
  }

  for (const entry of Object.values(cardtraderHomolog?.sets ?? {})) {
    const setId = entry.tcgdex_set_id?.trim();
    if (!setId) continue;
    const locale = entry.locale?.trim() || inferPrimaryLocale(setId, sets);
    const meta: SetResolveMeta = { tcgdex_set_id: setId, locale };
    registerSetMeta(index, meta, collectSetNames(entry), entry.cardtrader?.id);
  }

  for (const item of cardtraderHomolog?.cardtrader_only ?? []) {
    const name = String(item.name ?? '').trim();
    const code = String(item.code ?? '').trim();
    if (!name || !code) continue;
    const setId = ctCodeToSetId(code);
    const locale = /^cbb/i.test(code) ? 'zh-cn' : 'ja';
    const meta: SetResolveMeta = { tcgdex_set_id: setId, locale };
    registerSetMeta(
      index,
      meta,
      [name, name.split(':')[0]?.trim()],
      item.id,
    );
    registerLocaleAliasBucket(index.localeAliases, name, locale, setId);
  }

  if (localeMap?.locale_set_to_en) {
    for (const [catalog, idMap] of Object.entries(localeMap.locale_set_to_en)) {
      if (!idMap || typeof idMap !== 'object') continue;
      for (const setId of Object.keys(idMap)) {
        if (!index.setLocaleById.has(setId)) {
          index.setLocaleById.set(
            setId,
            catalog === 'ko' ? 'ja' : catalog,
          );
        }
      }
    }
  }

  return index;
}

export function loadTcgdexSetResolveIndex(): TcgdexSetResolveIndex {
  let labels: SetEnglishLabelsFile = {};
  const labelsPath = resolveSetEnglishLabelsPath();
  if (labelsPath) {
    try {
      labels = JSON.parse(fs.readFileSync(labelsPath, 'utf8')) as SetEnglishLabelsFile;
    } catch {
      labels = {};
    }
  }

  let cardtraderHomolog: {
    sets?: Record<string, HomologSetEntry>;
    cardtrader_only?: CardTraderOnlyEntry[];
  } = {};
  const ctPath = resolveCardTraderHomologPath();
  if (ctPath) {
    try {
      cardtraderHomolog = JSON.parse(fs.readFileSync(ctPath, 'utf8')) as typeof cardtraderHomolog;
    } catch {
      cardtraderHomolog = {};
    }
  }

  let localeMap: SetLocaleMapFile | undefined;
  const localeMapPath = resolveSetLocaleMapPath();
  if (localeMapPath) {
    try {
      localeMap = JSON.parse(
        fs.readFileSync(localeMapPath, 'utf8'),
      ) as SetLocaleMapFile;
    } catch {
      localeMap = undefined;
    }
  }

  return buildTcgdexSetResolveIndex(labels, cardtraderHomolog, localeMap);
}
