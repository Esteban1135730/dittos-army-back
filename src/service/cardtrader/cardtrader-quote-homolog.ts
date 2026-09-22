import * as fs from 'fs';
import { resolveCardTraderHomologPath } from '../../pokemon';

export type QuoteExpansionHit = {
  expansionId: number;
  expansionName: string;
};

export type QuoteExpansionIndex = {
  byEnCardtrader: Map<string, QuoteExpansionHit[]>;
  byOtherNames: Map<string, QuoteExpansionHit[]>;
  /** Claves: set id (`sv8a`) y `locale:setid` (`ja:sv8a`). Varios CT por el mismo set. */
  byTcgdexSetId: Map<string, QuoteExpansionHit[]>;
  enCardtraderNames: Array<{ key: string; hit: QuoteExpansionHit }>;
};

const EXPANSION_ALIASES: Record<string, string> = {
  'svp black star promos': 'sv black star promos',
  'svp black star promo': 'sv black star promos',
};

export function foldExpansionKey(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function uniqueHit(
  hits: QuoteExpansionHit[],
): QuoteExpansionHit | 'ambiguous' | null {
  const ids = new Set(hits.map((h) => h.expansionId));
  if (ids.size === 0) return null;
  if (ids.size > 1) return 'ambiguous';
  return hits[0];
}

function pushNamed(
  map: Map<string, QuoteExpansionHit[]>,
  rawName: string | null | undefined,
  hit: QuoteExpansionHit,
): void {
  const key = foldExpansionKey(rawName);
  if (!key) return;
  const list = map.get(key) ?? [];
  if (!list.some((x) => x.expansionId === hit.expansionId)) {
    list.push(hit);
  }
  map.set(key, list);
}

type HomologFile = {
  sets?: Record<
    string,
    {
      tcgdex_set_id?: string;
      locale?: string;
      names?: {
        en_cardtrader?: string | null;
        englishName?: string | null;
        database?: Record<string, string | null>;
      };
      cardtrader?: { id?: number };
    }
  >;
  cardtrader_only?: Array<{ id?: number; name?: string; code?: string }>;
};

function pushSetHit(
  map: Map<string, QuoteExpansionHit[]>,
  rawKey: string | null | undefined,
  hit: QuoteExpansionHit,
  preferFront?: boolean,
): void {
  const key = foldExpansionKey(rawKey);
  if (!key) return;
  const list = map.get(key) ?? [];
  if (list.some((x) => x.expansionId === hit.expansionId)) {
    if (preferFront) {
      map.set(key, [
        hit,
        ...list.filter((x) => x.expansionId !== hit.expansionId),
      ]);
    }
    return;
  }
  map.set(key, preferFront ? [hit, ...list] : [...list, hit]);
}

export function buildQuoteExpansionIndex(
  file: HomologFile,
): QuoteExpansionIndex {
  const byEnCardtrader = new Map<string, QuoteExpansionHit[]>();
  const byOtherNames = new Map<string, QuoteExpansionHit[]>();
  const byTcgdexSetId = new Map<string, QuoteExpansionHit[]>();
  const enCardtraderNames: Array<{ key: string; hit: QuoteExpansionHit }> = [];
  const seenNameId = new Set<string>();

  const addEntry = (
    expansionId: number,
    enCardtrader: string | null | undefined,
    otherNames: Array<string | null | undefined>,
    tcgdexSetId?: string | null,
    isMainForSet?: boolean,
    homologKey?: string | null,
    locale?: string | null,
  ) => {
    if (!Number.isInteger(expansionId) || expansionId < 1) return;
    const display = String(
      enCardtrader ?? otherNames.find(Boolean) ?? '',
    ).trim();
    const hit: QuoteExpansionHit = {
      expansionId,
      expansionName: display || `Expansion ${expansionId}`,
    };
    if (enCardtrader) {
      pushNamed(byEnCardtrader, enCardtrader, hit);
      const key = foldExpansionKey(enCardtrader);
      const dedupe = `${key}:${expansionId}`;
      if (key && !seenNameId.has(dedupe)) {
        seenNameId.add(dedupe);
        enCardtraderNames.push({ key, hit });
      }
    }
    for (const name of otherNames) {
      pushNamed(byOtherNames, name, hit);
    }
    pushSetHit(byTcgdexSetId, tcgdexSetId, hit, isMainForSet);
    pushSetHit(byTcgdexSetId, homologKey, hit, true);
    if (locale && tcgdexSetId) {
      pushSetHit(byTcgdexSetId, `${locale}:${tcgdexSetId}`, hit, true);
    }
  };

  for (const [homologKey, entry] of Object.entries(file.sets ?? {})) {
    const id = entry.cardtrader?.id;
    if (typeof id !== 'number') continue;
    const db = entry.names?.database;
    const others = [
      entry.names?.englishName,
      ...(db && typeof db === 'object' ? Object.values(db) : []),
    ];
    const enCt = entry.names?.en_cardtrader;
    const dbEn = db && typeof db === 'object' ? db.en : null;
    const isMain =
      !!enCt && !!dbEn && foldExpansionKey(enCt) === foldExpansionKey(dbEn);
    addEntry(
      id,
      enCt,
      others,
      entry.tcgdex_set_id,
      isMain,
      homologKey,
      entry.locale,
    );
  }

  for (const item of file.cardtrader_only ?? []) {
    if (typeof item.id !== 'number') continue;
    addEntry(item.id, item.name, [item.name], item.code);
  }

  return { byEnCardtrader, byOtherNames, byTcgdexSetId, enCardtraderNames };
}

export function loadQuoteExpansionIndex(): QuoteExpansionIndex {
  const path = resolveCardTraderHomologPath();
  if (!path) return buildQuoteExpansionIndex({});
  try {
    const raw = JSON.parse(fs.readFileSync(path, 'utf8')) as HomologFile;
    return buildQuoteExpansionIndex(raw);
  } catch {
    return buildQuoteExpansionIndex({});
  }
}

function lookupExact(
  index: QuoteExpansionIndex,
  key: string,
): QuoteExpansionHit | 'ambiguous' | null {
  const fromCt = uniqueHit(index.byEnCardtrader.get(key) ?? []);
  if (fromCt) return fromCt;
  return uniqueHit(index.byOtherNames.get(key) ?? []);
}

function lookupPrefix(
  index: QuoteExpansionIndex,
  messageKey: string,
): QuoteExpansionHit | 'ambiguous' | null {
  const matches: Array<{ key: string; hit: QuoteExpansionHit }> = [];
  for (const row of index.enCardtraderNames) {
    if (row.key.length < 8) continue;
    if (messageKey === row.key) continue;
    if (
      messageKey.startsWith(`${row.key} `) ||
      messageKey.includes(` ${row.key} `) ||
      messageKey.endsWith(` ${row.key}`)
    ) {
      matches.push(row);
    }
  }
  if (matches.length === 0) return null;
  const maxLen = Math.max(...matches.map((m) => m.key.length));
  const longest = matches.filter((m) => m.key.length === maxLen);
  return uniqueHit(longest.map((m) => m.hit));
}

export function resolveQuoteExpansion(
  index: QuoteExpansionIndex,
  expansionName: string | null | undefined,
): QuoteExpansionHit | 'ambiguous' | null {
  const key = foldExpansionKey(expansionName);
  if (!key) return null;

  const exact = lookupExact(index, key);
  if (exact) return exact;

  const aliased = EXPANSION_ALIASES[key];
  if (aliased) {
    const viaAlias = lookupExact(index, aliased);
    if (viaAlias) return viaAlias;
  }

  return lookupPrefix(index, key);
}

function pushHits(
  out: QuoteExpansionHit[],
  seen: Set<number>,
  hits: QuoteExpansionHit[] | undefined,
): void {
  for (const hit of hits ?? []) {
    if (seen.has(hit.expansionId)) continue;
    seen.add(hit.expansionId);
    out.push(hit);
  }
}

/** Expansiones CT para un set TCGdex. Con locale, prioriza `ja:sv8a` / `zh-tw:sv8a`. */
export function listExpansionsForTcgdexSet(
  index: QuoteExpansionIndex,
  tcgdexSetId: string | null | undefined,
  locale?: string | null,
): QuoteExpansionHit[] {
  const setId = String(tcgdexSetId ?? '').trim();
  if (!setId) return [];
  const out: QuoteExpansionHit[] = [];
  const seen = new Set<number>();
  const loc = String(locale ?? '')
    .trim()
    .toLowerCase();
  if (loc) {
    pushHits(
      out,
      seen,
      index.byTcgdexSetId.get(foldExpansionKey(`${loc}:${setId}`)),
    );
    if (loc === 'zh' || loc === 'zh-cn' || loc === 'zh-tw') {
      pushHits(
        out,
        seen,
        index.byTcgdexSetId.get(foldExpansionKey(`zh-tw:${setId}`)),
      );
      pushHits(
        out,
        seen,
        index.byTcgdexSetId.get(foldExpansionKey(`zh-cn:${setId}`)),
      );
    }
  }
  pushHits(out, seen, index.byTcgdexSetId.get(foldExpansionKey(setId)));
  return out;
}

export function resolveExpansionByTcgdexSetId(
  index: QuoteExpansionIndex,
  tcgdexSetId: string | null | undefined,
  locale?: string | null,
): QuoteExpansionHit | null {
  return listExpansionsForTcgdexSet(index, tcgdexSetId, locale)[0] ?? null;
}

export function tcgdexSetIdFromCardResume(card: {
  id?: string;
  localId?: string;
}): string {
  const id = String(card.id ?? '').trim();
  const localId = String(card.localId ?? '').trim();
  if (!id) return '';
  if (localId) {
    const suffix = `-${localId}`;
    if (id.toLowerCase().endsWith(suffix.toLowerCase())) {
      return id.slice(0, id.length - suffix.length);
    }
  }
  const dash = id.lastIndexOf('-');
  return dash > 0 ? id.slice(0, dash) : id;
}
