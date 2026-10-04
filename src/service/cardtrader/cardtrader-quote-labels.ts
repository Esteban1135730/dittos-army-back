/** Mapeo de etiquetas del mensaje de cotización de la tienda → propiedades CardTrader. */

const LANGUAGE_LABEL_TO_CT: Record<string, string | null> = {
  ingles: 'en',
  english: 'en',
  espanol: 'es',
  spanish: 'es',
  frances: 'fr',
  french: 'fr',
  aleman: 'de',
  german: 'de',
  italiano: 'it',
  italian: 'it',
  portugues: 'pt',
  portuguese: 'pt',
  japones: 'jp',
  japanese: 'jp',
  coreano: 'ko',
  korean: 'ko',
  chino: 'zh',
  chinese: 'zh',
  'no importa el idioma': null,
  'no importa': null,
  otro: null,
};

export function foldQuoteLabel(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function mapQuoteLanguageLabel(
  label: string | null | undefined,
): string | null {
  const key = foldQuoteLabel(label);
  if (!key) return null;
  if (key in LANGUAGE_LABEL_TO_CT) return LANGUAGE_LABEL_TO_CT[key];
  if (key.includes('no importa')) return null;
  const languages = new Set<string>();
  for (const word of key.split(/[^a-z]+/)) {
    const lang = LANGUAGE_LABEL_TO_CT[word];
    if (lang) languages.add(lang);
  }
  return languages.size === 1 ? [...languages][0] : null;
}

export function mapQuoteConditionLabel(
  label: string | null | undefined,
): string | null {
  const key = foldQuoteLabel(label);
  if (key.split(/[^a-z]+/).includes('perfecto')) return 'Near Mint';
  return null;
}
