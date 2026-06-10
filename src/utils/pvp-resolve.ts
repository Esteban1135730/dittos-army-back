import { normalizeOperationalRareza } from '../constants/item-rareza';

export type PvpLike = {
  card_id: string;
  rareza?: string | null;
  pvp: number;
  currency: string;
};

/** Rareza solo desde el campo `rareza` (alias y minúsculas). */
export function stockLineRareza(
  rareza: string | undefined | null,
): string | null {
  return normalizeOperationalRareza(rareza);
}

export type StockRarezaFields = {
  rareza?: string | null;
  league_card?: boolean;
  holofoil?: boolean;
};

/**
 * Rareza operativa para PVP / agregaciones: campo `rareza` o, si vacío, flags legacy.
 */
export function effectiveOperationalRarezaFromStock(
  s: StockRarezaFields,
): string | null {
  const fromField = stockLineRareza(s.rareza);
  if (fromField != null) return fromField;
  if (s.league_card) return 'league card';
  if (s.holofoil) return 'holofoil';
  return null;
}

function isBasePvp(p: PvpLike): boolean {
  return stockLineRareza(p.rareza) === null;
}

/**
 * PVP efectivo para una línea: variante si existe doc para esa rareza; si no, base.
 */
export function resolvePvpForLine(
  pvpsForCard: PvpLike[],
  rarezaLine: string | null,
): { pvp: number; pvp_currency: string } | undefined {
  const base = pvpsForCard.find((p) => isBasePvp(p));
  if (rarezaLine != null) {
    const specific = pvpsForCard.find(
      (p) => stockLineRareza(p.rareza) === rarezaLine,
    );
    if (specific) return { pvp: specific.pvp, pvp_currency: specific.currency };
  }
  if (base) return { pvp: base.pvp, pvp_currency: base.currency };
  return undefined;
}

export function groupPvpsByCardId(pvps: PvpLike[]): Map<string, PvpLike[]> {
  const m = new Map<string, PvpLike[]>();
  for (const p of pvps) {
    const id = p.card_id;
    const arr = m.get(id) ?? [];
    arr.push(p);
    m.set(id, arr);
  }
  return m;
}
