import { AsyncLocalStorage } from 'async_hooks';
import {
  OWNERS_CONFIG,
  type OwnerKey,
  isOwnerKey,
} from '../config/owners.config';

type OwnerStore = { owner: OwnerKey };

const ownerAls = new AsyncLocalStorage<OwnerStore>();

export function getCurrentOwner(): OwnerKey {
  return ownerAls.getStore()?.owner ?? OWNERS_CONFIG.defaultOwner;
}

export function runWithOwner<T>(owner: OwnerKey, fn: () => T): T {
  return ownerAls.run({ owner }, fn);
}

export async function runWithOwnerAsync<T>(
  owner: OwnerKey,
  fn: () => Promise<T>,
): Promise<T> {
  return ownerAls.run({ owner }, fn);
}

/**
 * Resolve owner from X-Owner header (priority) or ?owner= query.
 * Invalid value → null (caller should 400). Missing → defaultOwner.
 */
export function resolveOwnerFromRequest(input: {
  header?: string | string[] | undefined;
  query?: string | string[] | undefined;
}): OwnerKey | null {
  const rawHeader = Array.isArray(input.header)
    ? input.header[0]
    : input.header;
  const rawQuery = Array.isArray(input.query) ? input.query[0] : input.query;
  const raw = (rawHeader ?? rawQuery)?.trim();
  if (!raw) return OWNERS_CONFIG.defaultOwner;
  if (!isOwnerKey(raw)) return null;
  return raw;
}
