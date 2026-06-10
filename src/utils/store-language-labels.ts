/** Etiquetas de idioma (tienda) → código guardado en stock (alineado a dittos-army-store). */
const LABEL_TO_CODE: Record<string, string> = {
  'no importa el idioma': 'no-importa',
  inglés: 'en',
  ingles: 'en',
  español: 'es',
  espanol: 'es',
  francés: 'fr',
  frances: 'fr',
  alemán: 'de',
  aleman: 'de',
  italiano: 'it',
  portugués: 'pt',
  portugues: 'pt',
  japonés: 'ja',
  japones: 'ja',
  coreano: 'ko',
  chino: 'zh',
  otro: 'otro',
};

export function languageCodeFromStoreLabel(label: string): string | null {
  const key = label.trim().toLowerCase();
  if (!key) return null;
  if (LABEL_TO_CODE[key]) return LABEL_TO_CODE[key];
  if (/^[a-z]{2}(-[a-z]+)?$/.test(key)) return key;
  return null;
}

export function stockLineLanguage(stock: {
  language?: string;
  languaje?: string;
}): string {
  const raw = (stock.language || stock.languaje || 'en')
    .toString()
    .trim()
    .toLowerCase();
  return raw || 'en';
}
