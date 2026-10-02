import { AsyncLocalStorage } from 'async_hooks';
import { isTcgKey, TCG_KEYS, type TcgKey } from '../config/owners.config';

export type ActiveTcg = TcgKey;

type TcgStore = { tcg: ActiveTcg };

const tcgAls = new AsyncLocalStorage<TcgStore>();

export function getCurrentTcg(): ActiveTcg {
  return tcgAls.getStore()?.tcg ?? 'pokemon';
}

export function runWithTcg<T>(tcg: ActiveTcg, fn: () => T): T {
  return tcgAls.run({ tcg }, fn);
}

export function isActiveTcg(value: unknown): value is ActiveTcg {
  return isTcgKey(value);
}

/**
 * Resolve TCG from X-Tcg / ?tcg= / request path.
 * Invalid header/query → null. Missing → path heuristic or pokemon.
 */
export function resolveTcgFromRequest(input: {
  header?: string | string[] | undefined;
  query?: string | string[] | undefined;
  path?: string | undefined;
}): ActiveTcg | null {
  const rawHeader = Array.isArray(input.header) ? input.header[0] : input.header;
  const rawQuery = Array.isArray(input.query) ? input.query[0] : input.query;
  const raw = (rawHeader ?? rawQuery)?.trim().toLowerCase();
  if (raw) {
    if (!isActiveTcg(raw)) return null;
    return raw;
  }
  const path = input.path ?? '';
  for (const tcg of TCG_KEYS) {
    if (path === `/${tcg}` || path.startsWith(`/${tcg}/`)) {
      return tcg;
    }
  }
  return 'pokemon';
}
