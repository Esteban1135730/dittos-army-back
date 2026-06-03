/** Extrae nombre legible de `set` TCGdex (`swsh3(Champion's Path)` → `Champion's Path`). */
export function parseTcgdexSetName(setField: string | undefined): string {
  if (!setField?.trim()) return '';
  const match = setField.trim().match(/\(([^)]+)\)\s*$/);
  if (match?.[1]) return match[1].trim();
  return setField.trim();
}

const RAREZA_LABELS: Record<string, string> = {
  hollow: 'Hollow',
  foil: 'Foil',
  pokeball: 'Pokeball',
  masterball: 'Masterball',
  'first edition': 'First edition',
  holofoil: 'Holofoil',
  'league card': 'Carta de liga',
};

export function operationalRarezaLabel(
  value: string | null | undefined,
): string | null {
  if (value == null || value.trim() === '') return null;
  return RAREZA_LABELS[value] ?? value;
}

export function languageLabel(code: string | undefined | null): string {
  if (!code?.trim()) return '—';
  return code.trim().toUpperCase();
}
