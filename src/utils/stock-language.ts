const ALLOWED_STOCK_LANGUAGES = new Set([
  'es',
  'en',
  'fr',
  'de',
  'it',
  'pt',
  'ja',
  'ko',
  'zh',
  'zh-cn',
  'otro',
]);

const LANGUAGE_ALIASES: Record<string, string> = {
  jp: 'ja',
  jpn: 'ja',
  japanese: 'ja',
  japan: 'ja',
  kr: 'ko',
  korean: 'ko',
  chinese: 'zh',
  zh_cn: 'zh-cn',
  'zh-cn': 'zh-cn',
  por: 'pt',
  portuguese: 'pt',
  english: 'en',
  ingles: 'en',
  español: 'es',
  espanol: 'es',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  italian: 'it',
};

/** Normaliza idioma CardTrader / homolog al catálogo de stock (`ja`, `ko`, `zh-cn`, …). */
export function normalizeStockLanguage(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const normalized = String(raw).trim().toLowerCase();
  if (!normalized) return undefined;
  const mapped = LANGUAGE_ALIASES[normalized] ?? normalized;
  if (!ALLOWED_STOCK_LANGUAGES.has(mapped)) return 'otro';
  return mapped;
}
