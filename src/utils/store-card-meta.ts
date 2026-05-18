import type { CardDto } from '../service/tcgdex/dto/card.dto';

export type StoreCardExportMeta = {
  name: string;
  image: string;
  expansion?: string;
  card_number?: string;
};

/** Set field from CardDto: `setId(Set Name)` */
export function parseExpansionFromSetField(setField: string | undefined | null): string | undefined {
  const raw = (setField ?? '').trim();
  if (!raw) return undefined;
  const open = raw.indexOf('(');
  const close = raw.lastIndexOf(')');
  if (open > 0 && close > open) {
    const name = raw.slice(open + 1, close).trim();
    if (name) return name;
  }
  const dash = raw.lastIndexOf('-');
  if (dash > 0 && open < 0) {
    return raw.slice(0, dash).trim() || raw;
  }
  return raw;
}

export function parseCardNumberFromCardId(cardId: string): string | undefined {
  const id = (cardId ?? '').trim();
  if (!id) return undefined;
  const dash = id.lastIndexOf('-');
  return dash > 0 ? id.slice(dash + 1) : undefined;
}

export function storeCardMetaFromDto(card: CardDto): StoreCardExportMeta {
  const cardNumber =
    (card.localId && String(card.localId).trim()) || parseCardNumberFromCardId(card.id);
  return {
    name: card.name,
    image: card.image || card.images?.small || card.images?.large || '',
    expansion: parseExpansionFromSetField(card.set),
    ...(cardNumber ? { card_number: cardNumber } : {}),
  };
}
