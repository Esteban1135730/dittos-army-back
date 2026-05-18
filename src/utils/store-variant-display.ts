import { normalizeOperationalRareza } from '../constants/item-rareza';

/** Etiqueta visible en mensaje WhatsApp (tienda) → rareza operativa en stock. */
const DISPLAY_TO_RAREZA: Record<string, string> = {
  hollow: 'hollow',
  foil: 'foil',
  'pokéball reverse': 'pokeball',
  'pokeball reverse': 'pokeball',
  'masterball reverse': 'masterball',
  'first edition': 'first edition',
  holofoil: 'holofoil',
  holo: 'holofoil',
  'league card': 'league card',
};

export function operationalRarezaFromStoreVariantTag(
  displayTag: string | null | undefined,
): string | null {
  if (displayTag == null || String(displayTag).trim() === '') return null;
  const key = String(displayTag).trim().toLowerCase();
  const mapped = DISPLAY_TO_RAREZA[key];
  if (mapped) return normalizeOperationalRareza(mapped);
  return normalizeOperationalRareza(displayTag);
}
