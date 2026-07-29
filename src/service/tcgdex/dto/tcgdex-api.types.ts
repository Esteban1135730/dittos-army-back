/**
 * Tipos según la respuesta estándar de la API TCGdex.
 * Ejemplo: GET https://api.tcgdex.net/v2/en/cards/swsh3-136
 */

export interface TCGdexSetBrief {
  cardCount: { official: number; total: number };
  id: string;
  logo?: string;
  name: string;
  /** Nombre EN del set cuando el locale no es inglés (p. ej. cards-database). */
  englishName?: string;
  symbol?: string;
}

export interface TCGdexVariants {
  firstEdition?: boolean;
  holo?: boolean;
  normal?: boolean;
  reverse?: boolean;
  wPromo?: boolean;
}

export interface TCGdexPricingVariant {
  productId?: number;
  lowPrice?: number;
  midPrice?: number;
  highPrice?: number;
  marketPrice?: number;
  directLowPrice?: number;
}

/** TCGplayer: updated, unit y una entrada por variante (normal, reverse-holofoil, holo, etc.) */
export interface TCGdexPricingTcgplayer {
  updated?: string;
  unit?: string;
  normal?: TCGdexPricingVariant;
  'reverse-holofoil'?: TCGdexPricingVariant;
  reverse?: TCGdexPricingVariant;
  holo?: TCGdexPricingVariant;
  '1stEdition'?: TCGdexPricingVariant;
  [key: string]: TCGdexPricingVariant | string | undefined;
}

export interface TCGdexPricingCardmarket {
  updated?: string;
  unit?: string;
  avg?: number;
  low?: number;
  trend?: number;
  avg1?: number;
  avg7?: number;
  avg30?: number;
  'avg-holo'?: number;
  'low-holo'?: number;
  'trend-holo'?: number;
  'avg1-holo'?: number;
  'avg7-holo'?: number;
  'avg30-holo'?: number;
  idProduct?: number;
}

export interface TCGdexPricing {
  cardmarket?: TCGdexPricingCardmarket;
  tcgplayer?: TCGdexPricingTcgplayer;
}

export interface TCGdexCardApiResponse {
  id?: string;
  localId?: string;
  name: string;
  category?: string;
  illustrator?: string;
  image?: string;
  rarity?: string;
  set?: TCGdexSetBrief;
  variants?: TCGdexVariants;
  variants_detailed?: Array<{ type: string; size?: string }>;
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
  legal?: { standard: boolean; expanded: boolean };
  updated?: string;
  pricing?: TCGdexPricing;
}
