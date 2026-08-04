/** SKU fijo de inventario con cantidad (feature 032). */

export const BULK_CARD_ID = 'da-bulk';
export const BULK_CARD_NAME = 'bulk';
export const BULK_DEFAULT_QUANTITY = 9999;
export const BULK_DEFAULT_PVP_COP = 2000;

/** Path relativo servido por el panel (`public/bulk-dummy.svg`). */
export const BULK_IMAGE_URL = '/bulk-dummy.svg';

export type ProductKind = 'unit' | 'quantity';

export function isBulkCardId(cardId: string | null | undefined): boolean {
  return String(cardId ?? '').trim() === BULK_CARD_ID;
}

export function isQuantityKind(
  productKind: string | null | undefined,
): boolean {
  return String(productKind ?? '').trim() === 'quantity';
}

export function effectiveProductKind(
  productKind: string | null | undefined,
): ProductKind {
  return isQuantityKind(productKind) ? 'quantity' : 'unit';
}
