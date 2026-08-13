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
  tcg_rarity?: string;
  category?: string;
  types?: string[];
  hp?: number;
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

/** Nombres en escritura japonesa/CJK: no sustituyen el nombre local de inventario. */
export function isCjkCardName(name: string | undefined | null): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(name ?? ''));
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
  const localizedName =
    args.localized?.name && !isCjkCardName(args.localized.name)
      ? args.localized.name
      : undefined;
  const name = pickStoreExportCardName(
    args.sourceName,
    args.english?.name,
    localizedName,
    args.cardId,
  );
  const localizedUsable =
    args.localized &&
    !isUnreliableStoreCardName(args.localized.name) &&
    !isCjkCardName(args.localized.name);
  const preferredMeta = localizedUsable
    ? args.localized
    : (args.english ?? args.localized);
  const cardNumber =
    preferredMeta?.card_number ??
    args.english?.card_number ??
    parseCardNumberFromCardId(args.cardId);

  const tcgRarity =
    preferredMeta?.tcg_rarity ??
    args.english?.tcg_rarity ??
    args.localized?.tcg_rarity;
  const category =
    preferredMeta?.category ??
    args.english?.category ??
    args.localized?.category;
  const types =
    preferredMeta?.types ?? args.english?.types ?? args.localized?.types;
  const hp = preferredMeta?.hp ?? args.english?.hp ?? args.localized?.hp;

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
    ...(tcgRarity ? { tcg_rarity: tcgRarity } : {}),
    ...(category ? { category: category } : {}),
    ...(types && types.length ? { types } : {}),
    ...(hp != null ? { hp } : {}),
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
  const rarity = (card.rarity || '').trim();
  const category = (card.category || '').trim();
  const types = (card.types || []).map((t) => String(t).trim()).filter(Boolean);
  return {
    name: card.name,
    image: card.image || card.images?.small || card.images?.large || '',
    expansion,
    ...(cardNumber ? { card_number: cardNumber } : {}),
    ...(rarity ? { tcg_rarity: rarity } : {}),
    ...(category ? { category } : {}),
    ...(types.length ? { types } : {}),
    ...(card.hp != null ? { hp: card.hp } : {}),
  };
}

export function tcgdexMetaSpread(card?: StoreCardExportMeta | null): {
  tcg_rarity?: string;
  category?: string;
  types?: string[];
  hp?: number;
} {
  if (!card) return {};
  return {
    ...(card.tcg_rarity ? { tcg_rarity: card.tcg_rarity } : {}),
    ...(card.category ? { category: card.category } : {}),
    ...(card.types && card.types.length ? { types: card.types } : {}),
    ...(card.hp != null ? { hp: card.hp } : {}),
  };
}
