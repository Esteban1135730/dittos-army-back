import { isValidObjectId } from 'mongoose';

/** Prefijo en Code 128 (pistola láser y lectores 1D). */
export const STOCK_BARCODE_PREFIX = 'DA-STOCK:';

export function encodeStockBarcodePayload(stockId: string): string {
  return `${STOCK_BARCODE_PREFIX}${stockId.trim()}`;
}

export function parseStockBarcodePayload(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(STOCK_BARCODE_PREFIX)) {
    const id = trimmed.slice(STOCK_BARCODE_PREFIX.length).trim();
    return isValidObjectId(id) ? id : null;
  }
  return isValidObjectId(trimmed) ? trimmed : null;
}

/** @deprecated Usar encodeStockBarcodePayload */
export const encodeStockQrPayload = encodeStockBarcodePayload;
/** @deprecated Usar parseStockBarcodePayload */
export const parseStockQrPayload = parseStockBarcodePayload;
export const STOCK_QR_PREFIX = STOCK_BARCODE_PREFIX;
