import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export type ResolvedCardImages = {
  image: string;
  small: string;
  large: string;
  source: 'local';
};

type CardIndexEntry = {
  lang?: string;
  setId?: string;
  folder?: string;
  name?: string;
  file: string;
};

type CardIndex = Record<string, CardIndexEntry>;

type PendingManifestEntry = {
  cardId: string;
  lang: string;
  setId?: string;
  url: string;
  remoteImageBase?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  hitCount: number;
};

type PendingManifest = {
  updatedAt: string;
  entries: PendingManifestEntry[];
};

export type ResolveLocalImageInput = {
  cardId: string;
  locale: string;
  setId?: string;
  remoteImageBase?: string;
};

@Injectable()
export class LocalCardImagesService implements OnModuleInit {
  private readonly logger = new Logger(LocalCardImagesService.name);
  private index: CardIndex = {};
  private indexLoaded = false;
  private pendingByKey = new Map<string, PendingManifestEntry>();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  onModuleInit(): void {
    this.loadIndex();
  }

  getImagesRoot(): string {
    const fromEnv = process.env.TCGDEX_LOCAL_IMAGES_DIR?.trim();
    if (fromEnv) return fromEnv;
    return process.platform === 'win32'
      ? 'D:\\TcgDex images'
      : join(process.cwd(), 'data', 'tcgdex-images');
  }

  getPublicBaseUrl(): string {
    const fromEnv = process.env.CARD_IMAGES_PUBLIC_BASE?.trim();
    if (fromEnv) return fromEnv.replace(/\/+$/, '');
    const port = process.env.PORT ?? '3000';
    return `http://localhost:${port}/card-images`;
  }

  private getIndexPath(): string {
    const fromEnv = process.env.TCGDEX_LOCAL_IMAGES_INDEX?.trim();
    if (fromEnv) return fromEnv;
    return join(this.getImagesRoot(), 'card-index.json');
  }

  private getPendingManifestPath(): string {
    const fromEnv = process.env.TCGDEX_PENDING_DOWNLOAD_MANIFEST?.trim();
    if (fromEnv) return fromEnv;
    return join(this.getImagesRoot(), 'pending-download-manifest.json');
  }

  loadIndex(): void {
    const indexPath = this.getIndexPath();
    if (!existsSync(indexPath)) {
      this.logger.warn(`Índice local de imágenes no encontrado: ${indexPath}`);
      this.index = {};
      this.indexLoaded = false;
      return;
    }
    try {
      this.index = JSON.parse(readFileSync(indexPath, 'utf8')) as CardIndex;
      this.indexLoaded = true;
      this.logger.log(
        `Índice local cargado (${Object.keys(this.index).length} entradas) desde ${indexPath}`,
      );
    } catch (err) {
      this.logger.error(
        `No se pudo leer el índice local: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.index = {};
      this.indexLoaded = false;
    }
  }

  /** Expuesto para tests */
  indexKeys(cardId: string, locale: string): string[] {
    const normalized = locale.trim().toLowerCase();
    if (normalized === 'en') return [cardId];
    if (normalized === 'ja') return [`ja:${cardId}`, cardId];
    if (normalized === 'zh-cn' || normalized === 'zh-tw') {
      return [`zh:${cardId}`, cardId];
    }
    return [cardId];
  }

  private folderSuffix(locale: string): string | undefined {
    const normalized = locale.trim().toLowerCase();
    if (normalized === 'ja') return 'ja';
    if (normalized === 'zh-cn' || normalized === 'zh-tw') return 'zh';
    return undefined;
  }

  private candidateRelativePaths(
    cardId: string,
    locale: string,
    setId?: string,
  ): string[] {
    const paths = new Set<string>();

    for (const key of this.indexKeys(cardId, locale)) {
      const entry = this.index[key];
      if (entry?.file) paths.add(entry.file.replace(/\\/g, '/'));
    }

    if (setId) {
      const suffix = this.folderSuffix(locale);
      paths.add(`${setId}/${cardId}.png`);
      if (suffix) paths.add(`${setId}-${suffix}/${cardId}.png`);
    }

    return [...paths];
  }

  private localFileExists(relativePath: string): boolean {
    const fullPath = join(this.getImagesRoot(), relativePath);
    if (!existsSync(fullPath)) return false;
    try {
      return readFileSync(fullPath).length > 0;
    } catch {
      return false;
    }
  }

  private toPublicUrl(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/');
    return `${this.getPublicBaseUrl()}/${normalized.split('/').map(encodeURIComponent).join('/')}`;
  }

  private buildRemoteDownloadUrl(remoteImageBase?: string): string | undefined {
    if (!remoteImageBase?.trim()) return undefined;
    const base = remoteImageBase.trim().replace(/\/+$/, '');
    if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(base)) return base;
    return `${base}/high.png`;
  }

  resolve(input: ResolveLocalImageInput): ResolvedCardImages | undefined {
    const cardId = input.cardId?.trim();
    if (!cardId) return undefined;

    for (const relativePath of this.candidateRelativePaths(
      cardId,
      input.locale,
      input.setId,
    )) {
      if (this.localFileExists(relativePath)) {
        const url = this.toPublicUrl(relativePath);
        return { image: url, small: url, large: url, source: 'local' };
      }
    }

    this.recordPendingDownload(input);
    return undefined;
  }

  applyRemoteFallback(
    input: ResolveLocalImageInput,
    remote: { image: string; small: string; large: string },
  ): { image: string; small: string; large: string } {
    const local = this.resolve(input);
    if (local) {
      return { image: local.image, small: local.small, large: local.large };
    }
    return remote;
  }

  private pendingKey(cardId: string, locale: string): string {
    return `${locale.trim().toLowerCase()}:${cardId}`;
  }

  private recordPendingDownload(input: ResolveLocalImageInput): void {
    const cardId = input.cardId.trim();
    const lang = input.locale.trim().toLowerCase();
    const url =
      this.buildRemoteDownloadUrl(input.remoteImageBase) ??
      input.remoteImageBase ??
      '';
    if (!url) return;

    const key = this.pendingKey(cardId, lang);
    const now = new Date().toISOString();
    const existing = this.pendingByKey.get(key);
    if (existing) {
      existing.lastSeenAt = now;
      existing.hitCount += 1;
      if (input.setId) existing.setId = input.setId;
      if (input.remoteImageBase) {
        existing.remoteImageBase = input.remoteImageBase;
      }
      existing.url = url;
    } else {
      this.pendingByKey.set(key, {
        cardId,
        lang,
        setId: input.setId,
        url,
        remoteImageBase: input.remoteImageBase,
        firstSeenAt: now,
        lastSeenAt: now,
        hitCount: 1,
      });
    }

    this.schedulePendingFlush();
  }

  private schedulePendingFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flushPendingManifest();
    }, 5_000);
  }

  flushPendingManifest(): void {
    if (this.pendingByKey.size === 0) return;

    const manifestPath = this.getPendingManifestPath();
    let existing: PendingManifest = { updatedAt: '', entries: [] };
    if (existsSync(manifestPath)) {
      try {
        existing = JSON.parse(readFileSync(manifestPath, 'utf8')) as PendingManifest;
      } catch {
        existing = { updatedAt: '', entries: [] };
      }
    }

    const merged = new Map<string, PendingManifestEntry>();
    for (const entry of existing.entries ?? []) {
      merged.set(this.pendingKey(entry.cardId, entry.lang), entry);
    }
    for (const [key, entry] of this.pendingByKey.entries()) {
      merged.set(key, entry);
    }

    const payload: PendingManifest = {
      updatedAt: new Date().toISOString(),
      entries: [...merged.values()].sort((a, b) =>
        a.lang.localeCompare(b.lang) || a.cardId.localeCompare(b.cardId),
      ),
    };

    try {
      mkdirSync(join(manifestPath, '..'), { recursive: true });
      writeFileSync(manifestPath, JSON.stringify(payload, null, 2), 'utf8');
      this.pendingByKey.clear();
      this.logger.debug(
        `Manifest pendiente actualizado (${payload.entries.length} entradas): ${manifestPath}`,
      );
    } catch (err) {
      this.logger.warn(
        `No se pudo escribir manifest pendiente: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
