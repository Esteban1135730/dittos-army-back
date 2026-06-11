import type { IncomingBatchItemInput } from '../Dto/incoming.dto';

export type TcgDexBatchEnrichment = {
  name?: string;
  image?: string;
};

function trimOrEmpty(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

/** Nombre canónico del ítem: siempre el enviado por el cliente (CardTrader / panel). */
export function resolveIncomingBatchItemCardName(
  item: Pick<IncomingBatchItemInput, 'card_name'>,
  tcgDexFallback?: Pick<TcgDexBatchEnrichment, 'name'>,
): string {
  const fromClient = trimOrEmpty(item.card_name);
  if (fromClient) return fromClient;
  return trimOrEmpty(tcgDexFallback?.name);
}

/** Imagen: primero la del cliente; TCGdex solo como respaldo. */
export function resolveIncomingBatchItemImageUrl(
  item: Pick<IncomingBatchItemInput, 'image_url'>,
  tcgDexFallback?: Pick<TcgDexBatchEnrichment, 'image'>,
): string {
  const fromClient = trimOrEmpty(item.image_url);
  if (fromClient) return fromClient;
  return trimOrEmpty(tcgDexFallback?.image);
}

/** IDs que aún necesitan consulta TCGdex (falta nombre o imagen en el payload). */
export function cardIdsNeedingTcgDexEnrichment(
  items: IncomingBatchItemInput[],
): string[] {
  const ids = new Set<string>();
  for (const it of items) {
    if (!trimOrEmpty(it.card_name) || !trimOrEmpty(it.image_url)) {
      ids.add(it.card_id);
    }
  }
  return [...ids];
}
