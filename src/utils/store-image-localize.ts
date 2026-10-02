import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rmdir,
  unlink,
  writeFile,
} from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

const LOCALHOST_IMAGE_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i;

export type LocalizeStoreImagesOptions = {
  storeRepoPath: string;
  localImagesRoot: string;
  assetsSubdir?: string;
  resolveLocalRelativePath?: (
    cardId: string,
    language?: string,
  ) => string | undefined;
  resolveRemoteImage?: (
    cardId: string,
    language?: string,
  ) => Promise<string | undefined>;
  fetchLocalhost?: (url: string) => Promise<Buffer | undefined>;
  copyFileFn?: typeof copyFile;
  existsFn?: (p: string) => boolean;
};

export type PruneStoreAssetsOptions = {
  storeRepoPath: string;
  assetsSubdir?: string;
  existsFn?: (p: string) => boolean;
  listFilesFn?: (root: string) => Promise<string[]>;
  unlinkFn?: (p: string) => Promise<void>;
  rmdirFn?: (p: string) => Promise<void>;
};

export function isLocalhostImageUrl(url: string): boolean {
  return LOCALHOST_IMAGE_RE.test(url.trim());
}

/** CDN TCGdex a veces viene como base sin archivo (`.../neo2/53` → `.../53/low.png`). */
export function normalizeTcgdexCdnImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (!/assets\.tcgdex\.net/i.test(trimmed)) return trimmed;
  if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(trimmed)) return trimmed;
  return `${trimmed.replace(/\/+$/, '')}/low.png`;
}

/** Imagen usable en stock del panel: http(s) público, no localhost. CardTrader sí vale como fallback. */
export function isUsableStockImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || isLocalhostImageUrl(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isPublicRemoteImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || isLocalhostImageUrl(trimmed)) return false;
  if (isBlockedVendorImageUrl(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const BLOCKED_IMAGE_HOST_RE = /(^|\.)cardtrader\.com$/i;

export function isBlockedVendorImageUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return BLOCKED_IMAGE_HOST_RE.test(host);
  } catch {
    return false;
  }
}

export function parseCardImagesRelativePath(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  let pathname = '';
  try {
    pathname = new URL(trimmed).pathname;
  } catch {
    pathname = trimmed.split('?')[0] ?? '';
  }
  const match = pathname.match(/^\/card-images\/(.+)$/i);
  if (!match?.[1]) return undefined;
  try {
    return sanitizeRelativeAssetPath(decodeURIComponent(match[1]));
  } catch {
    return sanitizeRelativeAssetPath(match[1]);
  }
}

function storePublicUrlExists(
  publicUrl: string,
  storeRepoPath: string,
  existsFn: (p: string) => boolean,
): boolean {
  if (!publicUrl.startsWith('/')) return false;
  const rel = sanitizeRelativeAssetPath(publicUrl.replace(/^\//, ''));
  if (!rel) return false;
  return existsFn(path.join(storeRepoPath, 'public', ...rel.split('/')));
}

/**
 * Imagen que la tienda puede dejar tal cual: CDN público, o archivo ya en
 * `public/` del store. `/card-images/` y CardTrader no cuentan (404 / bloqueo).
 */
export function isCatalogImageReadyForExport(
  url: string,
  options: { storeRepoPath: string; existsFn?: (p: string) => boolean },
): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (isLocalhostImageUrl(trimmed)) return false;
  if (isBlockedVendorImageUrl(trimmed)) return false;
  if (parseCardImagesRelativePath(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return isPublicRemoteImageUrl(trimmed);
  if (trimmed.startsWith('/')) {
    const exists = options.existsFn ?? existsSync;
    return storePublicUrlExists(trimmed, options.storeRepoPath, exists);
  }
  return false;
}

export function sanitizeRelativeAssetPath(relative: string): string {
  const normalized = relative.replace(/\\/g, '/');
  return normalized
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

export function storeAssetPublicUrl(
  relativePath: string,
  assetsSubdir = 'assets/cards',
): string {
  const safe = sanitizeRelativeAssetPath(relativePath);
  return `/${assetsSubdir}/${safe}`.replace(/\/+/g, '/');
}

function extensionFromUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const base = path.posix.basename(parsed.pathname);
    const ext = path.posix.extname(base);
    if (ext && ext.length <= 6) return ext.toLowerCase();
  } catch {
    // ignore
  }
  return '.png';
}

function fallbackAssetName(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const base = path.posix.basename(parsed.pathname);
    const safe = sanitizeRelativeAssetPath(base);
    if (safe) return safe;
  } catch {
    // ignore
  }
  const slug = Buffer.from(url.trim()).toString('base64url').slice(0, 24);
  return `fetched-${slug}${extensionFromUrl(url)}`;
}

const LOCALHOST_FETCH_TIMEOUT_MS = 15000;

async function defaultFetchLocalhost(url: string): Promise<Buffer | undefined> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(LOCALHOST_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return undefined;
  }
}

export async function copyLocalImageToStore(
  relativePath: string,
  options: LocalizeStoreImagesOptions,
): Promise<string> {
  const safe = sanitizeRelativeAssetPath(relativePath);
  if (!safe) return '';

  const copy = options.copyFileFn ?? copyFile;
  const exists = options.existsFn ?? existsSync;
  const assetsSubdir = options.assetsSubdir ?? 'assets/cards';
  const sourcePath = path.join(options.localImagesRoot, ...safe.split('/'));
  if (!exists(sourcePath)) return '';

  const destPath = path.join(
    options.storeRepoPath,
    'public',
    ...assetsSubdir.split('/'),
    ...safe.split('/'),
  );
  await mkdir(path.dirname(destPath), { recursive: true });
  await copy(sourcePath, destPath);
  return storeAssetPublicUrl(safe, assetsSubdir);
}

export async function localizeStoreImageUrl(
  imageUrl: string,
  options: LocalizeStoreImagesOptions,
): Promise<string> {
  const trimmed = imageUrl.trim();
  if (!trimmed || !isLocalhostImageUrl(trimmed)) return trimmed;

  const relativeFromCardImages = parseCardImagesRelativePath(trimmed);
  if (relativeFromCardImages) {
    const copied = await copyLocalImageToStore(relativeFromCardImages, options);
    if (copied) return copied;
  }

  const assetsSubdir = options.assetsSubdir ?? 'assets/cards';
  const fetchFn = options.fetchLocalhost ?? defaultFetchLocalhost;
  const fetched = await fetchFn(trimmed);
  if (fetched?.length) {
    const fileName = fallbackAssetName(trimmed);
    const destPath = path.join(
      options.storeRepoPath,
      'public',
      ...assetsSubdir.split('/'),
      'imported',
      fileName,
    );
    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, fetched);
    return storeAssetPublicUrl(`imported/${fileName}`, assetsSubdir);
  }

  console.warn(
    `[store-image-localize] No se pudo localizar imagen localhost: ${trimmed}`,
  );
  return '';
}

export async function localizeStoreItemImages<
  T extends { image: string; card_id: string; language?: string },
>(items: T[], options: LocalizeStoreImagesOptions): Promise<T[]> {
  const localCache = new Map<string, string>();
  const localInFlight = new Map<string, Promise<string>>();
  const relativeCache = new Map<string, string>();
  const relativeInFlight = new Map<string, Promise<string>>();
  const remoteCache = new Map<string, string>();
  const remoteInFlight = new Map<string, Promise<string | undefined>>();

  const resolveLocalAsset = async (original: string): Promise<string> => {
    const cached = localCache.get(original);
    if (cached !== undefined) return cached;

    let pending = localInFlight.get(original);
    if (!pending) {
      pending = localizeStoreImageUrl(original, options).then((localized) => {
        localCache.set(original, localized);
        localInFlight.delete(original);
        return localized;
      });
      localInFlight.set(original, pending);
    }
    return pending;
  };

  const resolveByRelativePath = async (relative: string): Promise<string> => {
    const safe = sanitizeRelativeAssetPath(relative);
    if (!safe) return '';
    const cached = relativeCache.get(safe);
    if (cached !== undefined) return cached;

    let pending = relativeInFlight.get(safe);
    if (!pending) {
      pending = copyLocalImageToStore(safe, options).then((copied) => {
        relativeCache.set(safe, copied);
        relativeInFlight.delete(safe);
        return copied;
      });
      relativeInFlight.set(safe, pending);
    }
    return pending;
  };

  const resolveRemote = async (
    cardId: string,
    language?: string,
  ): Promise<string | undefined> => {
    if (!options.resolveRemoteImage) return undefined;

    const cacheKey = `${language ?? ''}::${cardId}`;
    const cached = remoteCache.get(cacheKey);
    if (cached !== undefined) return cached || undefined;

    let pending = remoteInFlight.get(cacheKey);
    if (!pending) {
      pending = options
        .resolveRemoteImage(cardId, language)
        .then((remote) => {
          if (remote && isPublicRemoteImageUrl(remote)) {
            remoteCache.set(cacheKey, remote);
            return remote;
          }
          remoteCache.set(cacheKey, '');
          return undefined;
        })
        .finally(() => {
          remoteInFlight.delete(cacheKey);
        });
      remoteInFlight.set(cacheKey, pending);
    }
    return pending;
  };

  return Promise.all(
    items.map(async (item) => {
      const original = item.image?.trim() ?? '';
      if (
        isCatalogImageReadyForExport(original, {
          storeRepoPath: options.storeRepoPath,
          existsFn: options.existsFn,
        })
      ) {
        return item;
      }

      const cardImagesRel = parseCardImagesRelativePath(original);
      if (cardImagesRel) {
        const copied = await resolveByRelativePath(cardImagesRel);
        if (copied) return { ...item, image: copied };
      } else if (isLocalhostImageUrl(original)) {
        const localized = await resolveLocalAsset(original);
        if (localized) return { ...item, image: localized };
      }

      if (options.resolveLocalRelativePath) {
        const relative = options.resolveLocalRelativePath(
          item.card_id,
          item.language,
        );
        if (relative) {
          const copied = await resolveByRelativePath(relative);
          if (copied) return { ...item, image: copied };
        }
      }

      const remote = await resolveRemote(item.card_id, item.language);
      if (remote) return { ...item, image: remote };

      return { ...item, image: '' };
    }),
  );
}

export function imageUrlsFromCatalogItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const urls: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const image = (item as { image?: unknown }).image;
    if (typeof image === 'string' && image.trim()) urls.push(image.trim());
  }
  return urls;
}

export async function readCatalogImageUrls(
  filePath: string,
): Promise<string[]> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return imageUrlsFromCatalogItems(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function usedStoreAssetRelativePaths(
  imageUrls: Iterable<string>,
  assetsSubdir = 'assets/cards',
): Set<string> {
  const prefix = `/${assetsSubdir}/`.replace(/\/+/g, '/');
  const used = new Set<string>();
  for (const raw of imageUrls) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) continue;
    let pathname = trimmed;
    try {
      pathname = new URL(trimmed).pathname;
    } catch {
      // ruta relativa de la tienda
    }
    const normalized = pathname.replace(/\\/g, '/');
    if (!normalized.startsWith(prefix)) continue;
    const relative = sanitizeRelativeAssetPath(normalized.slice(prefix.length));
    if (relative) used.add(relative);
  }
  return used;
}

async function listFilesRecursive(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  await walk(root);
  return out;
}

export async function pruneUnusedStoreCardAssets(
  imageUrls: Iterable<string>,
  options: PruneStoreAssetsOptions,
): Promise<{ removed: number; kept: number }> {
  const assetsSubdir = options.assetsSubdir ?? 'assets/cards';
  const assetsRoot = path.join(
    options.storeRepoPath,
    'public',
    ...assetsSubdir.split('/'),
  );
  const exists = options.existsFn ?? existsSync;
  if (!exists(assetsRoot)) return { removed: 0, kept: 0 };

  const used = usedStoreAssetRelativePaths(imageUrls, assetsSubdir);
  const listFiles = options.listFilesFn ?? listFilesRecursive;
  const unlinkFn = options.unlinkFn ?? unlink;
  const rmdirFn = options.rmdirFn ?? rmdir;
  const files = await listFiles(assetsRoot);

  let removed = 0;
  let kept = 0;
  const dirsToCheck = new Set<string>();

  for (const filePath of files) {
    const relative = sanitizeRelativeAssetPath(
      path.relative(assetsRoot, filePath).replace(/\\/g, '/'),
    );
    if (!relative) continue;
    if (used.has(relative)) {
      kept += 1;
      continue;
    }
    await unlinkFn(filePath);
    removed += 1;
    dirsToCheck.add(path.dirname(filePath));
  }

  const dirs = [...dirsToCheck].sort(
    (a, b) => b.split(path.sep).length - a.split(path.sep).length,
  );
  for (const dir of dirs) {
    let current = dir;
    while (
      current.startsWith(assetsRoot) &&
      path.resolve(current) !== path.resolve(assetsRoot)
    ) {
      try {
        const entries = await readdir(current);
        if (entries.length > 0) break;
        await rmdirFn(current);
      } catch {
        break;
      }
      current = path.dirname(current);
    }
  }

  return { removed, kept };
}
