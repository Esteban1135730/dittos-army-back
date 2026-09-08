import { isBulkCardId, isQuantityKind } from '../constants/bulk-product';
import {
  isLocalhostImageUrl,
  isUsableStockImageUrl,
  normalizeTcgdexCdnImageUrl,
  sanitizeRelativeAssetPath,
} from './store-image-localize';

export const ACTIVE_IMAGE_CACHE_STATES = new Set([
  'disponible',
  'en_stock_colombia',
  'reserva',
]);

export const CARD_IMAGES_META_FILES = new Set([
  'card-index.json',
  'pending-download-manifest.json',
  '.gitkeep',
]);

export const CARD_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const CARD_IMAGE_FETCH_TIMEOUT_MS = 15_000;
export const CARD_IMAGE_DOWNLOAD_CONCURRENCY = 4;

export type StockLikeForImageCache = {
  card_id?: string | null;
  card_state?: string | null;
  product_kind?: string | null;
  quantity?: number | null;
};

export function isCardImagesMetaFile(relative: string): boolean {
  const base =
    sanitizeRelativeAssetPath(relative).split('/').pop()?.toLowerCase() ?? '';
  return CARD_IMAGES_META_FILES.has(base);
}

export function isActiveStockForImageCache(
  stock: StockLikeForImageCache,
): boolean {
  const cardId = String(stock.card_id ?? '').trim();
  if (!cardId || isBulkCardId(cardId)) return false;
  const state = String(stock.card_state ?? '').trim();
  if (!ACTIVE_IMAGE_CACHE_STATES.has(state)) return false;
  if (isQuantityKind(stock.product_kind)) {
    const qty = stock.quantity;
    if (qty == null || !Number.isFinite(qty) || qty <= 0) return false;
  }
  return true;
}

export function pickDownloadUrl(
  imageUrl: string | null | undefined,
): string | undefined {
  const trimmed = String(imageUrl ?? '').trim();
  if (!trimmed || !isUsableStockImageUrl(trimmed)) return undefined;
  return normalizeTcgdexCdnImageUrl(trimmed);
}

export function publicCardImagesPath(relative: string): string {
  const stripped = relative.replace(/^\/card-images\//i, '');
  const safe = sanitizeRelativeAssetPath(stripped);
  if (!safe) return '';
  return `/card-images/${safe}`;
}

/**
 * Devuelve la ruta pública a persistir, o `undefined` si no hay que pisar
 * (CDN u otra URL pública ya usable).
 */
export function rewriteImageUrlIfLocalhostOrEmpty(
  current: string | null | undefined,
  relativePublicPath: string,
): string | undefined {
  const next = publicCardImagesPath(relativePublicPath);
  if (!next) return undefined;
  const trimmed = String(current ?? '').trim();
  if (!trimmed) return next;
  if (isLocalhostImageUrl(trimmed) && /\/card-images\//i.test(trimmed)) {
    return next;
  }
  return undefined;
}

/** Extrae el card_id típico del basename (`swsh3/swsh3-136.png` → `swsh3-136`). */
export function cardIdsFromRelativePath(relative: string): string[] {
  const safe = sanitizeRelativeAssetPath(relative);
  if (!safe || isCardImagesMetaFile(safe)) return [];
  const base = safe.split('/').pop() ?? '';
  const name = base.replace(/\.[^.]+$/, '').trim();
  if (!name) return [];
  return [name];
}

export function looksLikeImageBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return true;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true;
  }
  return false;
}

export function isAcceptableCardImageBody(
  buf: Buffer,
  contentType: string,
): boolean {
  if (!buf?.length || buf.length > CARD_IMAGE_MAX_BYTES) return false;
  const ct = contentType.toLowerCase();
  if (ct.startsWith('image/')) return true;
  return looksLikeImageBuffer(buf);
}

export function extensionFromImageSource(
  url: string,
  contentType: string,
): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('jpeg')) return '.jpg';
  if (ct.includes('jpg')) return '.jpg';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('png')) return '.png';
  const match = url.match(/\.(png|jpe?g|webp|gif)(\?|$)/i);
  if (match?.[1]) {
    const ext = match[1].toLowerCase();
    return ext === 'jpeg' ? '.jpg' : `.${ext}`;
  }
  return '.png';
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
