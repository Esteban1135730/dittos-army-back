import type { CatalogCard, CatalogSet } from '../tcg-catalog.types';

export const YGOPRODECK_API = 'https://db.ygoprodeck.com/api/v7';

type YgoSetRaw = {
  set_name?: string;
  set_code?: string;
  num_of_cards?: number;
  tcg_date?: string;
};

type YgoCardSetRaw = {
  set_name?: string;
  set_code?: string;
  set_rarity?: string;
};

type YgoCardRaw = {
  id?: number;
  name?: string;
  type?: string;
  card_sets?: YgoCardSetRaw[];
  card_images?: Array<{ image_url?: string; image_url_small?: string }>;
};

export function mapYugiohSet(raw: YgoSetRaw): CatalogSet | null {
  const code = raw.set_code?.trim() ?? '';
  const name = raw.set_name?.trim() ?? '';
  if (!code || !name) return null;
  return {
    code,
    name,
    cardCount: Number(raw.num_of_cards) || 0,
    releasedAt: raw.tcg_date?.trim() || null,
  };
}

export function mapYugiohCard(raw: YgoCardRaw, setName: string): CatalogCard | null {
  if (raw.id == null || !raw.name?.trim()) return null;
  const wanted = setName.trim().toLowerCase();
  const rows = raw.card_sets ?? [];
  const printing = wanted
    ? rows.find((row) => row.set_name?.trim().toLowerCase() === wanted)
    : rows[0];
  const image = raw.card_images?.[0];
  return {
    id: String(raw.id),
    name: raw.name.trim(),
    type: raw.type?.trim() ?? '',
    number: printing?.set_code?.trim() ?? '',
    rarity: printing?.set_rarity?.trim() ?? '',
    setName: printing?.set_name?.trim() ?? '',
    image: image?.image_url_small || image?.image_url || '',
    imageLarge: image?.image_url || image?.image_url_small || '',
  };
}
