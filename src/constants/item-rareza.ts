/** Variantes operativas alineadas a incoming / stock (`rareza`). */
export const INCOMING_ITEM_RAREZA_VALUES: ReadonlySet<string> = new Set([
  'hollow',
  'foil',
  'pokeball',
  'masterball',
  'first edition',
  /** Acabado / tipo carta (antes solo boolean en stock) */
  'holofoil',
  /** Carta de liga (antes solo `league_card` en stock) */
  'league card',
]);

export function normalizeRarezaInput(
  raw: string | null | undefined,
): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim().toLowerCase();
}

/** Alias / legacy → clave del catálogo `INCOMING_ITEM_RAREZA_VALUES`. */
export function normalizeRarezaCatalogKey(rz: string | null): string | null {
  if (rz === null) return null;
  if (rz === 'league_card') return 'league card';
  return rz;
}

/** Valor canónico para API / PVP / stock (trim, minúsculas, alias). */
export function normalizeOperationalRareza(
  raw: string | null | undefined,
): string | null {
  return normalizeRarezaCatalogKey(normalizeRarezaInput(raw));
}

export function isValidOperationalRareza(rz: string | null): boolean {
  if (rz === null) return true;
  return INCOMING_ITEM_RAREZA_VALUES.has(rz);
}
