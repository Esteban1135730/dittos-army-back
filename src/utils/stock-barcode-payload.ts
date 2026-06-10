import { isValidObjectId } from 'mongoose';

/** Prefijo en QR de stock (pistola QR y cámara). */
export const STOCK_QR_PREFIX = 'DA-STOCK:';

/** Pistola en modo teclado (US→ES): `:`→Ñ, `-`→' */
const LOOSE_STOCK_QR_RE = /DA[-_' ]?STOCK[:\u00D1;]?([a-f0-9]{24})/i;

export function encodeStockQrPayload(stockId: string): string {
  return `${STOCK_QR_PREFIX}${stockId.trim()}`;
}

function normalizeQrWedgeInput(raw: string): string {
  return raw
    .trim()
    .replace(/Ñ/g, ':')
    .replace(/[''´`]/g, '-');
}

export function parseStockQrPayload(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = normalizeQrWedgeInput(trimmed);
  if (normalized.startsWith(STOCK_QR_PREFIX)) {
    const id = normalized.slice(STOCK_QR_PREFIX.length).trim();
    return isValidObjectId(id) ? id : null;
  }

  const loose =
    LOOSE_STOCK_QR_RE.exec(trimmed) ?? LOOSE_STOCK_QR_RE.exec(normalized);
  if (loose?.[1] && isValidObjectId(loose[1])) {
    return loose[1];
  }

  return isValidObjectId(trimmed) ? trimmed : null;
}

/** @deprecated Usar encodeStockQrPayload */
export const encodeStockBarcodePayload = encodeStockQrPayload;
/** @deprecated Usar parseStockQrPayload */
export const parseStockBarcodePayload = parseStockQrPayload;
export const STOCK_BARCODE_PREFIX = STOCK_QR_PREFIX;
