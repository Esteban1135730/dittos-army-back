/** Descarta el arte roto del SDK TCGdex cuando la carta no tiene `image` (`undefined/low.png`). */
export function sanitizeCardImageUrl(url: string | null | undefined): string {
  const trimmed = String(url ?? '').trim();
  if (!trimmed) return '';
  if (/^undefined(\/|$)/i.test(trimmed)) return '';
  if (trimmed.toLowerCase().includes('undefined/')) return '';
  return trimmed;
}

/**
 * Arte oficial de pokemon.com cuando TCGdex lista la carta sin campo `image`.
 * p. ej. mep/080 → MEP/MEP_EN_80.png ; swsh12.5gg/GG33 → SWSH12PT5GG/..._GG33.png
 */
export function officialPokemonComCardImageUrl(
  setId: string | null | undefined,
  localId: string | null | undefined,
  lang: 'EN' | 'ES' = 'EN',
): string | undefined {
  const set = String(setId ?? '').trim();
  const local = String(localId ?? '').trim();
  if (!set || !local) return undefined;
  if (/^S[0-9]/i.test(set)) return undefined;
  const code = set
    .replace(/(\d)\.(\d)/g, '$1pt$2')
    .replace(/\./g, '')
    .toUpperCase();
  if (!/^[A-Z0-9]+$/.test(code)) return undefined;
  const num = /^\d+$/.test(local) ? String(Number(local)) : local;
  if (!num) return undefined;
  return `https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/${code}/${code}_${lang}_${num}.png`;
}

/**
 * CDN TCGdex para sets japoneses Sword & Shield (`S4a`, `S8b`, …) cuando la
 * API no lista la carta pero el PNG sí está en `assets.tcgdex.net/ja/S/…`.
 */
export function tcgdexJaSwordShieldCdnUrl(
  setId: string | null | undefined,
  localId: string | null | undefined,
): string | undefined {
  const set = String(setId ?? '').trim();
  const local = String(localId ?? '').trim();
  if (!set || !local) return undefined;
  if (!/^S[0-9]/i.test(set)) return undefined;
  if (/^SV/i.test(set) || /^SWSH/i.test(set)) return undefined;
  return `https://assets.tcgdex.net/ja/S/${set}/${local}/low.png`;
}

export function tcgdexJaSwordShieldCdnUrlFromCardId(
  cardId: string | null | undefined,
): string | undefined {
  const id = String(cardId ?? '').trim();
  const dash = id.lastIndexOf('-');
  if (dash <= 0) return undefined;
  return tcgdexJaSwordShieldCdnUrl(id.slice(0, dash), id.slice(dash + 1));
}

export function fallbackCardImageUrl(args: {
  image?: string | null;
  setId?: string | null;
  localId?: string | null;
}): string {
  const primary = sanitizeCardImageUrl(args.image);
  if (primary) return primary;
  return (
    officialPokemonComCardImageUrl(args.setId, args.localId) ??
    tcgdexJaSwordShieldCdnUrl(args.setId, args.localId) ??
    ''
  );
}
