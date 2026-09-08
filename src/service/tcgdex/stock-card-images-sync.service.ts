import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { isBulkCardId } from '../../constants/bulk-product';
import { OWNERS_CONFIG, type OwnerKey } from '../../config/owners.config';
import { runWithOwnerAsync } from '../../owner/owner-context';
import { StockRepository } from '../../repository/stock.repository';
import type { Stock } from '../../schema/stock.schema';
import {
  CARD_IMAGE_DOWNLOAD_CONCURRENCY,
  CARD_IMAGE_FETCH_TIMEOUT_MS,
  CARD_IMAGE_MAX_BYTES,
  cardIdsFromRelativePath,
  extensionFromImageSource,
  isAcceptableCardImageBody,
  isActiveStockForImageCache,
  isCardImagesMetaFile,
  mapWithConcurrency,
  pickDownloadUrl,
  rewriteImageUrlIfLocalhostOrEmpty,
} from '../../utils/stock-card-images-sync';
import {
  inferSetIdFromCardId,
  LocalCardImagesService,
} from './local-card-images.service';
import { TCGDexService } from './tcgdex.service';

type StockImageRef = {
  owner: OwnerKey;
  id: string;
  card_id: string;
  image_url: string;
  language?: string;
};

type EnsureLocalResult = {
  relative?: string;
  copied: boolean;
  downloaded: boolean;
  failed: boolean;
};

@Injectable()
export class StockCardImagesSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StockCardImagesSyncService.name);

  constructor(
    private readonly stockRepository: StockRepository,
    private readonly localCardImages: LocalCardImagesService,
    private readonly tcgDexService: TCGDexService,
  ) {}

  onApplicationBootstrap(): void {
    setImmediate(() => {
      void this.syncInBackground();
    });
  }

  async syncInBackground(): Promise<void> {
    try {
      this.localCardImages.ensureImagesRoot();
      const byCard = await this.collectActiveByCardId();
      const activeIds = new Set(byCard.keys());
      const pruned = this.pruneOrphanFiles(activeIds);

      const cardIds = [...activeIds];
      let downloaded = 0;
      let copied = 0;
      let failed = 0;

      await mapWithConcurrency(
        cardIds,
        CARD_IMAGE_DOWNLOAD_CONCURRENCY,
        async (cardId) => {
          const refs = byCard.get(cardId) ?? [];
          const result = await this.ensureLocalFile(cardId, refs);
          if (result.copied) copied += 1;
          if (result.downloaded) downloaded += 1;
          if (result.failed) failed += 1;
          if (result.relative) {
            await this.rewriteLocalhostImageUrls(refs, result.relative);
          }
        },
      );

      this.logger.log(
        `Caché imágenes stock: scanned=${cardIds.length} downloaded=${downloaded} copied=${copied} pruned=${pruned} failed=${failed}`,
      );
    } catch (err) {
      this.logger.error(
        `Sync de imágenes de stock falló: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async pruneIfCardUnused(cardId: string): Promise<void> {
    try {
      const id = cardId?.trim();
      if (!id || isBulkCardId(id)) return;
      if (await this.cardIdIsActiveAnywhere(id)) return;
      this.localCardImages.deleteFilesForCardId(id);
    } catch (err) {
      this.logger.warn(
        `No se pudo podar imagen de ${cardId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private ownerKeys(): OwnerKey[] {
    return Object.keys(OWNERS_CONFIG.owners) as OwnerKey[];
  }

  private stockDocId(stock: Stock & { _id?: unknown }): string {
    return String(stock._id ?? '').trim();
  }

  private async collectActiveByCardId(): Promise<Map<string, StockImageRef[]>> {
    const map = new Map<string, StockImageRef[]>();
    for (const owner of this.ownerKeys()) {
      await runWithOwnerAsync(owner, async () => {
        const rows = await this.stockRepository.findAll();
        for (const row of rows) {
          if (!isActiveStockForImageCache(row)) continue;
          const cardId = String(row.card_id ?? '').trim();
          const id = this.stockDocId(row);
          if (!cardId || !id) continue;
          const list = map.get(cardId) ?? [];
          list.push({
            owner,
            id,
            card_id: cardId,
            image_url: String(row.image_url ?? ''),
            language:
              String(row.language ?? row.languaje ?? '').trim() || undefined,
          });
          map.set(cardId, list);
        }
      });
    }
    return map;
  }

  private async cardIdIsActiveAnywhere(cardId: string): Promise<boolean> {
    for (const owner of this.ownerKeys()) {
      const found = await runWithOwnerAsync(owner, async () => {
        const rows = await this.stockRepository.findByCardId(cardId);
        return (rows ?? []).some((row) => isActiveStockForImageCache(row));
      });
      if (found) return true;
    }
    return false;
  }

  private pruneOrphanFiles(activeCardIds: Set<string>): number {
    let pruned = 0;
    for (const rel of this.localCardImages.listRelativeFiles()) {
      if (isCardImagesMetaFile(rel)) continue;
      const ids = cardIdsFromRelativePath(rel);
      if (ids.length === 0) continue;
      if (ids.some((id) => activeCardIds.has(id))) continue;
      if (this.localCardImages.unlinkRelative(rel)) pruned += 1;
    }
    return pruned;
  }

  private async ensureLocalFile(
    cardId: string,
    refs: StockImageRef[],
  ): Promise<EnsureLocalResult> {
    const language = refs.find((r) => r.language)?.language ?? 'en';
    const setId = inferSetIdFromCardId(cardId);

    const existing = this.localCardImages.findRelativePath(
      cardId,
      language,
      setId,
    );
    if (existing) {
      return { relative: existing, copied: false, downloaded: false, failed: false };
    }

    const copied = this.localCardImages.copyFromLegacyIfPresent(
      cardId,
      language,
      setId,
    );
    if (copied) {
      return { relative: copied, copied: true, downloaded: false, failed: false };
    }

    const stockUrl = refs.map((r) => pickDownloadUrl(r.image_url)).find(Boolean);
    if (stockUrl) {
      const saved = await this.downloadToCache(cardId, setId, stockUrl);
      if (saved) {
        return { relative: saved, copied: false, downloaded: true, failed: false };
      }
    }

    try {
      const remote = await this.tcgDexService.getRemoteStoreCardImageUrl(
        cardId,
        language,
      );
      const remoteUrl = pickDownloadUrl(remote);
      if (remoteUrl) {
        const saved = await this.downloadToCache(cardId, setId, remoteUrl);
        if (saved) {
          return {
            relative: saved,
            copied: false,
            downloaded: true,
            failed: false,
          };
        }
      }
    } catch (err) {
      this.logger.warn(
        `TCGdex no devolvió imagen para ${cardId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.logger.warn(`Sin imagen local para card_id=${cardId}`);
    return { copied: false, downloaded: false, failed: true };
  }

  private async downloadToCache(
    cardId: string,
    setId: string | undefined,
    url: string,
  ): Promise<string | undefined> {
    const fetched = await this.fetchImageBuffer(url);
    if (!fetched) return undefined;
    const ext = extensionFromImageSource(url, fetched.contentType);
    const relative = this.localCardImages
      .relativePathForCard(cardId, setId)
      .replace(/\.png$/i, ext);
    const saved = this.localCardImages.saveBuffer(relative, fetched.buffer);
    return saved || undefined;
  }

  private async rewriteLocalhostImageUrls(
    refs: StockImageRef[],
    relative: string,
  ): Promise<void> {
    for (const ref of refs) {
      const next = rewriteImageUrlIfLocalhostOrEmpty(ref.image_url, relative);
      if (!next || next === ref.image_url.trim()) continue;
      try {
        await runWithOwnerAsync(ref.owner, () =>
          this.stockRepository.updateById(ref.id, { image_url: next }),
        );
      } catch (err) {
        this.logger.warn(
          `No se pudo actualizar image_url de ${ref.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async fetchImageBuffer(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string } | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      CARD_IMAGE_FETCH_TIMEOUT_MS,
    );
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return undefined;
      const contentType = res.headers.get('content-type') ?? '';
      const raw = await res.arrayBuffer();
      if (raw.byteLength > CARD_IMAGE_MAX_BYTES) return undefined;
      const buffer = Buffer.from(raw);
      if (!isAcceptableCardImageBody(buffer, contentType)) return undefined;
      return { buffer, contentType };
    } catch (err) {
      this.logger.warn(
        `Descarga de imagen falló (${url}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}
