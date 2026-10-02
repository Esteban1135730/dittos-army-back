import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { cachedLoader, fetchCatalogJson } from '../catalog-http';
import {
  CATALOG_SEARCH_LIMIT,
  filterCatalogSets,
  findCatalogSet,
  type CatalogCard,
  type CatalogSet,
  type TcgCatalogProvider,
} from '../tcg-catalog.types';
import { mapYugiohCard, mapYugiohSet, YGOPRODECK_API } from './yugioh-catalog.map';

const CACHE_MS = 60 * 60 * 1000;
const LABEL = 'Yu-Gi-Oh';

/** Catálogo Yu-Gi-Oh vía YGOPRODeck. */
@Injectable()
export class YugiohCatalogService implements TcgCatalogProvider {
  readonly tcg = 'yugioh' as const;
  private readonly logger = new Logger(YugiohCatalogService.name);

  private readonly loadSets = cachedLoader(CACHE_MS, async () => {
    const payload = await this.get<unknown[]>(`${YGOPRODECK_API}/cardsets.php`);
    return (Array.isArray(payload) ? payload : [])
      .map((row) => mapYugiohSet(row as Parameters<typeof mapYugiohSet>[0]))
      .filter((set): set is CatalogSet => set != null)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  async listSets(query?: string): Promise<CatalogSet[]> {
    return filterCatalogSets(await this.loadSets(), query ?? '');
  }

  async cardsInSet(setKey: string): Promise<{ set: CatalogSet; cards: CatalogCard[] }> {
    const set = findCatalogSet(await this.loadSets(), setKey);
    if (!set) {
      throw new NotFoundException(`Expansión Yu-Gi-Oh no encontrada: ${setKey}`);
    }
    const url = `${YGOPRODECK_API}/cardinfo.php?cardset=${encodeURIComponent(set.name)}`;
    const payload = await this.get<{ data?: unknown[] }>(url);
    if (!payload) {
      throw new BadGatewayException('El catálogo de Yu-Gi-Oh respondió con error');
    }
    const cards = (payload.data ?? [])
      .map((row) => mapYugiohCard(row as Parameters<typeof mapYugiohCard>[0], set.name))
      .filter((card): card is CatalogCard => card != null);
    return { set, cards };
  }

  async searchByName(query: string): Promise<CatalogCard[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const url = `${YGOPRODECK_API}/cardinfo.php?fname=${encodeURIComponent(q)}`;
    const payload = await this.get<{ data?: unknown[] }>(url, [400]);
    if (!payload) return [];
    return (payload.data ?? [])
      .map((row) => mapYugiohCard(row as Parameters<typeof mapYugiohCard>[0], ''))
      .filter((card): card is CatalogCard => card != null)
      .slice(0, CATALOG_SEARCH_LIMIT);
  }

  private get<T>(url: string, emptyOnStatus?: number[]) {
    return fetchCatalogJson<T>(url, { label: LABEL, logger: this.logger, emptyOnStatus });
  }
}
