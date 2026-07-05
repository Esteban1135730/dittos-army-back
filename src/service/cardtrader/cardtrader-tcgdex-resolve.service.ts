import { Injectable } from '@nestjs/common';
import {
  expansionLabel,
  formatLocalIdForLocale,
  normExpansionKey,
  catalogLocaleForLanguage,
  adjustSetIdForCatalog,
  resolveSetFromLocaleAliases,
  resolveSetFromLocaleMap,
} from '../../utils/tcgdex-set-resolve';
import {
  loadTcgdexSetResolveIndex,
  type SetResolveMeta,
  type TcgdexSetResolveIndex,
} from '../../utils/tcgdex-homolog-loader';

export type TcgdexResolveResult = {
  tcgdex_card_id: string | null;
  tcgdex_set_id: string | null;
  locale: string | null;
  error: string | null;
};

@Injectable()
export class CardTraderTcgdexResolveService {
  private readonly index: TcgdexSetResolveIndex;

  constructor() {
    this.index = loadTcgdexSetResolveIndex();
  }

  /** Expuesto para tests/diagnóstico de cobertura de homologación. */
  getIndexStats(): {
    expansionNames: number;
    expansionIds: number;
    localeAliases: number;
    knownSetIds: number;
  } {
    return {
      expansionNames: this.index.byCtExpansionName.size,
      expansionIds: this.index.byCtExpansionId.size,
      localeAliases: Object.keys(this.index.localeAliases).length,
      knownSetIds: this.index.setLocaleById.size,
    };
  }

  private finalizeSetMeta(
    hit: SetResolveMeta | null,
    language?: string,
  ): SetResolveMeta | null {
    if (!hit) return null;
    const catalog = catalogLocaleForLanguage(language) ?? 'en';
    const adjusted = adjustSetIdForCatalog(hit.tcgdex_set_id, catalog);
    return {
      tcgdex_set_id: adjusted.tcgdex_set_id,
      locale: adjusted.locale,
    };
  }

  private preferLocaleAwareMatch(
    hit: SetResolveMeta | null,
    args: { expansionName?: string; language?: string },
  ): SetResolveMeta | null {
    if (!hit) return null;
    const catalog = catalogLocaleForLanguage(args.language);
    if (
      catalog &&
      catalog !== 'en' &&
      hit.locale === 'en' &&
      this.index.localeMap
    ) {
      const fromMap = resolveSetFromLocaleMap({
        expansionName: args.expansionName,
        language: args.language,
        localeMap: this.index.localeMap,
      });
      if (fromMap) return this.finalizeSetMeta(fromMap, args.language);
    }
    return this.finalizeSetMeta(hit, args.language);
  }

  private findSet(args: {
    expansionName?: string;
    expansionId?: number;
    language?: string;
  }): SetResolveMeta | null {
    if (typeof args.expansionId === 'number' && args.expansionId > 0) {
      const byId = this.index.byCtExpansionId.get(args.expansionId);
      if (byId) {
        return this.preferLocaleAwareMatch(byId, args);
      }
    }

    const label = expansionLabel(args.expansionName);
    for (const candidate of [label, args.expansionName ?? '']) {
      const nameKey = normExpansionKey(candidate);
      if (!nameKey) continue;
      const byName = this.index.byCtExpansionName.get(nameKey);
      if (byName) {
        return this.preferLocaleAwareMatch(byName, args);
      }
    }

    const fromAliases = resolveSetFromLocaleAliases({
      expansionName: args.expansionName,
      language: args.language,
      aliases: this.index.localeAliases,
    });

    const catalog = catalogLocaleForLanguage(args.language);
    const fromLocaleMap = this.index.localeMap
      ? resolveSetFromLocaleMap({
          expansionName: args.expansionName,
          language: args.language,
          localeMap: this.index.localeMap,
        })
      : null;

    if (
      fromLocaleMap &&
      catalog &&
      catalog !== 'en' &&
      (!fromAliases || fromAliases.locale === 'en')
    ) {
      return this.finalizeSetMeta(fromLocaleMap, args.language);
    }

    if (fromAliases) {
      return this.finalizeSetMeta(fromAliases, args.language);
    }
    return fromLocaleMap
      ? this.finalizeSetMeta(fromLocaleMap, args.language)
      : null;
  }

  resolveTcgdexCardId(args: {
    expansionName?: string;
    expansionId?: number;
    collectorNumber?: string;
    language?: string;
  }): TcgdexResolveResult {
    const set = this.findSet(args);
    if (!set) {
      return {
        tcgdex_card_id: null,
        tcgdex_set_id: null,
        locale: null,
        error: 'expansion sin homologación TCGdex',
      };
    }

    const locale =
      this.index.setLocaleById.get(set.tcgdex_set_id) ?? set.locale;
    const localId = formatLocalIdForLocale(
      args.collectorNumber?.trim() || undefined,
      locale,
      set.tcgdex_set_id,
    );
    if (!localId) {
      return {
        tcgdex_card_id: null,
        tcgdex_set_id: set.tcgdex_set_id,
        locale,
        error: 'sin collector_number en el ítem',
      };
    }

    return {
      tcgdex_card_id: `${set.tcgdex_set_id}-${localId}`,
      tcgdex_set_id: set.tcgdex_set_id,
      locale,
      error: null,
    };
  }

  resolveTcgdexCardIdBatch(
    lines: Array<{
      expansionName?: string;
      expansionId?: number;
      collectorNumber?: string;
      language?: string;
    }>,
  ): TcgdexResolveResult[] {
    return lines.map((line) => this.resolveTcgdexCardId(line));
  }
}
