import { BadGatewayException, Logger } from '@nestjs/common';

const USER_AGENT = 'DittosArmy/1.0 (panel catalog)';

/**
 * GET JSON de un catálogo externo. Estados en `emptyOnStatus` (p. ej. 404 "sin
 * resultados") devuelven null; el resto de errores → 502 con mensaje legible.
 */
export async function fetchCatalogJson<T>(
  url: string,
  opts: { label: string; logger: Logger; emptyOnStatus?: number[] },
): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network';
    opts.logger.warn(`${opts.label} no responde: ${message}`);
    throw new BadGatewayException(`No se pudo consultar el catálogo de ${opts.label}`);
  }
  if (!response.ok) {
    if (opts.emptyOnStatus?.includes(response.status)) return null;
    opts.logger.warn(`${opts.label} HTTP ${response.status} ${url}`);
    throw new BadGatewayException(`El catálogo de ${opts.label} respondió con error`);
  }
  return (await response.json()) as T;
}

/** Memoiza un loader asíncrono durante `ttlMs`; los errores no se cachean. */
export function cachedLoader<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let cache: { at: number; value: T } | null = null;
  let pending: Promise<T> | null = null;
  return async () => {
    if (cache && Date.now() - cache.at < ttlMs) return cache.value;
    if (!pending) {
      pending = load()
        .then((value) => {
          cache = { at: Date.now(), value };
          return value;
        })
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  };
}
