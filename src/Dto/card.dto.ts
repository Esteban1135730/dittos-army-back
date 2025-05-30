/*
import { Card } from '@tcgdex/sdk';

export type CardDto = {
  illustrator?: string;
  rarity: string;
  category: string;
  dexId?: Array<number>;
  hp?: number;
  types?: Array<string>;
  evolveFrom?: string;
  weight?: string;
  description?: string;
  level?: number | string;
  stage?: string;
  suffix?: string;
  item?: {
    name: string;
    effect: string;
  };
  abilities?: Array<{
    type: string;
    name: string;
    effect: string;
  }>;

  attacks?: Array<{
    cost?: Array<string>;
    name: string;
    effect?: string;
    damage?: string | number;
  }>;
  weaknesses?: Array<{
    type: string;
    value?: string;
  }>;
  resistances?: Array<{
    type: string;
    value?: string;
  }>;
  retreat?: number;
  effect?: string;
  trainerType?: string;
  energyType?: string;
  regulationMark?: string;
  legal: {
    standard: boolean;
    expanded: boolean;
  };
  set: string;
};

export function mapCard(src: Card): CardDto {
  return {
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
  };
}
*/