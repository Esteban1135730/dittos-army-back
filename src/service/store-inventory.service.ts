import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StockRepository } from '../repository/stock.repository';
import { PvpRepository } from '../repository/pvp.repository';
import { SaleRepository } from '../repository/sale.repository';
import { CardStockTagRepository } from '../repository/card-stock-tag.repository';
import { CardtraderTransitLotRepository } from '../repository/cardtrader-transit-lot.repository';
import { CardtraderTransitLineRepository } from '../repository/cardtrader-transit-line.repository';
import { isSyntheticQuantityCardId } from '../constants/bulk-product';
import { sanitizeCardImageUrl } from '../utils/card-image-url';
import { TCGDexService } from '../pokemon';
import { LocalCardImagesService } from '../pokemon';
import {
  OWNER_KEYS,
  OWNERS_CONFIG,
  ownersForTcg,
  type OwnerKey,
} from '../config/owners.config';
import { runWithOwnerAsync } from '../owner/owner-context';
import {
  effectiveOperationalRarezaFromStock,
  groupPvpsByCardId,
  resolvePvpForLine,
  type PvpLike,
} from '../utils/pvp-resolve';
import {
  mergePublicTagMaps,
  mergeSoldUnitCounts,
  pickStoreExportPvp,
} from '../utils/store-export-multi-owner';
import {
  pickStoreExportCardName,
  tcgdexMetaSpread,
  type StoreCardExportMeta,
} from '../utils/store-card-meta';
import {
  applySoldUnits90d,
  storeDemandWindowUtc,
  countSoldUnitsByCardId,
} from '../utils/store-demand-units';
import {
  isStoreAutoPublishEnabled,
  publishStoreCatalogToGit,
  resolveStorePublishBranch,
  resolveStoreRepoPath,
  type StoreGitPublishResult,
} from '../utils/store-git-publish';
import {
  localizeStoreItemImages,
  pruneUnusedStoreCardAssets,
  readCatalogImageUrls,
} from '../utils/store-image-localize';
import { assertFeatureAllowed } from '../owner/feature-acl.guard';
import {
  groupStockUnitsByLine,
  inventoryLineKey,
  normalizeExportLanguage,
} from '../utils/store-inventory-group';
import { toStorePublicTags } from '../utils/store-public-tags';

export type StoreExportResult = {
  success: boolean;
  path?: string;
  count?: number;
  error?: string;
};

export type PublishStoreCatalogResult = {
  success: boolean;
  inventory: StoreExportResult;
  upcoming: StoreExportResult;
  publish?: StoreGitPublishResult & { enabled: boolean };
  error?: string;
};

const EXCLUDED_STATES = new Set(['vendida', 'propiedad', 'reserva', 'perdida']);

type PvpByCard = Map<string, PvpLike[]>;
type PvpByOwner = Record<OwnerKey, PvpByCard>;

function emptyPvpByOwner(): PvpByOwner {
  return Object.fromEntries(
    OWNER_KEYS.map((owner) => [owner, new Map()]),
  ) as PvpByOwner;
}

function isStoreExportSellable(stock: {
  card_state?: string | null;
  card_id?: string | null;
}): boolean {
  if (isSyntheticQuantityCardId(stock.card_id)) return false;
  return (
    stock.card_state != null &&
    !EXCLUDED_STATES.has(String(stock.card_state).toLowerCase())
  );
}

function storeMetaCacheKey(cardId: string, lang: string): string {
  return `${cardId}::${lang}`;
}

/** One item in the store inventory JSON */
export type StoreInventoryItem = {
  lineId: string;
  card_id: string;
  name: string;
  language: string;
  pvp: number;
  quantity: number;
  image: string;
  status: 'available';
  rareza?: string | null;
  expansion?: string;
  card_number?: string;
  /** ISO de la recepción más reciente del grupo; `null` si no hay fecha */
  stocked_at?: string | null;
  /** Unidades vendidas del card_id en los últimos 90 días */
  sold_units_90d?: number;
  tcg_rarity?: string;
  category?: string;
  types?: string[];
  hp?: number;
  tags?: string[];
};

/** Cartas en camino al local (lotes abiertos) para la tienda pública */
export type StoreUpcomingItem = {
  id: string;
  card_id: string;
  name: string;
  language: string;
  quantity: number;
  image: string;
  rareza: string | null;
  expansion?: string;
  card_number?: string;
  /** Unidades vendidas del card_id en los últimos 90 días */
  sold_units_90d: number;
  tcg_rarity?: string;
  category?: string;
  types?: string[];
  hp?: number;
  pvp?: number;
  tags?: string[];
};

@Injectable()
export class StoreInventoryService {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly pvpRepository: PvpRepository,
    private readonly transitLotRepository: CardtraderTransitLotRepository,
    private readonly transitLineRepository: CardtraderTransitLineRepository,
    private readonly tcgDexService: TCGDexService,
    private readonly localCardImagesService: LocalCardImagesService,
    private readonly saleRepository: SaleRepository,
    private readonly cardStockTagRepository: CardStockTagRepository,
  ) {}

  private ownerKeys(): OwnerKey[] {
    // Tienda pública: solo stock Pokémon (Pablo / Esteban).
    return ownersForTcg('pokemon').map((o) => o.key);
  }

  private async loadDemandCounts(): Promise<Map<string, number> | null> {
    try {
      const { from, to } = storeDemandWindowUtc();
      const sales = await this.saleRepository.findVentasInPeriod(from, to);
      return countSoldUnitsByCardId(sales);
    } catch (e) {
      console.warn(
        'StoreInventory: error counting sold_units_90d; exporting zeros',
        e,
      );
      return null;
    }
  }

  private async loadDemandCountsAllOwners(): Promise<Map<string, number>> {
    let merged = new Map<string, number>();
    for (const owner of this.ownerKeys()) {
      try {
        const counts = await runWithOwnerAsync(owner, () =>
          this.loadDemandCounts(),
        );
        merged = mergeSoldUnitCounts(merged, counts);
      } catch (e) {
        console.warn(
          `StoreInventory: error counting sold_units_90d for ${owner}`,
          e,
        );
      }
    }
    return merged;
  }

  private async loadSellableStockFromAllOwners(): Promise<any[]> {
    const all: any[] = [];
    for (const owner of this.ownerKeys()) {
      try {
        const rows = await runWithOwnerAsync(owner, () =>
          this.stockRepository.findAll(),
        );
        all.push(...rows.filter(isStoreExportSellable));
      } catch (e) {
        if (owner === 'pablo') throw e;
        console.warn(
          `StoreInventory: error loading stock for ${owner}; skipping`,
          e,
        );
      }
    }
    return all;
  }

  private async loadPvpByOwner(cardIds: string[]): Promise<PvpByOwner> {
    const result = emptyPvpByOwner();
    if (cardIds.length === 0) return result;
    for (const owner of this.ownerKeys()) {
      try {
        result[owner] = await runWithOwnerAsync(owner, async () => {
          const pvps = await this.pvpRepository.findByCardIds(cardIds);
          return groupPvpsByCardId(pvps);
        });
      } catch (e) {
        console.warn(`StoreInventory: error loading PVP for ${owner}`, e);
      }
    }
    return result;
  }

  private async loadTagMapAllOwners(
    cardIds: string[],
  ): Promise<Map<string, string[]>> {
    let merged = new Map<string, string[]>();
    if (cardIds.length === 0) return merged;
    for (const owner of this.ownerKeys()) {
      try {
        const part = await runWithOwnerAsync(owner, () =>
          this.cardStockTagRepository.findMapByCardIds(cardIds),
        );
        merged = mergePublicTagMaps(merged, part);
      } catch (e) {
        console.warn(`StoreInventory: error loading tags for ${owner}`, e);
      }
    }
    return merged;
  }

  private resolveExportPvp(
    pvpByOwner: PvpByOwner,
    cardId: string,
    rareza: string | null,
  ): { pvp: number; pvp_currency: string } | undefined {
    const pablo = resolvePvpForLine(pvpByOwner.pablo.get(cardId) ?? [], rareza);
    const esteban = resolvePvpForLine(
      pvpByOwner.esteban.get(cardId) ?? [],
      rareza,
    );
    const picked = pickStoreExportPvp(
      pablo ? { pvp: pablo.pvp, currency: pablo.pvp_currency } : undefined,
      esteban
        ? { pvp: esteban.pvp, currency: esteban.pvp_currency }
        : undefined,
    );
    return picked
      ? { pvp: picked.pvp, pvp_currency: picked.currency }
      : undefined;
  }

  private async localizeImagesForStore<
    T extends { image: string; card_id: string; language?: string },
  >(items: T[]): Promise<T[]> {
    return localizeStoreItemImages(items, {
      storeRepoPath: resolveStoreRepoPath(),
      localImagesRoot: this.localCardImagesService.getImagesRoot(),
      resolveLocalRelativePath: (cardId, language) =>
        this.localCardImagesService.findRelativePath(cardId, language ?? 'en'),
      resolveRemoteImage: (cardId, language) =>
        this.tcgDexService.getRemoteStoreCardImageUrl(cardId, language),
    });
  }

  private async pruneUnusedStoreCardImages(): Promise<void> {
    const storeRepo = resolveStoreRepoPath();
    const inventoryPath =
      process.env.STORE_INVENTORY_PATH ||
      path.join(storeRepo, 'public', 'inventory.json');
    const upcomingPath =
      process.env.STORE_UPCOMING_PATH ||
      path.join(storeRepo, 'public', 'upcoming.json');
    try {
      const urls = [
        ...(await readCatalogImageUrls(inventoryPath)),
        ...(await readCatalogImageUrls(upcomingPath)),
      ];
      const result = await pruneUnusedStoreCardAssets(urls, {
        storeRepoPath: storeRepo,
      });
      if (result.removed > 0) {
        console.log(
          `[store-inventory] Imágenes no usadas eliminadas: ${result.removed}`,
        );
      }
    } catch (err) {
      console.warn(
        '[store-inventory] No se pudieron limpiar imágenes no usadas',
        err,
      );
    }
  }

  private pvpToCop(pvp: number, currency: string): number {
    if (currency === 'COP') return Math.round(pvp);
    if (currency === 'EUR') {
      const rate = Number(process.env.EXCHANGE_EUR_TO_COP) || 4500;
      return Math.round(pvp * rate);
    }
    if (currency === 'USD') {
      const rate = Number(process.env.EXCHANGE_USD_TO_COP) || 4000;
      return Math.round(pvp * rate);
    }
    return Math.round(pvp);
  }

  async exportStoreInventory(): Promise<StoreExportResult> {
    assertFeatureAllowed('export-tienda');
    const outputPath =
      process.env.STORE_INVENTORY_PATH ||
      path.join(
        process.cwd(),
        '..',
        'dittos-army-store',
        'public',
        'inventory.json',
      );

    try {
      const filtered = await this.loadSellableStockFromAllOwners();
      if (filtered.length === 0) {
        await this.writeInventory(outputPath, []);
        await this.pruneUnusedStoreCardImages();
        return { success: true, path: outputPath, count: 0 };
      }

      const cardIds = [...new Set(filtered.map((s) => s.card_id))];
      const pvpByOwner = await this.loadPvpByOwner(cardIds);
      const cardMap = new Map<string, StoreCardExportMeta>();

      const metaLoads = new Map<
        string,
        { cardId: string; lang: string; sourceName?: string | null }
      >();
      for (const stock of filtered) {
        const lang = normalizeExportLanguage(
          stock.language || stock.languaje || 'en',
        );
        const key = storeMetaCacheKey(stock.card_id, lang);
        if (!metaLoads.has(key)) {
          metaLoads.set(key, {
            cardId: stock.card_id,
            lang,
            sourceName: stock.card_name,
          });
        }
      }

      await Promise.all(
        [...metaLoads.entries()].map(async ([key, load]) => {
          try {
            const meta = await this.tcgDexService.resolveStoreExportMeta(
              load.cardId,
              load.lang,
              load.sourceName,
            );
            if (meta) cardMap.set(key, meta);
          } catch (e) {
            console.warn(
              `StoreInventory: error loading card ${load.cardId} (${load.lang})`,
              e,
            );
          }
        }),
      );

      const enriched = filtered.map((stock) => {
        const lang = normalizeExportLanguage(
          stock.language || stock.languaje || 'en',
        );
        const card = cardMap.get(storeMetaCacheKey(stock.card_id, lang));
        const rzLine = effectiveOperationalRarezaFromStock(stock);
        const pvpData = this.resolveExportPvp(
          pvpByOwner,
          stock.card_id,
          rzLine,
        );
        return {
          ...stock._doc,
          card_id: stock.card_id,
          _id: stock._id,
          stocked_at: stock.stocked_at ?? stock._doc?.stocked_at ?? null,
          rareza: stock.rareza ?? stock._doc?.rareza,
          league_card: stock.league_card ?? stock._doc?.league_card,
          holofoil: stock.holofoil ?? stock._doc?.holofoil,
          card_name: pickStoreExportCardName(
            stock.card_name,
            card?.name,
            stock.card_id,
          ),
          image_url: sanitizeCardImageUrl(stock.image_url) || card?.image || '',
          pvp: pvpData?.pvp,
          pvp_currency: pvpData?.pvp_currency,
          language: lang,
        };
      });

      const groups = groupStockUnitsByLine(enriched);
      const firstByLine = new Map<string, (typeof enriched)[number]>();
      for (const item of enriched) {
        const lang = normalizeExportLanguage(
          item.language || item.languaje || 'en',
        );
        const rzEff = effectiveOperationalRarezaFromStock(item);
        const key = inventoryLineKey(item.card_id, lang, rzEff);
        if (!firstByLine.has(key)) firstByLine.set(key, item);
      }

      const inventoryRaw: StoreInventoryItem[] = groups
        .map((g) => {
          const item = firstByLine.get(g.lineId);
          const pvpData = this.resolveExportPvp(
            pvpByOwner,
            g.card_id,
            g.rareza,
          );
          const pvpCop =
            pvpData != null
              ? this.pvpToCop(pvpData.pvp, pvpData.pvp_currency)
              : 0;
          const card = cardMap.get(storeMetaCacheKey(g.card_id, g.language));
          const name = pickStoreExportCardName(
            item?.card_name,
            card?.name,
            g.card_id,
          );
          const image =
            sanitizeCardImageUrl(item?.image_url) ||
            sanitizeCardImageUrl(card?.image) ||
            '';
          return {
            lineId: g.lineId,
            card_id: g.card_id,
            name,
            language: g.language,
            pvp: pvpCop,
            quantity: g.quantity,
            image,
            status: 'available' as const,
            stocked_at: g.stocked_at,
            ...(g.rareza != null ? { rareza: g.rareza } : {}),
            ...(card?.expansion ? { expansion: card.expansion } : {}),
            ...(card?.card_number ? { card_number: card.card_number } : {}),
            ...tcgdexMetaSpread(card),
          };
        })
        .filter((row) => row.pvp > 0);

      const demandCounts = await this.loadDemandCountsAllOwners();
      const tagMap = await this.loadTagMapAllOwners(cardIds);
      const inventoryWithDemand = applySoldUnits90d(
        inventoryRaw,
        demandCounts,
      ).map((row) => {
        const tags = toStorePublicTags(tagMap.get(row.card_id));
        return tags ? { ...row, tags } : row;
      });
      const inventory = await this.localizeImagesForStore(inventoryWithDemand);
      await this.writeInventory(outputPath, inventory);
      await this.pruneUnusedStoreCardImages();
      return { success: true, path: outputPath, count: inventory.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        'StoreInventoryService.exportStoreInventory error:',
        message,
      );
      return { success: false, error: message };
    }
  }

  private async writeInventory(
    filePath: string,
    data: StoreInventoryItem[],
  ): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async exportStoreUpcoming(): Promise<StoreExportResult> {
    assertFeatureAllowed('export-tienda');
    const outputPath =
      process.env.STORE_UPCOMING_PATH ||
      path.join(
        process.cwd(),
        '..',
        'dittos-army-store',
        'public',
        'upcoming.json',
      );

    try {
      const transitLines =
        await this.transitLineRepository.findByRemainingQuantityGreaterThanZero();
      const openLotIds = new Set(
        (await this.transitLotRepository.findOpenLots()).map((l) =>
          l._id.toString(),
        ),
      );
      const openTransitLines = transitLines
        .filter(
          (line) =>
            openLotIds.has(String(line.lot_id)) &&
            line.not_arrived_at == null &&
            !isSyntheticQuantityCardId(line.card_id),
        )
        .map((line) => ({
          card_id: line.card_id,
          card_name: line.card_name,
          image_url: line.image_url,
          language: line.language,
          rareza: line.rareza,
          remaining_quantity: line.remaining_quantity ?? 0,
        }));

      if (openTransitLines.length === 0) {
        await this.writeUpcomingJson(outputPath, []);
        await this.pruneUnusedStoreCardImages();
        return { success: true, path: outputPath, count: 0 };
      }

      const cardMap = new Map<string, StoreCardExportMeta>();

      const metaLoads = new Map<
        string,
        { cardId: string; lang: string; sourceName?: string | null }
      >();
      for (const line of openTransitLines) {
        const lang = normalizeExportLanguage(line.language);
        const key = storeMetaCacheKey(line.card_id, lang);
        if (!metaLoads.has(key)) {
          metaLoads.set(key, {
            cardId: line.card_id,
            lang,
            sourceName: line.card_name,
          });
        }
      }

      await Promise.all(
        [...metaLoads.entries()].map(async ([key, load]) => {
          try {
            const meta = await this.tcgDexService.resolveStoreExportMeta(
              load.cardId,
              load.lang,
              load.sourceName,
            );
            if (meta) cardMap.set(key, meta);
          } catch {
            // ignorar
          }
        }),
      );

      type Agg = {
        id: string;
        card_id: string;
        name: string;
        language: string;
        quantity: number;
        image: string;
        rareza: string | null;
        expansion?: string;
        card_number?: string;
      };
      const byKey = new Map<string, Agg>();

      for (const it of openTransitLines) {
        const lang = normalizeExportLanguage(it.language);
        const meta = cardMap.get(storeMetaCacheKey(it.card_id, lang));
        const name = pickStoreExportCardName(
          it.card_name,
          meta?.name,
          it.card_id,
        );
        const image =
          sanitizeCardImageUrl(it.image_url) ||
          sanitizeCardImageUrl(meta?.image) ||
          '';
        const rz =
          it.rareza == null || String(it.rareza).trim() === ''
            ? null
            : String(it.rareza).trim();
        const key = inventoryLineKey(it.card_id, lang, rz);
        const qty = Math.max(0, Math.floor(Number(it.remaining_quantity) || 0));
        if (qty <= 0) continue;

        const existing = byKey.get(key);
        if (existing) {
          existing.quantity += qty;
          if (
            (!existing.name || existing.name === existing.card_id) &&
            name &&
            name !== it.card_id
          ) {
            existing.name = name;
          }
          if (!existing.image && image) existing.image = image;
        } else {
          byKey.set(key, {
            id: key,
            card_id: it.card_id,
            name,
            language: lang,
            quantity: qty,
            image,
            rareza: rz,
            ...(meta?.expansion ? { expansion: meta.expansion } : {}),
            ...(meta?.card_number ? { card_number: meta.card_number } : {}),
            ...tcgdexMetaSpread(meta),
          });
        }
      }

      const upcomingCardIds = [
        ...new Set(Array.from(byKey.values()).map((r) => r.card_id)),
      ];
      const pvpByOwner = await this.loadPvpByOwner(upcomingCardIds);
      const tagMap = await this.loadTagMapAllOwners(upcomingCardIds);
      const demandCounts = await this.loadDemandCountsAllOwners();

      const withMeta = Array.from(byKey.values())
        .map((row) => {
          const pvpData = this.resolveExportPvp(
            pvpByOwner,
            row.card_id,
            row.rareza,
          );
          const pvpCop =
            pvpData != null
              ? this.pvpToCop(pvpData.pvp, pvpData.pvp_currency)
              : 0;
          const tags = toStorePublicTags(tagMap.get(row.card_id));
          return {
            ...row,
            ...(pvpCop > 0 ? { pvp: pvpCop } : {}),
            ...(tags ? { tags } : {}),
          };
        })
        .filter((row) => (row.pvp ?? 0) > 0);

      const rowsRaw: StoreUpcomingItem[] = applySoldUnits90d(
        withMeta,
        demandCounts,
      );
      rowsRaw.sort((a, b) => {
        const sold = (b.sold_units_90d ?? 0) - (a.sold_units_90d ?? 0);
        if (sold !== 0) return sold;
        return (b.pvp ?? 0) - (a.pvp ?? 0);
      });

      const rows = await this.localizeImagesForStore(rowsRaw);
      await this.writeUpcomingJson(outputPath, rows);
      await this.pruneUnusedStoreCardImages();
      return { success: true, path: outputPath, count: rows.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        'StoreInventoryService.exportStoreUpcoming error:',
        message,
      );
      return { success: false, error: message };
    }
  }

  private async writeUpcomingJson(
    filePath: string,
    data: StoreUpcomingItem[],
  ): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async publishStoreCatalog(): Promise<PublishStoreCatalogResult> {
    assertFeatureAllowed('export-tienda');
    const inventory = await this.exportStoreInventory();
    const upcoming = await this.exportStoreUpcoming();

    if (!inventory.success || !upcoming.success) {
      return {
        success: false,
        inventory,
        upcoming,
        error: 'No se pudo generar el catálogo de la tienda',
      };
    }

    const publishEnabled = isStoreAutoPublishEnabled();
    if (!publishEnabled) {
      return {
        success: true,
        inventory,
        upcoming,
        publish: {
          enabled: false,
          published: false,
          pushed: false,
          branch: resolveStorePublishBranch(),
          repoPath: resolveStoreRepoPath(),
          skippedReason:
            'Publicación git desactivada (STORE_AUTO_PUBLISH=false)',
        },
      };
    }

    try {
      const publish = await publishStoreCatalogToGit({
        repoPath: resolveStoreRepoPath(),
        branch: resolveStorePublishBranch(),
      });

      const publishFailed = Boolean(publish.error);
      return {
        success: !publishFailed,
        inventory,
        upcoming,
        publish: { enabled: true, ...publish },
        ...(publishFailed
          ? { error: publish.error || 'Error al publicar en git' }
          : {}),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        'StoreInventoryService.publishStoreCatalog git error:',
        message,
      );
      return {
        success: false,
        inventory,
        upcoming,
        publish: {
          enabled: true,
          published: false,
          pushed: false,
          branch: resolveStorePublishBranch(),
          repoPath: resolveStoreRepoPath(),
          error: message,
        },
        error: message,
      };
    }
  }
}
