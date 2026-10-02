import type { CatalogCard, CatalogSet } from '../tcg-catalog.types';

export const OPTCG_API = 'https://optcgapi.com/api';

export type OnePieceSetKind = 'booster' | 'deck';

type OptcgSetRaw = {
  set_id?: string;
  set_name?: string;
  structure_deck_id?: string;
  structure_deck_name?: string;
};

type OptcgCardRaw = {
  card_name?: string;
  card_set_id?: string;
  card_image_id?: string;
  card_image?: string;
  card_type?: string;
  rarity?: string;
  set_name?: string;
};

/** Boosters (`allSets`) y starter decks (`allDecks`) comparten la misma forma de set. */
export function mapOnePieceSet(raw: OptcgSetRaw): CatalogSet | null {
  const code = (raw.set_id ?? raw.structure_deck_id)?.trim() ?? '';
  const name = (raw.set_name ?? raw.structure_deck_name)?.trim() ?? '';
  if (!code || !name) return null;
  return { code, name, cardCount: 0, releasedAt: null };
}

/** `card_image_id` distingue arte alternativo (`OP01-077_p1`); se usa como `card_id`. */
export function mapOnePieceCard(raw: OptcgCardRaw): CatalogCard | null {
  const name = raw.card_name?.trim() ?? '';
  const number = raw.card_set_id?.trim() ?? '';
  const id = raw.card_image_id?.trim() || number;
  if (!name || !id) return null;
  const image = raw.card_image?.trim() ?? '';
  return {
    id,
    name,
    type: raw.card_type?.trim() ?? '',
    number,
    rarity: raw.rarity?.trim() ?? '',
    setName: raw.set_name?.trim() ?? '',
    image,
    imageLarge: image,
  };
}

export function dedupeCardsById(cards: CatalogCard[]): CatalogCard[] {
  const byId = new Map<string, CatalogCard>();
  for (const card of cards) {
    if (!byId.has(card.id)) byId.set(card.id, card);
  }
  return [...byId.values()];
}
