import type { CatalogCard, CatalogSet } from '../tcg-catalog.types';

export const SCRYFALL_API = 'https://api.scryfall.com';

/** Tipos de set de Scryfall que no son cartas físicas vendibles. */
const EXCLUDED_SET_TYPES = new Set(['token', 'memorabilia', 'alchemy', 'minigame']);

type ScryfallSetRaw = {
  code?: string;
  name?: string;
  card_count?: number;
  released_at?: string;
  set_type?: string;
  digital?: boolean;
};

type ScryfallImageUris = { small?: string; normal?: string; large?: string };

type ScryfallCardRaw = {
  id?: string;
  name?: string;
  set?: string;
  set_name?: string;
  collector_number?: string;
  rarity?: string;
  type_line?: string;
  image_uris?: ScryfallImageUris;
  card_faces?: Array<{ image_uris?: ScryfallImageUris }>;
};

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : '';
}

export function mapMagicSet(raw: ScryfallSetRaw): CatalogSet | null {
  const code = raw.code?.trim().toUpperCase() ?? '';
  const name = raw.name?.trim() ?? '';
  if (!code || !name || raw.digital) return null;
  if (EXCLUDED_SET_TYPES.has(raw.set_type ?? '')) return null;
  if (!(Number(raw.card_count) > 0)) return null;
  return {
    code,
    name,
    cardCount: Number(raw.card_count),
    releasedAt: raw.released_at?.trim() || null,
  };
}

/** `card_id` de stock = `{set}-{collector_number}` (p. ej. `lea-161`), único por impresión. */
export function mapMagicCard(raw: ScryfallCardRaw): CatalogCard | null {
  const name = raw.name?.trim() ?? '';
  const set = raw.set?.trim().toLowerCase() ?? '';
  const number = raw.collector_number?.trim() ?? '';
  if (!name || !set || !number) return null;
  const images = raw.image_uris ?? raw.card_faces?.[0]?.image_uris;
  return {
    id: `${set}-${number}`,
    name,
    type: raw.type_line?.trim() ?? '',
    number,
    rarity: capitalize(raw.rarity?.trim() ?? ''),
    setName: raw.set_name?.trim() ?? '',
    image: images?.small || images?.normal || '',
    imageLarge: images?.normal || images?.large || images?.small || '',
  };
}
