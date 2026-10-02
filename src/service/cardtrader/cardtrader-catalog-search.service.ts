import { Injectable, Logger } from '@nestjs/common';
import { cardTraderGameIdForTcg } from 'src/constants/cardtrader-games';
import { TcgCatalogRegistry } from 'src/tcg-catalog/tcg-catalog.registry';
import type { CatalogTcg } from 'src/tcg-catalog/tcg-catalog.types';
import { CardTraderService } from './cardtrader.service';
import {
  CATALOG_CT_NAME_LOOKUP_LIMIT,
  CATALOG_CT_SEARCH_RESULT_LIMIT,
  rankCatalogNamesForCardTraderSearch,
  stripCatalogVariantSuffix,
} from './cardtrader-catalog-search.util';

export type CatalogBlueprintSearchItem = {
  blueprint_id: number;
  expansion_id: number;
  expansion_name?: string;
  name?: string;
  collector_number?: string;
  image_url?: string | null;
};

/**
 * CardTrader solo filtra blueprints por nombre exacto. Para TCG no Pokémon
 * resolvemos parciales con el catálogo externo del TCG y luego consultamos CT.
 */
@Injectable()
export class CardTraderCatalogSearchService {
  private readonly logger = new Logger(CardTraderCatalogSearchService.name);

  constructor(
    private readonly cardTrader: CardTraderService,
    private readonly catalogs: TcgCatalogRegistry,
  ) {}

  async searchBlueprintsByName(
    q: string,
    tcg: CatalogTcg,
  ): Promise<{ items: CatalogBlueprintSearchItem[] }> {
    const query = q.trim();
    if (!query) return { items: [] };

    let catalogNames: string[] = [];
    try {
      const cards = await this.catalogs.forTcg(tcg).searchByName(query);
      catalogNames = cards.map((c) => stripCatalogVariantSuffix(c.name));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error';
      this.logger.warn(
        `Catálogo ${tcg} no disponible para búsqueda CT; solo nombre exacto: ${message}`,
      );
    }

    const names = rankCatalogNamesForCardTraderSearch(
      query,
      catalogNames,
      CATALOG_CT_NAME_LOOKUP_LIMIT,
    );

    const gameId = cardTraderGameIdForTcg(tcg);
    const byId = new Map<number, CatalogBlueprintSearchItem>();
    for (const name of names) {
      if (byId.size >= CATALOG_CT_SEARCH_RESULT_LIMIT) break;
      const { items } = await this.cardTrader.searchBlueprintsByName(name, gameId);
      for (const item of items) {
        if (byId.has(item.blueprint_id)) continue;
        byId.set(item.blueprint_id, item);
        if (byId.size >= CATALOG_CT_SEARCH_RESULT_LIMIT) break;
      }
    }

    return { items: [...byId.values()] };
  }
}
