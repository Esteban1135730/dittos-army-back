import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, extname, join, relative } from 'path';
import { isSyntheticQuantityCardId } from '../../constants/bulk-product';
import { isCardImagesMetaFile } from '../../utils/stock-card-images-sync';
import { sanitizeRelativeAssetPath } from '../../utils/store-image-localize';
import { TtlCache } from '../../utils/ttl-cache';

/** Cada cuánto se re-verifica (stat) el `card-index.json` de una raíz en disco. */
const ROOT_INDEX_RECHECK_MS = 5_000;
/**
 * TTL de la caché de existencia de archivos (positiva y negativa). Las escrituras
 * de este servicio la invalidan al momento; el TTL cubre altas/bajas externas.
 */
const FILE_EXISTS_TTL_MS = 30_000;
const FILE_EXISTS_MAX_ENTRIES = 50_000;

type RootIndexCacheEntry = {
  index: CardIndex;
  mtimeMs: number;
  size: number;
  checkedAt: number;
};

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
  private readonly rootIndexCache = new Map<string, RootIndexCacheEntry>();
  private readonly fileExistsCache = new TtlCache<boolean>({
    ttlMs: FILE_EXISTS_TTL_MS,
    maxEntries: FILE_EXISTS_MAX_ENTRIES,
  });

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

    for (const key of this.indexKeys(cardId, locale)) {
      // Mismo resultado que `{ ...extraIndex, ...this.index }[key]` sin copiar índices.
      const entry = Object.prototype.hasOwnProperty.call(this.index, key)
        ? this.index[key]
        : extraIndex?.[key];
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

  /**
   * `card-index.json` de una raíz, cacheado en memoria. Se relee solo si cambió
   * su mtime/tamaño (comprobado como mucho cada `ROOT_INDEX_RECHECK_MS`).
   */
  private rootIndex(root: string): CardIndex {
    const indexPath = join(root, 'card-index.json');
    const now = Date.now();
    const cached = this.rootIndexCache.get(indexPath);
    if (cached && now - cached.checkedAt < ROOT_INDEX_RECHECK_MS) {
      return cached.index;
    }
    let mtimeMs = -1;
    let size = -1;
    try {
      const st = statSync(indexPath);
      mtimeMs = st.mtimeMs;
      size = st.size;
    } catch {
      /* sin índice en esta raíz */
    }
    if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
      cached.checkedAt = now;
      return cached.index;
    }
    const index = mtimeMs < 0 ? {} : this.loadIndexFromPath(indexPath);
    this.rootIndexCache.set(indexPath, {
      index,
      mtimeMs,
      size,
      checkedAt: now,
    });
    return index;
  }

  private fullPathFor(relativePath: string, root: string): string | undefined {
    const safe = sanitizeRelativeAssetPath(relativePath);
    if (!safe) return undefined;
    return join(root, ...safe.split('/'));
  }

  private localFileExists(
    relativePath: string,
    root = this.getImagesRoot(),
  ): boolean {
    const fullPath = this.fullPathFor(relativePath, root);
    if (!fullPath) return false;
    const cached = this.fileExistsCache.get(fullPath);
    if (cached !== undefined) return cached;
    let exists = false;
    try {
      const st = statSync(fullPath);
      exists = st.isFile() && st.size > 0;
    } catch {
      exists = false;
    }
    this.fileExistsCache.set(fullPath, exists);
    return exists;
  }

  private markFile(fullPath: string, exists: boolean): void {
    this.fileExistsCache.set(fullPath, exists);
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
    const extraIndex = this.rootIndex(root);
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
    this.markFile(fullPath, true);
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
        this.fileExistsCache.delete(dest);
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
    if (!existsSync(fullPath)) {
      this.markFile(fullPath, false);
      return false;
    }
    try {
      unlinkSync(fullPath);
      this.markFile(fullPath, false);
      return true;
    } catch (err) {
      this.fileExistsCache.delete(fullPath);
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
