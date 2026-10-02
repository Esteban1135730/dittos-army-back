import { Injectable, Optional } from '@nestjs/common';
import { CardTraderService } from './cardtrader.service';
import { mapWithConcurrency } from '../../utils/concurrency';
import { TtlCache } from '../../utils/ttl-cache';
import { TCGDexService } from '../../pokemon';
import {
  matchBlueprintsForQuoteLine,
  normalizeBlueprintsExport,
  type QuoteBlueprintCandidate,
} from './cardtrader-quote-blueprint-match';
import {
  listExpansionsForTcgdexSet,
  loadQuoteExpansionIndex,
  resolveExpansionByTcgdexSetId,
  resolveQuoteExpansion,
  tcgdexSetIdFromCardResume,
  type QuoteExpansionHit,
  type QuoteExpansionIndex,
} from './cardtrader-quote-homolog';
import {
  adjustSetIdForCatalog,
  normalizeMangledAsiaSetId,
} from '../../pokemon';
import {
  mapQuoteConditionLabel,
  mapQuoteLanguageLabel,
} from './cardtrader-quote-labels';

export type QuoteLineInput = {
  name?: string;
  expansion?: string;
  collector_number?: string;
  language_label?: string;
  condition_label?: string;
};

export type QuoteLineResolveResult = {
  index: number;
  status: 'matched' | 'ambiguous' | 'not_found';
  blueprint_id: number | null;
  expansion_id: number | null;
  expansion_name: string | null;
  name: string;
  collector_number: string;
  image_url: string | null;
  pokemon_language: string | null;
  condition: string | null;
  candidates: QuoteBlueprintCandidate[];
  error: 'expansion_not_mapped' | 'blueprint_not_found' | 'invalid_line' | null;
};

const BLUEPRINT_CACHE_TTL_MS = 45 * 60 * 1000;
const BLUEPRINT_CACHE_MAX = 100;
const RESOLVE_LINES_CONCURRENCY = 5;
const SEARCH_MAX_ITEMS = 40;

export function searchLocaleOrder(q: string): string[] {
  if (/[\u3040-\u30ff]/.test(q)) {
    return ['ja', 'en', 'zh-cn', 'zh-tw'];
  }
  if (/[\u4e00-\u9fff]/.test(q)) {
    return ['zh-tw', 'zh-cn', 'ja', 'en'];
  }
  return ['en', 'ja', 'zh-cn', 'zh-tw'];
}

@Injectable()
export class CardTraderQuoteResolveService {
  private index: QuoteExpansionIndex;
  private readonly blueprintCache = new TtlCache<unknown>({
    ttlMs: BLUEPRINT_CACHE_TTL_MS,
    maxEntries: BLUEPRINT_CACHE_MAX,
  });

  constructor(
    private readonly cardTrader: CardTraderService,
    @Optional() private readonly tcgDex?: TCGDexService,
  ) {
    this.index = loadQuoteExpansionIndex();
  }

  /** Solo tests: evita leer el JSON real de homologación. */
  replaceExpansionIndex(index: QuoteExpansionIndex): void {
    this.index = index;
  }

  async resolveLines(lines: QuoteLineInput[]): Promise<{
    results: QuoteLineResolveResult[];
  }> {
    const results = await mapWithConcurrency(
      lines,
      RESOLVE_LINES_CONCURRENCY,
      (line, i) => this.resolveLine(line, i),
    );
    return { results };
  }

  async resolveLine(
    line: QuoteLineInput,
    index: number,
  ): Promise<QuoteLineResolveResult> {
    const name = String(line?.name ?? '').trim();
    const expansion = String(line?.expansion ?? '').trim();
    const collector = String(line?.collector_number ?? '').trim();
    const pokemonLanguage = mapQuoteLanguageLabel(line?.language_label);
    const condition = mapQuoteConditionLabel(line?.condition_label);

    const base = {
      index,
      name,
      collector_number: collector,
      pokemon_language: pokemonLanguage,
      condition,
      image_url: null as string | null,
      candidates: [] as QuoteBlueprintCandidate[],
    };

    if (!name || !expansion || !collector) {
      return {
        ...base,
        status: 'not_found',
        blueprint_id: null,
        expansion_id: null,
        expansion_name: expansion || null,
        error: 'invalid_line',
      };
    }

    const expansionHit = resolveQuoteExpansion(this.index, expansion);
    if (expansionHit === 'ambiguous') {
      return {
        ...base,
        status: 'ambiguous',
        blueprint_id: null,
        expansion_id: null,
        expansion_name: expansion,
        error: null,
      };
    }
    if (!expansionHit) {
      return {
        ...base,
        status: 'not_found',
        blueprint_id: null,
        expansion_id: null,
        expansion_name: expansion,
        error: 'expansion_not_mapped',
      };
    }

    const raw = await this.getBlueprintsCached(expansionHit.expansionId);
    const matches = matchBlueprintsForQuoteLine({
      blueprints: normalizeBlueprintsExport(raw),
      expansionId: expansionHit.expansionId,
      expansionName: expansionHit.expansionName,
      collectorNumber: collector,
      cardName: name,
    });

    if (matches.length === 0) {
      return {
        ...base,
        status: 'not_found',
        blueprint_id: null,
        expansion_id: expansionHit.expansionId,
        expansion_name: expansionHit.expansionName,
        error: 'blueprint_not_found',
      };
    }

    if (matches.length > 1) {
      return {
        ...base,
        status: 'ambiguous',
        blueprint_id: null,
        expansion_id: expansionHit.expansionId,
        expansion_name: expansionHit.expansionName,
        candidates: matches,
        error: null,
      };
    }

    const hit = matches[0];
    return {
      ...base,
      status: 'matched',
      blueprint_id: hit.blueprint_id,
      expansion_id: hit.expansion_id,
      expansion_name: hit.expansion_name,
      name: hit.name || name,
      collector_number: hit.collector_number || collector,
      image_url: hit.image_url,
      error: null,
    };
  }

  async searchBlueprintsByName(q: string): Promise<{
    items: Array<QuoteBlueprintCandidate & { locale?: string }>;
  }> {
    const query = q.trim();
    if (!query || !this.tcgDex) return { items: [] };

    const locales = searchLocaleOrder(query);
    const batches = await Promise.all(
      locales.map(async (locale) => {
        const cards = (await this.tcgDex!.findCardByName(query, locale)) ?? [];
        return cards.map((card) => ({ card, locale }));
      }),
    );

    const items: Array<QuoteBlueprintCandidate & { locale?: string }> = [];
    const seen = new Set<number>();

    for (const batch of batches) {
      for (const { card, locale } of batch) {
        if (items.length >= SEARCH_MAX_ITEMS) break;
        const setId = tcgdexSetIdFromCardResume(card);
        const expansionHits = this.expansionHitsForSearch(setId, locale);
        for (const expansionHit of expansionHits) {
          if (items.length >= SEARCH_MAX_ITEMS) break;
          const raw = await this.getBlueprintsCached(expansionHit.expansionId);
          const matches = matchBlueprintsForQuoteLine({
            blueprints: normalizeBlueprintsExport(raw),
            expansionId: expansionHit.expansionId,
            expansionName: expansionHit.expansionName,
            collectorNumber: String(card.localId ?? ''),
            cardName: String(card.name ?? ''),
          });
          for (const hit of matches) {
            if (seen.has(hit.blueprint_id)) continue;
            seen.add(hit.blueprint_id);
            items.push({ ...hit, locale });
            if (items.length >= SEARCH_MAX_ITEMS) break;
          }
        }
      }
    }

    return { items };
  }

  private expansionHitsForSearch(
    setId: string,
    locale: string,
  ): QuoteExpansionHit[] {
    const variants = [
      setId,
      normalizeMangledAsiaSetId(setId),
      adjustSetIdForCatalog(setId, locale).tcgdex_set_id,
    ];
    const out: QuoteExpansionHit[] = [];
    const seen = new Set<number>();
    for (const id of variants) {
      const trimmed = String(id ?? '').trim();
      if (!trimmed) continue;
      for (const hit of listExpansionsForTcgdexSet(
        this.index,
        trimmed,
        locale,
      )) {
        if (seen.has(hit.expansionId)) continue;
        seen.add(hit.expansionId);
        out.push(hit);
      }
    }
    return out;
  }

  private async getBlueprintsCached(expansionId: number): Promise<unknown> {
    return this.blueprintCache.getOrLoad(String(expansionId), () =>
      this.cardTrader.getBlueprintsExport(expansionId),
    );
  }
}
