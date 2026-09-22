export type StoreExportPvp = {
  pvp: number;
  currency: string;
};

function hasPositivePvp(
  value: StoreExportPvp | null | undefined,
): value is StoreExportPvp {
  return value != null && Number(value.pvp) > 0;
}

/** PVP de Pablo si es > 0; si no, el de Esteban si es > 0. */
export function pickStoreExportPvp(
  pablo: StoreExportPvp | null | undefined,
  esteban: StoreExportPvp | null | undefined,
): StoreExportPvp | undefined {
  if (hasPositivePvp(pablo)) return pablo;
  if (hasPositivePvp(esteban)) return esteban;
  return undefined;
}

export function mergeSoldUnitCounts(
  a: Map<string, number> | null | undefined,
  b: Map<string, number> | null | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const src of [a, b]) {
    if (!src) continue;
    for (const [cardId, count] of src) {
      const n = Number(count);
      if (!Number.isFinite(n) || n === 0) continue;
      out.set(cardId, (out.get(cardId) ?? 0) + n);
    }
  }
  return out;
}

export function mergePublicTagMaps(
  a: Map<string, string[]> | null | undefined,
  b: Map<string, string[]> | null | undefined,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const src of [a, b]) {
    if (!src) continue;
    for (const [cardId, tags] of src) {
      const prev = out.get(cardId) ?? [];
      out.set(cardId, [...prev, ...(tags ?? [])]);
    }
  }
  return out;
}
