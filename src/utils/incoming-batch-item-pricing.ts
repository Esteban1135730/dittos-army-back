export function unitCostCopFromLegacyItemRuleOfThree(
  ctFxUnit: number,
  legacyItem: { unit_cost_cop?: number | null; eur_unit_price?: number | null },
  lotFxRateFallback: number,
): number {
  const legacyCop = Number(legacyItem.unit_cost_cop || 0);
  const legacyFx = Number(legacyItem.eur_unit_price || 0);
  if (legacyCop > 0 && legacyFx > 0 && ctFxUnit > 0) {
    return ctFxUnit * (legacyCop / legacyFx);
  }
  return ctFxUnit * lotFxRateFallback;
}

function normalizeCardNameForMatch(name: string): string {
  return name
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[''`´]/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findLegacyItemByCardName<
  T extends {
    card_name?: string | null;
    unit_cost_cop?: number;
    eur_unit_price?: number;
  },
>(cardName: string, items: T[]): T | undefined {
  const target = normalizeCardNameForMatch(cardName);
  if (!target) return undefined;

  for (const item of items) {
    const candidate = normalizeCardNameForMatch(item.card_name ?? '');
    if (!candidate) continue;
    if (candidate === target) return item;
    if (candidate.startsWith(target) || target.startsWith(candidate))
      return item;
  }
  return undefined;
}
