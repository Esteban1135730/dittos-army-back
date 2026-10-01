import { join } from 'path';
import { sanitizeRelativeAssetPath } from './store-image-localize';

export function resolveStockPhotosRoot(): string {
  const fromEnv = process.env.STOCK_PHOTOS_DIR?.trim();
  if (fromEnv) return fromEnv;
  return join(process.cwd(), 'data', 'stock-photos');
}

/** Segmento seguro para carpetas (card_id puede tener caracteres especiales). */
export function sanitizeStockPhotoSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '_';
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

/**
 * Ruta relativa bajo `data/stock-photos/`: `{owner}/{cardId}/{stockId}.jpg`
 */
export function stockPhotoRelativePath(
  owner: string,
  cardId: string,
  stockId: string,
): string {
  const safeOwner = sanitizeStockPhotoSegment(owner);
  const safeCardId = sanitizeStockPhotoSegment(cardId);
  const safeStockId = sanitizeStockPhotoSegment(stockId);
  const relative = `${safeOwner}/${safeCardId}/${safeStockId}.jpg`;
  const sanitized = sanitizeRelativeAssetPath(relative);
  if (!sanitized) {
    throw new Error('Ruta de foto de stock inválida');
  }
  return sanitized;
}

export function stockPhotoPublicPath(
  owner: string,
  cardId: string,
  stockId: string,
): string {
  return `/stock-photos/${stockPhotoRelativePath(owner, cardId, stockId)}`;
}

export function isStockPhotoPublicPath(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  const path = trimmed.startsWith('http')
    ? (() => {
        try {
          return new URL(trimmed).pathname;
        } catch {
          return '';
        }
      })()
    : trimmed.split('?')[0] ?? '';
  return path.toLowerCase().startsWith('/stock-photos/');
}
