import { Card } from '@tcgdex/sdk';
import type {
  TCGdexCardApiResponse,
  TCGdexPricingTcgplayer,
  TCGdexPricingVariant,
  TCGdexPricingCardmarket,
} from './tcgdex-api.types';

/** Precio por variante en formato frontend (nombres cortos) */
export type CardPriceVariant = {
  low?: number;
  mid?: number;
  high?: number;
  market?: number;
  directLow?: number;
};

export type CardDto = {
  id: string;
  localId: string;
  name: string;
  illustrator?: string;
  rarity: string;
  category: string;
  dexId?: number[];
  hp?: number;
  types?: string[];
  evolveFrom?: string;
  weight?: string;
  description?: string;
  level?: number | string;
  stage?: string;
  suffix?: string;
  item?: { name: string; effect: string };
  abilities?: Array<{ type: string; name: string; effect: string }>;
  attacks?: Array<{
    cost?: string[];
    name: string;
    effect?: string;
    damage?: string | number;
  }>;
  weaknesses?: Array<{ type: string; value?: string }>;
  resistances?: Array<{ type: string; value?: string }>;
  retreat?: number;
  effect?: string;
  trainerType?: string;
  energyType?: string;
  regulationMark?: string;
  legal: { standard: boolean; expanded: boolean };
  set: string;
  image: string;
  images: { small: string; large: string };
  /** Precios TCGplayer (USD) mapeados desde TCGdex - formato frontend */
  tcgplayer?: {
    unit?: string;
    updated?: string;
    prices?: Record<string, CardPriceVariant>;
  };
  /** Precios Cardmarket (EUR) desde TCGdex - opcional para frontend */
  cardmarket?: {
    unit?: string;
    updated?: string;
    avg?: number;
    low?: number;
    trend?: number;
    avg1?: number;
    avg7?: number;
    avg30?: number;
    avgHolo?: number;
    lowHolo?: number;
    trendHolo?: number;
  };
};

const TCGPLAYER_VARIANT_KEY_MAP: Record<string, string> = {
  normal: 'normal',
  'reverse-holofoil': 'reverseHolofoil',
  reverse: 'reverseHolofoil',
  holo: 'holofoil',
  '1stEdition': '1stEdition',
};

/**
 * Mapea pricing.tcgplayer de la respuesta TCGdex al formato esperado por el frontend.
 * TCGdex usa: lowPrice, midPrice, highPrice, marketPrice, directLowPrice por variante.
 */
function mapTcgPlayerPricing(
  tcgplayer: TCGdexPricingTcgplayer | undefined,
): Record<string, CardPriceVariant> | undefined {
  if (!tcgplayer || typeof tcgplayer !== 'object') return undefined;
  const prices: Record<string, CardPriceVariant> = {};
  for (const [key, data] of Object.entries(tcgplayer)) {
    if (
      key === 'updated' ||
      key === 'unit' ||
      typeof data !== 'object' ||
      !data
    )
      continue;
    const variant = data;
    const targetKey = TCGPLAYER_VARIANT_KEY_MAP[key] ?? key;
    prices[targetKey] = {
      low: variant.lowPrice,
      mid: variant.midPrice,
      high: variant.highPrice,
      market: variant.marketPrice,
      directLow: variant.directLowPrice,
    };
  }
  return Object.keys(prices).length ? prices : undefined;
}

function mapCardmarketPricing(
  cardmarket: TCGdexPricingCardmarket | undefined,
): CardDto['cardmarket'] {
  if (!cardmarket || typeof cardmarket !== 'object') return undefined;
  return {
    unit: cardmarket.unit,
    updated: cardmarket.updated,
    avg: cardmarket.avg,
    low: cardmarket.low,
    trend: cardmarket.trend,
    avg1: cardmarket.avg1,
    avg7: cardmarket.avg7,
    avg30: cardmarket.avg30,
    avgHolo: cardmarket['avg-holo'],
    lowHolo: cardmarket['low-holo'],
    trendHolo: cardmarket['trend-holo'],
  };
}

export function mapCard(src: Card, image_url: string): CardDto {
  return {
    id: src.id,
    localId: src.localId,
    name: src.name,
    illustrator: src.illustrator,
    rarity: src.rarity,
    category: src.category,
    dexId: src.dexId,
    hp: src.hp,
    types: src.types,
    evolveFrom: src.evolveFrom,
    weight: src.weight,
    description: src.description,
    level: src.level,
    stage: src.stage,
    suffix: src.suffix,
    item: src.item,
    abilities: src.abilities,
    attacks: src.attacks,
    weaknesses: src.weaknesses,
    resistances: src.resistances,
    retreat: src.retreat,
    effect: src.effect,
    trainerType: src.trainerType,
    energyType: src.energyType,
    regulationMark: src.regulationMark,
    legal: src.legal,
    set: src?.set.id + '(' + src.set.name + ')',
    image: image_url,
    images: { small: image_url, large: image_url },
  };
}

/**
 * Construye la URL de imagen en el mismo formato que el SDK TCGdex (getImageURL).
 * Documentación: https://tcgdex.dev/assets — formato {base}/{quality}.png
 * Add-stock usa getImageURL('low', 'png') → misma URL que devolvemos aquí.
 */
function buildCardImageUrls(baseUrl: string): {
  image: string;
  small: string;
  large: string;
} {
  if (!baseUrl || typeof baseUrl !== 'string') {
    return { image: '', small: '', large: '' };
  }
  const base = baseUrl.trim();
  if (!base) return { image: '', small: '', large: '' };
  // Si ya incluye quality (ej. /low.png), usarla tal cual para image/small
  if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(base)) {
    return { image: base, small: base, large: base };
  }
  const lowUrl = base.startsWith('http')
    ? `${base.replace(/\/+$/, '')}/low.png`
    : base;
  const highUrl = base.startsWith('http')
    ? `${base.replace(/\/+$/, '')}/high.png`
    : base;
  return {
    image: lowUrl,
    small: lowUrl,
    large: highUrl,
  };
}

export function mapCardFromApi(
  raw: TCGdexCardApiResponse | null | undefined,
): CardDto {
  if (!raw || typeof raw !== 'object') {
    return {
      id: '',
      localId: '',
      name: '',
      rarity: '',
      category: '',
      legal: { standard: false, expanded: false },
      set: '',
      image: '',
      images: { small: '', large: '' },
    };
  }
  const id = raw.id ?? '';
  const localId = raw.localId ?? '';
  const {
    image: imageUrl,
    small: imageSmall,
    large: imageLarge,
  } = buildCardImageUrls(raw.image ?? '');
  const pricing = raw.pricing;

  return {
    id,
    localId,
    name: raw.name ?? '',
    illustrator: raw.illustrator,
    rarity: raw.rarity ?? '',
    category: raw.category ?? '',
    dexId: raw.dexId,
    hp: raw.hp,
    types: raw.types,
    evolveFrom: raw.evolveFrom,
    weight: raw.weight,
    description: raw.description,
    level: raw.level,
    stage: raw.stage,
    suffix: raw.suffix,
    item: raw.item,
    abilities: raw.abilities,
    attacks: raw.attacks,
    weaknesses: raw.weaknesses,
    resistances: raw.resistances,
    retreat: raw.retreat,
    effect: raw.effect,
    trainerType: raw.trainerType,
    energyType: raw.energyType,
    regulationMark: raw.regulationMark,
    legal: raw.legal ?? { standard: false, expanded: false },
    set: raw.set ? raw.set.id + '(' + raw.set.name + ')' : '',
    image: imageUrl,
    images: { small: imageSmall, large: imageLarge },
    tcgplayer: pricing?.tcgplayer
      ? {
          unit: pricing.tcgplayer.unit,
          updated: pricing.tcgplayer.updated,
          prices: mapTcgPlayerPricing(pricing.tcgplayer),
        }
      : undefined,
    cardmarket: mapCardmarketPricing(pricing?.cardmarket),
  };
}
