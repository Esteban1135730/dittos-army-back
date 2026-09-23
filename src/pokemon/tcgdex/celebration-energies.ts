import { officialPokemonComCardImageUrl } from '../../utils/card-image-url';
import type { CardDto } from './dto/card.dto';
import type { CardResumeDto } from './dto/card.resume.dto';

/**
 * Energías básicas foil de 30th Celebration.
 * TCGdex solo publica MEE 001–008 (Mega Evolution). Estas son MEE 009–016,
 * ilustradas por YOSHIROTTEN, y no vienen dentro del set `30th`.
 */
const SET_ID = 'mee';
const SET_NAME_EN = 'Mega Evolution Energy';
const SET_NAME_ES = 'Megaevolución Energía';

export const CELEBRATION_ENERGY_SET_IDS = ['mee', '30th'] as const;

type EnergyNames = {
  en: string;
  es: string;
  fr: string;
  it: string;
  pt: string;
  de: string;
};

type EnergyDef = {
  localId: string;
  names: EnergyNames;
};

const ENERGIES: EnergyDef[] = [
  {
    localId: '009',
    names: {
      en: 'Basic Grass Energy',
      es: 'Energía Básica Planta',
      fr: 'Énergie Plante de base',
      it: 'Energia Erba base',
      pt: 'Energia de Grama Básica',
      de: 'Basis-Pflanze-Energie',
    },
  },
  {
    localId: '010',
    names: {
      en: 'Basic Fire Energy',
      es: 'Energía Básica Fuego',
      fr: 'Énergie Feu de base',
      it: 'Energia Fuoco base',
      pt: 'Energia de Fogo Básica',
      de: 'Basis-Feuer-Energie',
    },
  },
  {
    localId: '011',
    names: {
      en: 'Basic Water Energy',
      es: 'Energía Básica Agua',
      fr: 'Énergie Eau de base',
      it: 'Energia Acqua base',
      pt: 'Energia de Água Básica',
      de: 'Basis-Wasser-Energie',
    },
  },
  {
    localId: '012',
    names: {
      en: 'Basic Lightning Energy',
      es: 'Energía Básica Rayo',
      fr: 'Énergie Electrik de base',
      it: 'Energia Lampo base',
      pt: 'Energia de Raios Básica',
      de: 'Basis-Elektro-Energie',
    },
  },
  {
    localId: '013',
    names: {
      en: 'Basic Psychic Energy',
      es: 'Energía Básica Psíquica',
      fr: 'Énergie Psy de base',
      it: 'Energia Psico base',
      pt: 'Energia Psíquica Básica',
      de: 'Basis-Psycho-Energie',
    },
  },
  {
    localId: '014',
    names: {
      en: 'Basic Fighting Energy',
      es: 'Energía Básica Lucha',
      fr: 'Énergie Combat de base',
      it: 'Energia Lotta base',
      pt: 'Energia de Luta Básica',
      de: 'Basis-Kampf-Energie',
    },
  },
  {
    localId: '015',
    names: {
      en: 'Basic Darkness Energy',
      es: 'Energía Básica Oscura',
      fr: 'Énergie Obscurité de base',
      it: 'Energia Oscurità base',
      pt: 'Energia de Escuridão Básica',
      de: 'Basis-Finsternis-Energie',
    },
  },
  {
    localId: '016',
    names: {
      en: 'Basic Metal Energy',
      es: 'Energía Básica Metálica',
      fr: 'Énergie Métal de base',
      it: 'Energia Metallo base',
      pt: 'Energia de Metal Básica',
      de: 'Basis-Metall-Energie',
    },
  },
];

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function namesFor(def: EnergyDef, locale: string): string {
  const key = locale.trim().toLowerCase();
  if (key === 'es' || key === 'es-mx') return def.names.es;
  if (key === 'fr') return def.names.fr;
  if (key === 'it') return def.names.it;
  if (key === 'pt' || key === 'pt-br' || key === 'pt-pt') return def.names.pt;
  if (key === 'de') return def.names.de;
  return def.names.en;
}

function cardId(localId: string): string {
  return `${SET_ID}-${localId}`;
}

export function isCelebrationEnergySet(setId: string): boolean {
  return (CELEBRATION_ENERGY_SET_IDS as readonly string[]).includes(setId);
}

export function celebrationEnergyResumes(locale: string): CardResumeDto[] {
  return ENERGIES.map((def) => ({
    id: cardId(def.localId),
    localId: def.localId,
    name: namesFor(def, locale),
  }));
}

export function appendCelebrationEnergies(
  setId: string,
  cards: CardResumeDto[],
  locale: string,
): CardResumeDto[] {
  if (!isCelebrationEnergySet(setId)) return cards;
  const present = new Set(cards.map((card) => card.id));
  const extra = celebrationEnergyResumes(locale).filter((card) => !present.has(card.id));
  return extra.length ? [...cards, ...extra] : cards;
}

export function celebrationEnergiesMatchingName(
  query: string,
  locale: string,
): CardResumeDto[] {
  const needle = fold(query);
  if (needle.length < 3) return [];
  return ENERGIES.filter((def) => {
    const haystack = fold(Object.values(def.names).join(' '));
    return haystack.includes(needle);
  }).map((def) => ({
    id: cardId(def.localId),
    localId: def.localId,
    name: namesFor(def, locale),
  }));
}

const ENERGY_TYPE_TOKENS: Array<{ localId: string; tokens: string[] }> = [
  { localId: '009', tokens: ['grass', 'planta', 'plante', 'erba', 'grama', 'pflanze'] },
  { localId: '010', tokens: ['fire', 'fuego', 'feu', 'fuoco', 'fogo', 'feuer'] },
  { localId: '011', tokens: ['water', 'agua', 'eau', 'acqua', 'wasser'] },
  { localId: '012', tokens: ['lightning', 'electric', 'rayo', 'electrik', 'elektro', 'lampo', 'raios'] },
  { localId: '013', tokens: ['psychic', 'psiquica', 'psico', 'psycho'] },
  { localId: '014', tokens: ['fighting', 'lucha', 'combat', 'lotta', 'kampf'] },
  { localId: '015', tokens: ['darkness', 'dark', 'oscura', 'oscurita', 'obscur', 'escuridao', 'finsternis'] },
  { localId: '016', tokens: ['metal', 'metalica', 'metallo', 'metall'] },
];

function is30thCelebrationExpansion(setId: string | undefined, expansionName: string | undefined): boolean {
  if ((setId ?? '').trim().toLowerCase() === '30th') return true;
  const expansion = fold(expansionName ?? '');
  if (!expansion.includes('30th celebration')) return false;
  if (expansion.includes('classic') || expansion.includes('premium')) return false;
  if (/(^|\s)jp($|\s)/.test(expansion)) return false;
  return true;
}

function isEnergyName(name: string): boolean {
  return (
    name.includes('energy') ||
    name.includes('energie') ||
    name.includes('energia')
  );
}

/**
 * CardTrader no manda collector_number en las energías básicas foil de 30th Celebration.
 * El nombre de la carta alcanza para asignar MEE 009–016.
 */
export function resolve30thCelebrationBasicEnergy(args: {
  setId?: string;
  expansionName?: string;
  cardName?: string;
}): string | null {
  if (!is30thCelebrationExpansion(args.setId, args.expansionName)) return null;
  const name = fold(args.cardName ?? '');
  if (!isEnergyName(name)) return null;

  for (const type of ENERGY_TYPE_TOKENS) {
    if (type.tokens.some((token) => name.includes(token))) {
      return `mee-${type.localId}`;
    }
  }
  return null;
}

export function celebrationEnergyDetail(
  id: string,
  locale: string,
): CardDto | undefined {
  const normalized = id.trim().toLowerCase();
  const def = ENERGIES.find((energy) => cardId(energy.localId) === normalized);
  if (!def) return undefined;

  const spanish = locale.trim().toLowerCase() === 'es' || locale.trim().toLowerCase() === 'es-mx';
  const setName = spanish ? SET_NAME_ES : SET_NAME_EN;
  const image = officialPokemonComCardImageUrl(SET_ID, def.localId) ?? '';

  return {
    id: cardId(def.localId),
    localId: def.localId,
    name: namesFor(def, locale),
    illustrator: 'YOSHIROTTEN',
    rarity: 'Common',
    category: 'Energy',
    energyType: 'Normal',
    legal: { standard: true, expanded: true },
    set: `${SET_ID}(${setName})`,
    setEnglishName: SET_NAME_EN,
    image,
    images: { small: image, large: image },
  };
}
