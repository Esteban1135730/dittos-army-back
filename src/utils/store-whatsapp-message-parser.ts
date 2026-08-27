import { languageCodeFromStoreLabel } from './store-language-labels';
import { operationalRarezaFromStoreVariantTag } from './store-variant-display';

export type ParsedStoreCartLine = {
  card_id: string;
  language: string;
  rareza: string | null;
  quantity: number;
  /** PVP unitario en COP si el mensaje de catálogo trae Precio. */
  unit_price_cop: number | null;
};

export type ParseLineResult =
  | { ok: true; parsed: ParsedStoreCartLine }
  | { ok: false; issue: 'missing_card_id' | 'invalid_line' };

export function extractClientNameFromStoreMessage(
  message: string,
): string | null {
  const m = message.match(/A nombre de:\s*(.+?)(?:\r?\n|$)/i);
  if (!m) return null;
  return m[1].trim() || null;
}

/** COP de la tienda: `$ 15.000` o `15.000` (punto de miles). */
export function parseCopAmountFromStoreText(chunk: string): number | null {
  const normalized = chunk.replace(/\u00a0/g, ' ');
  const numMatch = normalized.match(/(\d{1,3}(?:\.\d{3})+|\d+)/);
  if (!numMatch) return null;
  const n = parseInt(numMatch[1].replace(/\./g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseUnitPriceCopFromLine(line: string): number | null {
  const m = line.match(/Precio:\s*([^|—]+)/i);
  if (!m) return null;
  return parseCopAmountFromStoreText(m[1]);
}

export function parseStoreCatalogCartLines(
  message: string,
): { raw: string; result: ParseLineResult }[] {
  const lines = message.split(/\r?\n/);
  const out: { raw: string; result: ParseLineResult }[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('- ')) continue;
    out.push({ raw: trimmed, result: parseStoreCatalogLine(trimmed) });
  }
  return out;
}

export function parseStoreCatalogLine(line: string): ParseLineResult {
  const trimmed = line.trim();
  if (!trimmed.startsWith('- ')) {
    return { ok: false, issue: 'invalid_line' };
  }

  const idMatch = trimmed.match(/ID:\s*([^\s|]+)/i);
  if (!idMatch) {
    return { ok: false, issue: 'missing_card_id' };
  }

  const langMatch = trimmed.match(/Idioma:\s*(.+?)(?:\s*\||\s*—|\s+x\d+)/i);
  if (!langMatch) {
    return { ok: false, issue: 'invalid_line' };
  }
  const language = languageCodeFromStoreLabel(langMatch[1].trim());
  if (!language) {
    return { ok: false, issue: 'invalid_line' };
  }

  const qtyMatch = trimmed.match(/\sx(\d+)(?:\s*\([^)]+\))?\s*$/i);
  const quantity = qtyMatch ? Math.max(1, parseInt(qtyMatch[1], 10) || 1) : 1;

  let rareza: string | null = null;
  const variantMatch = trimmed.match(/\s—\s*(.+?)\s+x\d+\s*$/i);
  if (variantMatch) {
    rareza = operationalRarezaFromStoreVariantTag(variantMatch[1].trim());
  }

  return {
    ok: true,
    parsed: {
      card_id: idMatch[1].trim(),
      language,
      rareza,
      quantity,
      unit_price_cop: parseUnitPriceCopFromLine(trimmed),
    },
  };
}
