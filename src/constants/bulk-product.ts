/** SKU fijo de inventario con cantidad (feature 032). */

export const BULK_CARD_ID = 'da-bulk';
export const BULK_CARD_NAME = 'bulk';
export const BULK_DEFAULT_QUANTITY = 9999;
export const BULK_DEFAULT_PVP_COP = 2000;

/** Path relativo servido por el panel (`public/bulk-dummy.svg`). */
export const BULK_IMAGE_URL = '/bulk-dummy.svg';

/** SKUs quantity de Pablo. Domicilio/protección: PVP 0 (precio en cada pedido). */
export const ENVIO_CARD_ID = 'da-envio';
export const ENVIO_CARD_NAME = 'envio';
export const DOMICILIO_CARD_ID = 'da-domicilio';
export const DOMICILIO_CARD_NAME = 'domicilio';
export const PROTECCION_CARTAS_CARD_ID = 'da-proteccion-cartas';
export const PROTECCION_CARTAS_CARD_NAME = 'proteccion de cartas';
export const ACCESSORY_DEFAULT_PVP_COP = 0;

export const PABLO_ACCESSORY_SKUS = [
  {
    card_id: ENVIO_CARD_ID,
    card_name: ENVIO_CARD_NAME,
    pvp_cop: ACCESSORY_DEFAULT_PVP_COP,
  },
  {
    card_id: DOMICILIO_CARD_ID,
    card_name: DOMICILIO_CARD_NAME,
    pvp_cop: ACCESSORY_DEFAULT_PVP_COP,
  },
  {
    card_id: PROTECCION_CARTAS_CARD_ID,
    card_name: PROTECCION_CARTAS_CARD_NAME,
    pvp_cop: ACCESSORY_DEFAULT_PVP_COP,
  },
] as const;

export type ProductKind = 'unit' | 'quantity';

export function isBulkCardId(cardId: string | null | undefined): boolean {
  return String(cardId ?? '').trim() === BULK_CARD_ID;
}

/**
 * Envío cobra precio (PVP / amount) pero no aporta margen:
 * ganancia = 0 en stock, reservas, ventas y métricas.
 * Domicilio sí tiene 100% de ganancia (costo 0).
 */
export function isZeroProfitCardId(
  cardId: string | null | undefined,
): boolean {
  return String(cardId ?? '').trim() === ENVIO_CARD_ID;
}

/** SKUs quantity sintéticos (sin TCGdex): bulk + accesorios Pablo. */
export function isSyntheticQuantityCardId(
  cardId: string | null | undefined,
): boolean {
  const id = String(cardId ?? '').trim();
  if (!id) return false;
  if (isBulkCardId(id)) return true;
  return PABLO_ACCESSORY_SKUS.some((sku) => sku.card_id === id);
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
