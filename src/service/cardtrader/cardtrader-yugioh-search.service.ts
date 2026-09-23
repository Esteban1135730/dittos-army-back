import { Injectable, Logger } from '@nestjs/common';
import { CARDTRADER_YUGIOH_GAME_ID } from 'src/constants/cardtrader-games';
import { YugiohCatalogService } from 'src/yugioh/yugioh-catalog.service';
import { CardTraderService } from './cardtrader.service';
import {
  YUGIOH_CT_NAME_LOOKUP_LIMIT,
  YUGIOH_CT_SEARCH_RESULT_LIMIT,
  rankYugiohNamesForCardTraderSearch,
} from './cardtrader-yugioh-search.util';

export type YugiohBlueprintSearchItem = {
  blueprint_id: number;
  expansion_id: number;
  expansion_name?: string;
  name?: string;
  collector_number?: string;
  image_url?: string | null;
};

/**
 * CardTrader solo filtra blueprints por nombre exacto.
 * Resolvemos parciales con YGOPRODeck (`fname`) y luego consultamos CT.
 */
@Injectable()
export class CardTraderYugiohSearchService {
  private readonly logger = new Logger(CardTraderYugiohSearchService.name);

  constructor(
    private readonly cardTrader: CardTraderService,
    private readonly yugiohCatalog: YugiohCatalogService,
  ) {}

  async searchBlueprintsByName(q: string): Promise<{
    items: YugiohBlueprintSearchItem[];
  }> {
    const query = q.trim();
    if (!query) return { items: [] };

    let catalogNames: string[] = [];
    try {
      const cards = await this.yugiohCatalog.searchByName(query);
      catalogNames = cards.map((c) => c.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error';
      this.logger.warn(
        `YGOPRODeck no disponible para búsqueda CT; solo nombre exacto: ${message}`,
      );
    }

    const names = rankYugiohNamesForCardTraderSearch(
      query,
      catalogNames,
      YUGIOH_CT_NAME_LOOKUP_LIMIT,
    );

    const byId = new Map<number, YugiohBlueprintSearchItem>();
    for (const name of names) {
      if (byId.size >= YUGIOH_CT_SEARCH_RESULT_LIMIT) break;
      const { items } = await this.cardTrader.searchBlueprintsByName(
        name,
        CARDTRADER_YUGIOH_GAME_ID,
      );
      for (const item of items) {
        if (byId.has(item.blueprint_id)) continue;
        byId.set(item.blueprint_id, item);
        if (byId.size >= YUGIOH_CT_SEARCH_RESULT_LIMIT) break;
      }
    }

    return { items: [...byId.values()] };
  }
}
