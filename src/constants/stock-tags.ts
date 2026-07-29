import { BadRequestException } from '@nestjs/common';

/** Catálogo cerrado de tags de línea de stock (orden canónico en respuestas). */
export const STOCK_TAG_VALUES = [
  'vintage',
  'bulk',
  'jugable',
  'brillo',
] as const;

export type StockTag = (typeof STOCK_TAG_VALUES)[number];

const ALLOWED = new Set<string>(STOCK_TAG_VALUES);

/**
 * Normaliza y valida `tags` desde body HTTP.
 * - Omite strings vacíos tras trim.
 * - Dedup tras normalizar a minúsculas.
 * - Orden estable: vintage, bulk, jugable, brillo.
 */
export function normalizeStockTagsInput(raw: unknown): string[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new BadRequestException('tags debe ser un array de strings');
  }
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') {
      throw new BadRequestException('cada tag debe ser string');
    }
    const t = item.trim().toLowerCase();
    if (t === '') {
      continue;
    }
    if (!ALLOWED.has(t)) {
      throw new BadRequestException(
        `tag inválido: "${item}". Permitidos: ${STOCK_TAG_VALUES.join(', ')}`,
      );
    }
    seen.add(t);
  }
  return STOCK_TAG_VALUES.filter((v) => seen.has(v));
}
