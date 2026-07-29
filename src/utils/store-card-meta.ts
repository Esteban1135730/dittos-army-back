import type { CardDto } from '../service/tcgdex/dto/card.dto';
import {
  buildTcgdexCardIdLookupCandidates,
  catalogLocaleForLanguage,
} from './tcgdex-set-resolve';

export type StoreCardExportMeta = {
  name: string;
  image: string;
  expansion?: string;
  card_number?: string;
};

/** Nombres corruptos en catálogos regionales de TCGdex (p. ej. neo3-032 → "b" en ja). */
export function isUnreliableStoreCardName(
  name: string | undefined | null,
): boolean {
  const n = (name ?? '').trim();
  if (!n) return true;
  if (n.length <= 1) return true;
  if (/^[a-zA-Z]$/.test(n)) return true;
  return false;
}

export function pickStoreExportCardName(
  ...candidates: (string | undefined | null)[]
): string {
  for (const candidate of candidates) {
    const n = (candidate ?? '').trim();
    if (n && !isUnreliableStoreCardName(n)) return n;
  }
  for (const candidate of candidates) {
    const n = (candidate ?? '').trim();
    if (n) return n;
  }
  return '';
}

export function resolveStoreExportCardMeta(args: {
  cardId: string;
  sourceName?: string | null;
  localized?: StoreCardExportMeta | null;
  english?: StoreCardExportMeta | null;
}): StoreCardExportMeta {
  const name = pickStoreExportCardName(
    args.localized?.name,
    args.english?.name,
    args.sourceName,
    args.cardId,
  );
  const preferredMeta =
    args.localized && !isUnreliableStoreCardName(args.localized.name)
      ? args.localized
      : (args.english ?? args.localized);
  const cardNumber =
    preferredMeta?.card_number ??
    args.english?.card_number ??
    parseCardNumberFromCardId(args.cardId);

  return {
    name,
    image:
      preferredMeta?.image ??
      args.english?.image ??
      args.localized?.image ??
      '',
    ...((preferredMeta?.expansion ?? args.english?.expansion)
      ? { expansion: preferredMeta?.expansion ?? args.english?.expansion }
      : {}),
    ...(cardNumber ? { card_number: cardNumber } : {}),
  };
}

export { buildTcgdexCardIdLookupCandidates, catalogLocaleForLanguage };

/** Set field from CardDto: `setId(Set Name)` */
export function parseSetIdFromSetField(
  setField: string | undefined | null,
): string | undefined {
  const raw = (setField ?? '').trim();
  if (!raw) return undefined;
  const open = raw.indexOf('(');
  if (open > 0) {
    const id = raw.slice(0, open).trim();
    if (id) return id;
  }
  return raw;
}

export function parseExpansionFromSetField(
  setField: string | undefined | null,
): string | undefined {
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
    (card.localId && String(card.localId).trim()) ||
    parseCardNumberFromCardId(card.id);
  const expansion =
    card.setEnglishName?.trim() || parseExpansionFromSetField(card.set);
  return {
    name: card.name,
    image: card.image || card.images?.small || card.images?.large || '',
    expansion,
    ...(cardNumber ? { card_number: cardNumber } : {}),
  };
}
