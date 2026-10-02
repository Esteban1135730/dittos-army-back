import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { cachedLoader, fetchCatalogJson } from '../catalog-http';
import {
  CATALOG_SEARCH_LIMIT,
  filterCatalogSets,
  findCatalogSet,
  type CatalogCard,
  type CatalogSet,
  type TcgCatalogProvider,
} from '../tcg-catalog.types';
import { mapMagicCard, mapMagicSet, SCRYFALL_API } from './magic-catalog.map';

const CACHE_MS = 6 * 60 * 60 * 1000;
const LABEL = 'Magic';
/** Scryfall pagina de a 175; 8 páginas cubren cualquier set principal. */
const MAX_SET_PAGES = 8;
/** Scryfall pide ~100 ms entre requests. */
const PAGE_DELAY_MS = 100;

type ScryfallList = { data?: unknown[]; has_more?: boolean; next_page?: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Catálogo Magic: The Gathering vía Scryfall. */
@Injectable()
export class MagicCatalogService implements TcgCatalogProvider {
  readonly tcg = 'magic' as const;
  private readonly logger = new Logger(MagicCatalogService.name);

  private readonly loadSets = cachedLoader(CACHE_MS, async () => {
    const payload = await this.get<ScryfallList>(`${SCRYFALL_API}/sets`);
    return (payload?.data ?? [])
      .map((row) => mapMagicSet(row as Parameters<typeof mapMagicSet>[0]))
      .filter((set): set is CatalogSet => set != null)
      .sort((a, b) => (b.releasedAt ?? '').localeCompare(a.releasedAt ?? ''));
  });

  async listSets(query?: string): Promise<CatalogSet[]> {
    return filterCatalogSets(await this.loadSets(), query ?? '');
  }

  async cardsInSet(setKey: string): Promise<{ set: CatalogSet; cards: CatalogCard[] }> {
    const set = findCatalogSet(await this.loadSets(), setKey);
    if (!set) {
      throw new NotFoundException(`Expansión Magic no encontrada: ${setKey}`);
    }
    const q = encodeURIComponent(`e:${set.code.toLowerCase()}`);
    let url: string | undefined =
      `${SCRYFALL_API}/cards/search?q=${q}&unique=prints&order=set&include_extras=true`;
    const cards: CatalogCard[] = [];
    for (let page = 0; url && page < MAX_SET_PAGES; page++) {
      if (page > 0) await sleep(PAGE_DELAY_MS);
      const payload: ScryfallList | null = await this.get<ScryfallList>(url, [404]);
      cards.push(...this.mapCards(payload?.data));
      url = payload?.has_more ? payload.next_page : undefined;
    }
    return { set, cards };
  }

  async searchByName(query: string): Promise<CatalogCard[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const url = `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=released`;
    const payload = await this.get<ScryfallList>(url, [404]);
    return this.mapCards(payload?.data).slice(0, CATALOG_SEARCH_LIMIT);
  }

  private mapCards(rows: unknown[] | undefined): CatalogCard[] {
    return (rows ?? [])
      .map((row) => mapMagicCard(row as Parameters<typeof mapMagicCard>[0]))
      .filter((card): card is CatalogCard => card != null);
  }

  private get<T>(url: string, emptyOnStatus?: number[]) {
    return fetchCatalogJson<T>(url, { label: LABEL, logger: this.logger, emptyOnStatus });
  }
}
