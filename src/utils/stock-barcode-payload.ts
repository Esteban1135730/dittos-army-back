import { isValidObjectId } from 'mongoose';
import {
  OWNERS_CONFIG,
  type OwnerKey,
  isOwnerKey,
} from '../config/owners.config';

/** Prefijo legacy Pablo (QR stock). */
export const STOCK_QR_PREFIX = OWNERS_CONFIG.owners.pablo.stockQrPrefix;

export type ParsedStockQr = {
  stockId: string;
  /** null si ObjectId pelado (sin prefijo). */
  owner: OwnerKey | null;
  prefixUsed?: string;
};

/** Pistola teclado US→ES: `:`→Ñ, `-`→' */
function loosePrefixRe(prefix: string): RegExp {
  // DA-STOCK: → DA[-_' ]?STOCK[:Ñ;]?
  const body = prefix.replace(/:$/, '');
  const escaped = body.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/-/g, '[-_\' ]?');
  return new RegExp(`${escaped}[:\\u00D1;]?([a-f0-9]{24})`, 'i');
}

const PREFIX_ENTRIES = Object.values(OWNERS_CONFIG.owners).map((o) => ({
  owner: o.key,
  prefix: o.stockQrPrefix,
  loose: loosePrefixRe(o.stockQrPrefix),
}));

function normalizeQrWedgeInput(raw: string): string {
  return raw
    .trim()
    .replace(/Ñ/g, ':')
    .replace(/[''´`]/g, '-');
}

/**
 * Parse multi-owner: reconoce DA-STOCK: y ESTEBAN-STOCK: (+ teclado ES).
 * ObjectId pelado → owner null.
 */
export function parseStockQrPayloadMulti(raw: string): ParsedStockQr | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = normalizeQrWedgeInput(trimmed);

  for (const entry of PREFIX_ENTRIES) {
    if (normalized.toUpperCase().startsWith(entry.prefix.toUpperCase())) {
      const id = normalized.slice(entry.prefix.length).trim();
      if (!isValidObjectId(id)) return null;
      return { stockId: id, owner: entry.owner, prefixUsed: entry.prefix };
    }
  }

  for (const entry of PREFIX_ENTRIES) {
    const loose =
      entry.loose.exec(trimmed) ?? entry.loose.exec(normalized);
    if (loose?.[1] && isValidObjectId(loose[1])) {
      return {
        stockId: loose[1],
        owner: entry.owner,
        prefixUsed: entry.prefix,
      };
    }
  }

  if (isValidObjectId(trimmed)) {
    return { stockId: trimmed, owner: null };
  }

  return null;
}

/** Legacy: solo stockId (o null). */
export function parseStockQrPayload(raw: string): string | null {
  return parseStockQrPayloadMulti(raw)?.stockId ?? null;
}

export function encodeStockQrPayload(
  stockId: string,
  owner: OwnerKey = 'pablo',
): string {
  const key = isOwnerKey(owner) ? owner : 'pablo';
  const prefix = OWNERS_CONFIG.owners[key].stockQrPrefix;
  return `${prefix}${stockId.trim()}`;
}

/** @deprecated Usar encodeStockQrPayload */
export const encodeStockBarcodePayload = encodeStockQrPayload;
/** @deprecated Usar parseStockQrPayload */
export const parseStockBarcodePayload = parseStockQrPayload;
export const STOCK_BARCODE_PREFIX = STOCK_QR_PREFIX;
