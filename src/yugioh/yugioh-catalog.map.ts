export type YugiohSet = {
  code: string;
  name: string;
  cardCount: number;
  releasedAt: string | null;
};

export type YugiohCard = {
  id: string;
  name: string;
  type: string;
  number: string;
  rarity: string;
  setName: string;
  image: string;
  imageLarge: string;
};

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

export function mapYugiohSet(raw: YgoSetRaw): YugiohSet | null {
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

export function mapYugiohCard(raw: YgoCardRaw, setName: string): YugiohCard | null {
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

export function filterYugiohSets(sets: YugiohSet[], query: string): YugiohSet[] {
  const q = query.trim().toLowerCase();
  if (!q) return sets;
  return sets.filter(
    (set) =>
      set.name.toLowerCase().includes(q) || set.code.toLowerCase().includes(q),
  );
}
