import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, extname, join, relative } from 'path';
import { isSyntheticQuantityCardId } from '../../constants/bulk-product';
import { isCardImagesMetaFile } from '../../utils/stock-card-images-sync';
import { sanitizeRelativeAssetPath } from '../../utils/store-image-localize';

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

export function inferSetIdFromCardId(cardId: string): string | undefined {
  const dash = cardId.lastIndexOf('-');
  if (dash <= 0) return undefined;
  const setId = cardId.slice(0, dash).trim();
  return setId || undefined;
}

export function resolveCardImagesRoot(): string {
  const fromEnv = process.env.TCGDEX_LOCAL_IMAGES_DIR?.trim();
  if (fromEnv) return fromEnv;
  return join(process.cwd(), 'data', 'card-images');
}

function uniqueLocales(locale: string): string[] {
  const preferred = locale.trim() || 'en';
  return preferred.toLowerCase() === 'en' ? [preferred] : [preferred, 'en'];
}

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
    return resolveCardImagesRoot();
  }

  legacyImagesRoots(): string[] {
    const candidates: string[] = [];
    if (process.platform === 'win32') {
      candidates.push('D:\\TcgDex images');
    }
    candidates.push(join(process.cwd(), 'data', 'tcgdex-images'));
    const primary = this.getImagesRoot();
    return candidates.filter((root) => root !== primary && existsSync(root));
  }

  ensureImagesRoot(): string {
    const root = this.getImagesRoot();
    mkdirSync(root, { recursive: true });
    return root;
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

  relativePathForCard(cardId: string, setId?: string): string {
    const id = cardId.trim();
    const set =
      (setId ?? inferSetIdFromCardId(id) ?? 'unknown').trim() || 'unknown';
    return `${set}/${id}.png`;
  }

  private candidateRelativePaths(
    cardId: string,
    locale: string,
    setId?: string,
    extraIndex?: CardIndex,
  ): string[] {
    const paths = new Set<string>();
    const merged: CardIndex = { ...extraIndex, ...this.index };

    for (const key of this.indexKeys(cardId, locale)) {
      const entry = merged[key];
      if (entry?.file) paths.add(entry.file.replace(/\\/g, '/'));
    }

    if (setId) {
      const suffix = this.folderSuffix(locale);
      paths.add(`${setId}/${cardId}.png`);
      if (suffix) paths.add(`${setId}-${suffix}/${cardId}.png`);
    }

    paths.add(this.relativePathForCard(cardId, setId));
    return [...paths];
  }

  private loadIndexFromPath(indexPath: string): CardIndex {
    if (!existsSync(indexPath)) return {};
    try {
      return JSON.parse(readFileSync(indexPath, 'utf8')) as CardIndex;
    } catch {
      return {};
    }
  }

  private localFileExists(
    relativePath: string,
    root = this.getImagesRoot(),
  ): boolean {
    const safe = sanitizeRelativeAssetPath(relativePath);
    if (!safe) return false;
    const fullPath = join(root, ...safe.split('/'));
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

  findRelativePath(
    cardId: string,
    locale = 'en',
    setId?: string,
  ): string | undefined {
    return this.findRelativePathInRoot(
      this.getImagesRoot(),
      cardId,
      locale,
      setId,
    );
  }

  private findRelativePathInRoot(
    root: string,
    cardId: string,
    locale = 'en',
    setId?: string,
  ): string | undefined {
    const id = cardId?.trim();
    if (!id) return undefined;

    const inferredSetId = setId ?? inferSetIdFromCardId(id);
    const extraIndex = this.loadIndexFromPath(join(root, 'card-index.json'));
    const locales = uniqueLocales(locale);
    for (const loc of locales) {
      for (const relativePath of this.candidateRelativePaths(
        id,
        loc,
        inferredSetId,
        extraIndex,
      )) {
        if (this.localFileExists(relativePath, root)) {
          return sanitizeRelativeAssetPath(relativePath);
        }
      }
    }
    return undefined;
  }

  resolve(input: ResolveLocalImageInput): ResolvedCardImages | undefined {
    const cardId = input.cardId?.trim();
    if (!cardId) return undefined;

    let relativePath = this.findRelativePath(cardId, input.locale, input.setId);
    if (!relativePath) {
      relativePath = this.copyFromLegacyIfPresent(
        cardId,
        input.locale,
        input.setId,
      );
    }
    if (relativePath) {
      const url = this.toPublicUrl(relativePath);
      return { image: url, small: url, large: url, source: 'local' };
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

  saveBuffer(relativePath: string, buffer: Buffer): string {
    const safe = sanitizeRelativeAssetPath(relativePath);
    if (!safe || !buffer?.length) return '';
    const root = this.ensureImagesRoot();
    const fullPath = join(root, ...safe.split('/'));
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, buffer);
    const cardId = basename(safe, extname(safe));
    if (cardId) {
      this.index[cardId] = {
        ...this.index[cardId],
        file: safe,
        setId: inferSetIdFromCardId(cardId),
      };
    }
    return safe;
  }

  copyFromLegacyIfPresent(
    cardId: string,
    locale = 'en',
    setId?: string,
  ): string | undefined {
    const id = cardId?.trim();
    if (!id) return undefined;
    const already = this.findRelativePath(id, locale, setId);
    if (already) return already;

    for (const root of this.legacyImagesRoots()) {
      const found = this.findRelativePathInRoot(root, id, locale, setId);
      if (!found) continue;
      const src = join(root, ...found.split('/'));
      try {
        const destRoot = this.ensureImagesRoot();
        const dest = join(destRoot, ...found.split('/'));
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(src, dest);
        this.index[id] = {
          ...this.index[id],
          file: found,
          setId: setId ?? inferSetIdFromCardId(id),
        };
        return found;
      } catch (err) {
        this.logger.warn(
          `No se pudo copiar imagen legacy ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return undefined;
  }

  listRelativeFiles(): string[] {
    const root = this.getImagesRoot();
    if (!existsSync(root)) return [];
    const out: string[] = [];
    const walk = (dir: string): void => {
      let entries: Array<{
        name: string;
        isDirectory(): boolean;
        isFile(): boolean;
      }>;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const rel = sanitizeRelativeAssetPath(
            relative(root, full).replace(/\\/g, '/'),
          );
          if (rel) out.push(rel);
        }
      }
    };
    walk(root);
    return out;
  }

  unlinkRelative(relativePath: string): boolean {
    const safe = sanitizeRelativeAssetPath(relativePath);
    if (!safe || isCardImagesMetaFile(safe)) return false;
    const fullPath = join(this.getImagesRoot(), ...safe.split('/'));
    if (!existsSync(fullPath)) return false;
    try {
      unlinkSync(fullPath);
      return true;
    } catch (err) {
      this.logger.warn(
        `No se pudo borrar ${safe}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  deleteFilesForCardId(cardId: string): number {
    const id = cardId?.trim();
    if (!id || isSyntheticQuantityCardId(id)) return 0;
    const root = this.getImagesRoot();
    if (!existsSync(root)) return 0;

    const toDelete = new Set<string>();
    const setId = inferSetIdFromCardId(id);

    for (const [key, entry] of Object.entries(this.index)) {
      if (key === id || key.endsWith(`:${id}`)) {
        if (entry?.file) toDelete.add(entry.file.replace(/\\/g, '/'));
      }
    }

    for (const loc of ['en', 'ja', 'zh-cn', 'zh-tw']) {
      for (const rel of this.candidateRelativePaths(id, loc, setId)) {
        toDelete.add(rel);
      }
    }

    for (const rel of this.listRelativeFiles()) {
      if (isCardImagesMetaFile(rel)) continue;
      const name = basename(rel, extname(rel));
      if (name === id) toDelete.add(rel);
    }

    let deleted = 0;
    for (const rel of toDelete) {
      if (this.unlinkRelative(rel)) deleted += 1;
    }

    for (const key of Object.keys(this.index)) {
      if (key === id || key.endsWith(`:${id}`)) {
        delete this.index[key];
      }
    }
    return deleted;
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
    this.flushTimer.unref?.();
  }

  flushPendingManifest(): void {
    if (this.pendingByKey.size === 0) return;

    const manifestPath = this.getPendingManifestPath();
    let existing: PendingManifest = { updatedAt: '', entries: [] };
    if (existsSync(manifestPath)) {
      try {
        existing = JSON.parse(
          readFileSync(manifestPath, 'utf8'),
        ) as PendingManifest;
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
      entries: [...merged.values()].sort(
        (a, b) =>
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
