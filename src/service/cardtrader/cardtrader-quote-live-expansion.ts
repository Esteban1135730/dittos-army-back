import type { QuoteExpansionHit } from './cardtrader-quote-homolog';

/** Índice construido desde `GET /expansions` de CardTrader (sin homologación). */
export type LiveExpansionIndex = {
  byName: Map<string, QuoteExpansionHit[]>;
  byCode: Map<string, QuoteExpansionHit[]>;
  names: Array<{ key: string; hit: QuoteExpansionHit }>;
};

const PREFIX_MIN_KEY_LENGTH = 8;

/** Más laxo que `foldExpansionKey`: `&` → `and` y sin puntuación (`:`, `—`, `'`). */
export function foldLiveExpansionKey(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}.]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function push(
  map: Map<string, QuoteExpansionHit[]>,
  key: string,
  hit: QuoteExpansionHit,
): void {
  if (!key) return;
  const list = map.get(key) ?? [];
  if (!list.some((x) => x.expansionId === hit.expansionId)) list.push(hit);
  map.set(key, list);
}

export function buildLiveExpansionIndex(raw: unknown): LiveExpansionIndex {
  const byName = new Map<string, QuoteExpansionHit[]>();
  const byCode = new Map<string, QuoteExpansionHit[]>();
  const names: Array<{ key: string; hit: QuoteExpansionHit }> = [];
  if (!Array.isArray(raw)) return { byName, byCode, names };

  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const exp = row as { id?: unknown; name?: unknown; code?: unknown };
    if (typeof exp.id !== 'number' || !Number.isInteger(exp.id) || exp.id < 1) {
      continue;
    }
    const name = typeof exp.name === 'string' ? exp.name.trim() : '';
    if (!name) continue;
    const hit: QuoteExpansionHit = { expansionId: exp.id, expansionName: name };
    const key = foldLiveExpansionKey(name);
    push(byName, key, hit);
    if (key) names.push({ key, hit });
    if (typeof exp.code === 'string') {
      push(byCode, foldLiveExpansionKey(exp.code), hit);
    }
  }
  return { byName, byCode, names };
}

/**
 * Expansiones CardTrader cuyo nombre concuerda con el set del mensaje.
 * Orden: nombre exacto + subsets que empiezan igual (`Hidden Fates: Shiny Vault`)
 * → código exacto → nombre CT más largo contenido en el mensaje.
 */
export function matchLiveExpansions(
  index: LiveExpansionIndex,
  expansionName: string | null | undefined,
): QuoteExpansionHit[] {
  const key = foldLiveExpansionKey(expansionName);
  if (!key) return [];

  const exact = index.byName.get(key) ?? [];
  const allowRelated = exact.length > 0 || key.length >= PREFIX_MIN_KEY_LENGTH;
  const related = index.names
    .filter((row) => allowRelated && row.key.startsWith(`${key} `))
    .sort((a, b) => a.key.length - b.key.length)
    .map((row) => row.hit);
  const named: QuoteExpansionHit[] = [];
  for (const hit of [...exact, ...related]) {
    if (!named.some((x) => x.expansionId === hit.expansionId)) named.push(hit);
  }
  if (named.length) return named;

  const byCode = index.byCode.get(key);
  if (byCode?.length) return byCode;

  const matches = index.names.filter(
    (row) =>
      row.key.length >= PREFIX_MIN_KEY_LENGTH &&
      (key.startsWith(`${row.key} `) ||
        key.includes(` ${row.key} `) ||
        key.endsWith(` ${row.key}`)),
  );
  if (matches.length === 0) return [];
  const maxLen = Math.max(...matches.map((m) => m.key.length));
  const out: QuoteExpansionHit[] = [];
  for (const m of matches) {
    if (m.key.length !== maxLen) continue;
    if (!out.some((x) => x.expansionId === m.hit.expansionId)) out.push(m.hit);
  }
  return out;
}
