import type { TcgKey } from '../config/owners.config';

/** TCGs con catálogo externo para alta de stock (Pokémon usa TCGdex). */
export type CatalogTcg = Exclude<TcgKey, 'pokemon'>;

export type CatalogSet = {
  code: string;
  name: string;
  cardCount: number;
  releasedAt: string | null;
};

export type CatalogCard = {
  id: string;
  name: string;
  type: string;
  number: string;
  rarity: string;
  setName: string;
  image: string;
  imageLarge: string;
};

export interface TcgCatalogProvider {
  readonly tcg: CatalogTcg;
  listSets(query?: string): Promise<CatalogSet[]>;
  /** `setKey` acepta nombre o código de la expansión. */
  cardsInSet(setKey: string): Promise<{ set: CatalogSet; cards: CatalogCard[] }>;
  searchByName(query: string): Promise<CatalogCard[]>;
}

export const CATALOG_SEARCH_LIMIT = 30;

export function filterCatalogSets(sets: CatalogSet[], query: string): CatalogSet[] {
  const q = query.trim().toLowerCase();
  if (!q) return sets;
  return sets.filter(
    (set) =>
      set.name.toLowerCase().includes(q) || set.code.toLowerCase().includes(q),
  );
}

/** Busca por nombre exacto (sin mayúsculas) y luego por código. */
export function findCatalogSet(
  sets: CatalogSet[],
  setKey: string,
): CatalogSet | undefined {
  const key = setKey.trim().toLowerCase();
  if (!key) return undefined;
  return (
    sets.find((set) => set.name.toLowerCase() === key) ??
    sets.find((set) => set.code.toLowerCase() === key)
  );
}

/** Exacto → prefijo → contiene; desempata por longitud del nombre. */
export function rankCardsByName(cards: CatalogCard[], query: string): CatalogCard[] {
  const q = query.trim().toLowerCase();
  const score = (name: string) => {
    const n = name.toLowerCase();
    if (n === q) return 3;
    if (n.startsWith(q)) return 2;
    if (n.includes(q)) return 1;
    return 0;
  };
  return cards
    .map((card) => ({ card, s: score(card.name) }))
    .filter((row) => row.s > 0)
    .sort((a, b) => b.s - a.s || a.card.name.length - b.card.name.length)
    .map((row) => row.card);
}
