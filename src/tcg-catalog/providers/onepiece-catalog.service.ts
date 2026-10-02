import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { cachedLoader, fetchCatalogJson } from '../catalog-http';
import {
  CATALOG_SEARCH_LIMIT,
  filterCatalogSets,
  findCatalogSet,
  rankCardsByName,
  type CatalogCard,
  type CatalogSet,
  type TcgCatalogProvider,
} from '../tcg-catalog.types';
import {
  dedupeCardsById,
  mapOnePieceCard,
  mapOnePieceSet,
  OPTCG_API,
  type OnePieceSetKind,
} from './onepiece-catalog.map';

const SETS_CACHE_MS = 6 * 60 * 60 * 1000;
const LABEL = 'One Piece';

type IndexedSet = { set: CatalogSet; kind: OnePieceSetKind };

/**
 * Catálogo One Piece TCG vía optcgapi.com. La API no busca por nombre, así que
 * la búsqueda filtra el listado completo de cartas (cacheado).
 */
@Injectable()
export class OnePieceCatalogService implements TcgCatalogProvider {
  readonly tcg = 'onepiece' as const;
  private readonly logger = new Logger(OnePieceCatalogService.name);

  private readonly loadSets = cachedLoader(SETS_CACHE_MS, async (): Promise<IndexedSet[]> => {
    const [boosters, decks] = await Promise.all([
      this.get<unknown[]>(`${OPTCG_API}/allSets/`),
      this.get<unknown[]>(`${OPTCG_API}/allDecks/`),
    ]);
    const index = (rows: unknown[] | null, kind: OnePieceSetKind) =>
      (rows ?? [])
        .map((row) => mapOnePieceSet(row as Parameters<typeof mapOnePieceSet>[0]))
        .filter((set): set is CatalogSet => set != null)
        .map((set) => ({ set, kind }));
    return [...index(boosters, 'booster'), ...index(decks, 'deck')].sort((a, b) =>
      a.set.code.localeCompare(b.set.code),
    );
  });

  private readonly loadAllCards = cachedLoader(SETS_CACHE_MS, async () => {
    const [boosterCards, deckCards] = await Promise.all([
      this.get<unknown[]>(`${OPTCG_API}/allSetCards/`),
      this.get<unknown[]>(`${OPTCG_API}/allSTCards/`),
    ]);
    return dedupeCardsById(this.mapCards([...(boosterCards ?? []), ...(deckCards ?? [])]));
  });

  async listSets(query?: string): Promise<CatalogSet[]> {
    const sets = (await this.loadSets()).map((row) => row.set);
    return filterCatalogSets(sets, query ?? '');
  }

  async cardsInSet(setKey: string): Promise<{ set: CatalogSet; cards: CatalogCard[] }> {
    const indexed = await this.loadSets();
    const set = findCatalogSet(
      indexed.map((row) => row.set),
      setKey,
    );
    if (!set) {
      throw new NotFoundException(`Expansión One Piece no encontrada: ${setKey}`);
    }
    const kind = indexed.find((row) => row.set.code === set.code)?.kind ?? 'booster';
    const path = kind === 'deck' ? 'decks' : 'sets';
    const rows = await this.get<unknown[]>(
      `${OPTCG_API}/${path}/${encodeURIComponent(set.code)}/`,
      [404],
    );
    return { set, cards: dedupeCardsById(this.mapCards(rows ?? [])) };
  }

  async searchByName(query: string): Promise<CatalogCard[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    return rankCardsByName(await this.loadAllCards(), q).slice(0, CATALOG_SEARCH_LIMIT);
  }

  private mapCards(rows: unknown[]): CatalogCard[] {
    return rows
      .map((row) => mapOnePieceCard(row as Parameters<typeof mapOnePieceCard>[0]))
      .filter((card): card is CatalogCard => card != null);
  }

  private get<T>(url: string, emptyOnStatus?: number[]) {
    return fetchCatalogJson<T>(url, { label: LABEL, logger: this.logger, emptyOnStatus });
  }
}
