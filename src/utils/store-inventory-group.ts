import { effectiveOperationalRarezaFromStock } from './pvp-resolve';
import { latestStockedAtIso } from './store-line-stocked-at';

export function normalizeExportLanguage(raw: unknown): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return 'en';
  }
  const s = String(raw).trim().toLowerCase();
  return s || 'en';
}

export function inventoryLineKey(
  cardId: string,
  lang: string,
  rareza: string | undefined | null,
): string {
  const v =
    rareza == null || String(rareza).trim() === ''
      ? ''
      : String(rareza).trim().toLowerCase();
  return `${cardId}::${lang}::${v}`;
}

export type StoreLineGroupInput = {
  card_id: string;
  language?: string;
  languaje?: string;
  rareza?: string | null;
  league_card?: boolean;
  holofoil?: boolean;
  stocked_at?: Date | string | null;
  _id?: unknown;
};

export type StoreLineGroup = {
  lineId: string;
  card_id: string;
  language: string;
  rareza: string | null;
  quantity: number;
  stocked_at: string | null;
};

/**
 * Agrupa unidades de stock por lineId (carta + idioma + variante).
 * `stocked_at` = ISO de la recepción más reciente del grupo.
 */
export function groupStockUnitsByLine(
  units: StoreLineGroupInput[],
): StoreLineGroup[] {
  const buckets = new Map<string, StoreLineGroupInput[]>();
  for (const unit of units) {
    const lang = normalizeExportLanguage(
      unit.language || unit.languaje || 'en',
    );
    const rzEff = effectiveOperationalRarezaFromStock(unit);
    const lineId = inventoryLineKey(unit.card_id, lang, rzEff);
    const list = buckets.get(lineId);
    if (list) list.push(unit);
    else buckets.set(lineId, [unit]);
  }
  const out: StoreLineGroup[] = [];
  for (const [lineId, list] of buckets) {
    const first = list[0];
    const lang = normalizeExportLanguage(
      first.language || first.languaje || 'en',
    );
    out.push({
      lineId,
      card_id: first.card_id,
      language: lang,
      rareza: effectiveOperationalRarezaFromStock(first),
      quantity: list.length,
      stocked_at: latestStockedAtIso(list),
    });
  }
  return out;
}
