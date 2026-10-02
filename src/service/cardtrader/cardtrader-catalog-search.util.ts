/** Máx. nombres canónicos a consultar en CardTrader (rate limit). */
export const CATALOG_CT_NAME_LOOKUP_LIMIT = 8;

/** Máx. blueprints en la respuesta de cotizar. */
export const CATALOG_CT_SEARCH_RESULT_LIMIT = 40;

/**
 * Quita sufijos de variante del catálogo (`Zoro-Juurou (SP)` → `Zoro-Juurou`):
 * CardTrader nombra el blueprint sin ellos.
 */
export function stripCatalogVariantSuffix(name: string): string {
  return name.replace(/\s*\([^()]*\)\s*$/, '').trim() || name.trim();
}

/**
 * Ordena nombres de carta para búsqueda CT (nombre exacto).
 * Prioriza coincidencia exacta → prefijo → substring; desempata por longitud.
 * Siempre incluye `query` como primer candidato (búsqueda CT directa).
 */
export function rankCatalogNamesForCardTraderSearch(
  query: string,
  catalogNames: string[],
  limit: number = CATALOG_CT_NAME_LOOKUP_LIMIT,
): string[] {
  const qRaw = query.trim();
  if (!qRaw || limit < 1) return [];
  const q = qRaw.toLowerCase();

  const unique = new Map<string, string>();
  for (const raw of catalogNames) {
    const name = raw?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!unique.has(key)) unique.set(key, name);
  }

  const scored = [...unique.values()].map((name) => {
    const n = name.toLowerCase();
    let score = 10;
    if (n === q) score = 300;
    else if (n.startsWith(q)) score = 200;
    else if (n.includes(q)) score = 100;
    return { name, score, len: name.length };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.len - b.len ||
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
  );

  const out: string[] = [qRaw];
  const seen = new Set([q.toLowerCase()]);
  for (const row of scored) {
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.name);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}
