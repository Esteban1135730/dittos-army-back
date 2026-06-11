import { copyFile, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

const LOCALHOST_IMAGE_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i;

export type LocalizeStoreImagesOptions = {
  storeRepoPath: string;
  localImagesRoot: string;
  assetsSubdir?: string;
  resolveRemoteImage?: (
    cardId: string,
    language?: string,
  ) => Promise<string | undefined>;
  fetchLocalhost?: (url: string) => Promise<Buffer | undefined>;
  copyFileFn?: typeof copyFile;
  existsFn?: (p: string) => boolean;
};

export function isLocalhostImageUrl(url: string): boolean {
  return LOCALHOST_IMAGE_RE.test(url.trim());
}

export function isPublicRemoteImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || isLocalhostImageUrl(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function parseCardImagesRelativePath(url: string): string | undefined {
  try {
    const parsed = new URL(url.trim());
    const match = parsed.pathname.match(/^\/card-images\/(.+)$/i);
    if (!match?.[1]) return undefined;
    return sanitizeRelativeAssetPath(decodeURIComponent(match[1]));
  } catch {
    return undefined;
  }
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

async function defaultFetchLocalhost(url: string): Promise<Buffer | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return undefined;
  }
}

export async function localizeStoreImageUrl(
  imageUrl: string,
  options: LocalizeStoreImagesOptions,
): Promise<string> {
  const trimmed = imageUrl.trim();
  if (!trimmed || !isLocalhostImageUrl(trimmed)) return trimmed;

  const assetsSubdir = options.assetsSubdir ?? 'assets/cards';
  const copy = options.copyFileFn ?? copyFile;
  const exists = options.existsFn ?? existsSync;
  const assetsRoot = path.join(
    options.storeRepoPath,
    'public',
    ...assetsSubdir.split('/'),
  );

  const relativeFromCardImages = parseCardImagesRelativePath(trimmed);
  if (relativeFromCardImages) {
    const sourcePath = path.join(
      options.localImagesRoot,
      ...relativeFromCardImages.split('/'),
    );
    if (exists(sourcePath)) {
      const destPath = path.join(assetsRoot, ...relativeFromCardImages.split('/'));
      await mkdir(path.dirname(destPath), { recursive: true });
      await copy(sourcePath, destPath);
      return storeAssetPublicUrl(relativeFromCardImages, assetsSubdir);
    }
  }

  const fetchFn = options.fetchLocalhost ?? defaultFetchLocalhost;
  const fetched = await fetchFn(trimmed);
  if (fetched?.length) {
    const fileName = fallbackAssetName(trimmed);
    const destPath = path.join(assetsRoot, 'imported', fileName);
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
      if (!original || !isLocalhostImageUrl(original)) return item;

      const remote = await resolveRemote(item.card_id, item.language);
      if (remote) {
        return { ...item, image: remote };
      }

      const localized = await resolveLocalAsset(original);
      return { ...item, image: localized };
    }),
  );
}
