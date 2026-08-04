import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StockRepository } from '../repository/stock.repository';
import { PvpRepository } from '../repository/pvp.repository';
import { CardtraderTransitLotRepository } from '../repository/cardtrader-transit-lot.repository';
import { CardtraderTransitLineRepository } from '../repository/cardtrader-transit-line.repository';
import { TCGDexService } from './tcgdex/tcgdex.service';
import { LocalCardImagesService } from './tcgdex/local-card-images.service';
import {
  effectiveOperationalRarezaFromStock,
  groupPvpsByCardId,
  resolvePvpForLine,
} from '../utils/pvp-resolve';
import {
  type StoreCardExportMeta,
} from '../utils/store-card-meta';
import {
  isStoreAutoPublishEnabled,
  publishStoreCatalogToGit,
  resolveStorePublishBranch,
  resolveStoreRepoPath,
  type StoreGitPublishResult,
} from '../utils/store-git-publish';
import { localizeStoreItemImages } from '../utils/store-image-localize';
import { assertFeatureAllowed } from '../owner/feature-acl.guard';

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

function storeMetaCacheKey(cardId: string, lang: string): string {
  return `${cardId}::${lang}`;
}

function normalizeExportLanguage(raw: unknown): string {
  return (raw || 'en').toString().trim().toLowerCase() || 'en';
}

function inventoryLineKey(
  cardId: string,
  lang: string,
  rareza: string | undefined | null,
): string {
  const v =
    rareza == null || String(rareza).trim() === ''
      ? ''
      : String(rareza).trim().toLowerCase();
  return `${cardId}::${lang}::${v}`;
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
};

/** Cartas en tránsito CardTrader (lotes abiertos) para la tienda pública */
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
  ) {}

  private async localizeImagesForStore<
    T extends { image: string; card_id: string; language?: string },
  >(items: T[]): Promise<T[]> {
    return localizeStoreItemImages(items, {
      storeRepoPath: resolveStoreRepoPath(),
      localImagesRoot: this.localCardImagesService.getImagesRoot(),
      resolveRemoteImage: (cardId, language) =>
        this.tcgDexService.getRemoteStoreCardImageUrl(cardId, language),
    });
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
      const stockItems: any[] = await this.stockRepository.findAll();
      const filtered = stockItems.filter(
        (s) =>
          s.card_state != null &&
          !EXCLUDED_STATES.has(String(s.card_state).toLowerCase()),
      );
      if (filtered.length === 0) {
        await this.writeInventory(outputPath, []);
        return { success: true, path: outputPath, count: 0 };
      }

      const cardIds = [...new Set(filtered.map((s) => s.card_id))];
      const pvpByCard = new Map<
        string,
        {
          card_id: string;
          rareza?: string | null;
          pvp: number;
          currency: string;
        }[]
      >();
      const cardMap = new Map<string, StoreCardExportMeta>();

      try {
        const pvps = await this.pvpRepository.findByCardIds(cardIds);
        for (const [cid, list] of groupPvpsByCardId(pvps)) {
          pvpByCard.set(cid, list);
        }
      } catch (e) {
        console.warn('StoreInventory: error loading PVP', e);
      }

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
        const list = pvpByCard.get(stock.card_id) ?? [];
        const rzLine = effectiveOperationalRarezaFromStock(stock);
        const pvpData = resolvePvpForLine(list, rzLine);
        return {
          ...stock._doc,
          card_name: card?.name ?? stock.card_name ?? '',
          image_url: stock.image_url || card?.image || '',
          pvp: pvpData?.pvp,
          pvp_currency: pvpData?.pvp_currency,
          language: lang,
        };
      });

      const byLine = new Map<
        string,
        {
          card_id: string;
          name: string;
          language: string;
          pvp: number;
          image: string;
          quantity: number;
          rareza: string | null;
          expansion?: string;
          card_number?: string;
        }
      >();

      for (const item of enriched) {
        const cardId = item.card_id;
        const lang =
          (item.language || 'en').toString().trim().toLowerCase() || 'en';
        const rzEff = effectiveOperationalRarezaFromStock(item);
        const key = inventoryLineKey(cardId, lang, rzEff);
        const list = pvpByCard.get(cardId) ?? [];
        const pvpData = resolvePvpForLine(list, rzEff);
        const pvpCop =
          pvpData != null
            ? this.pvpToCop(pvpData.pvp, pvpData.pvp_currency)
            : 0;
        const card = cardMap.get(storeMetaCacheKey(cardId, lang));
        const name = card?.name || item.card_name || cardId;
        const image = item.image_url || card?.image || '';

        if (byLine.has(key)) {
          const existing = byLine.get(key)!;
          existing.quantity += 1;
        } else {
          byLine.set(key, {
            card_id: cardId,
            name,
            language: lang,
            pvp: pvpCop,
            image,
            quantity: 1,
            rareza: rzEff,
            ...(card?.expansion ? { expansion: card.expansion } : {}),
            ...(card?.card_number ? { card_number: card.card_number } : {}),
          });
        }
      }

      const inventoryRaw: StoreInventoryItem[] = Array.from(
        byLine.entries(),
      ).map(([lineId, data]) => ({
        lineId,
        card_id: data.card_id,
        name: data.name,
        language: data.language,
        pvp: data.pvp,
        quantity: data.quantity,
        image: data.image,
        status: 'available' as const,
        ...(data.rareza != null ? { rareza: data.rareza } : {}),
        ...(data.expansion ? { expansion: data.expansion } : {}),
        ...(data.card_number ? { card_number: data.card_number } : {}),
      }));

      const inventory = await this.localizeImagesForStore(inventoryRaw);
      await this.writeInventory(outputPath, inventory);
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
            openLotIds.has(String(line.lot_id)) && line.not_arrived_at == null,
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
        const name = meta?.name || it.card_id;
        const image = (it.image_url && String(it.image_url).trim()) || meta?.image || '';
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
          });
        }
      }

      const rowsRaw: StoreUpcomingItem[] = Array.from(byKey.values());
      rowsRaw.sort((a, b) => a.name.localeCompare(b.name, 'es'));

      const rows = await this.localizeImagesForStore(rowsRaw);
      await this.writeUpcomingJson(outputPath, rows);
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
      console.error('StoreInventoryService.publishStoreCatalog git error:', message);
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
