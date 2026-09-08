import { BadRequestException } from '@nestjs/common';
import { isOwnerKey, type OwnerKey } from '../config/owners.config';
import { getCurrentOwner, runWithOwnerAsync } from './owner-context';

/** Body/query `stock_owner`. Omitido → owner del request. Inválido → 400. */
export function resolveRequestedStockOwner(value: unknown): OwnerKey {
  if (value == null || value === '') {
    return getCurrentOwner();
  }
  if (!isOwnerKey(value)) {
    throw new BadRequestException('stock_owner inválido');
  }
  return value;
}

/**
 * Documentos viejos sin campo = `fallbackOwner` (ALS del request por defecto).
 * Pasar fallback explícito si se lee dentro de otro `runWithOwnerAsync`.
 */
export function stockOwnerFromReserva(
  reserva: {
    stock_owner?: string | null;
  },
  fallbackOwner: OwnerKey = getCurrentOwner(),
): OwnerKey {
  return isOwnerKey(reserva.stock_owner)
    ? reserva.stock_owner
    : fallbackOwner;
}

export function withStockOwner<T>(
  owner: OwnerKey,
  fn: () => Promise<T>,
): Promise<T> {
  return runWithOwnerAsync(owner, fn);
}

export function reservaMatchesStockOwner(
  reserva: { stock_owner?: string | null },
  owner: OwnerKey,
  fallbackOwner: OwnerKey = getCurrentOwner(),
): boolean {
  return stockOwnerFromReserva(reserva, fallbackOwner) === owner;
}
