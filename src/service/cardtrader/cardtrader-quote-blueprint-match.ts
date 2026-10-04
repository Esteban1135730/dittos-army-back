import {
  readBlueprintImageUrl,
  readCollectorNumberFromBlueprint,
  type CtBlueprintLike,
} from '../../utils/novedad-card-resolve';

export type QuoteBlueprintCandidate = {
  blueprint_id: number;
  expansion_id: number;
  expansion_name: string;
  name: string;
  collector_number: string;
  image_url: string | null;
};

export function foldCardName(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeCollectorNumber(
  value: string | null | undefined,
): string {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s*\/\s*[A-Z0-9]+$/, '');
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return String(Number(raw));
  const mixed = raw.match(/^([A-Z]+)0*(\d+)$/);
  if (mixed) return `${mixed[1]}${Number(mixed[2])}`;
  return raw;
}

function blueprintName(bp: CtBlueprintLike): string {
  return String(bp.name_en ?? bp.name ?? '').trim();
}

export function normalizeBlueprintsExport(data: unknown): CtBlueprintLike[] {
  if (Array.isArray(data)) {
    return data.filter(
      (x): x is CtBlueprintLike =>
        !!x &&
        typeof x === 'object' &&
        typeof (x as CtBlueprintLike).id === 'number',
    );
  }
  return [];
}

function nameTokens(value: string | null | undefined): string[] {
  return foldCardName(value)
    .replace(/[’`´]/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .map((t) => t.replace(/'/g, ''))
    .filter(Boolean);
}

export type QuoteExpansionBlueprints = {
  expansionId: number;
  expansionName: string;
  blueprints: CtBlueprintLike[];
};

/**
 * Busca en varias expansiones: 1) nombre del Pokémon exacto (o por palabras
 * completas: `Pikachu` → `Pikachu ex`, nunca `Paras` → `Parasect`);
 * 2) si queda más de una, desempata por número; 3) sin nombre, solo número.
 * `unique` indica que el resultado es fiable para resolver sin preguntar.
 */
export function matchBlueprintsByNameThenNumber(args: {
  expansions: QuoteExpansionBlueprints[];
  cardName: string;
  collectorNumber: string;
}): { candidates: QuoteBlueprintCandidate[]; unique: boolean } {
  const wantTokens = nameTokens(args.cardName);
  const wantKey = wantTokens.join(' ');
  const wantNumber = normalizeCollectorNumber(args.collectorNumber);

  const all: Array<{
    candidate: QuoteBlueprintCandidate;
    key: string;
    tokens: string[];
  }> = [];
  const seen = new Set<number>();
  for (const exp of args.expansions) {
    for (const bp of exp.blueprints) {
      if (typeof bp.id !== 'number' || seen.has(bp.id)) continue;
      const name = blueprintName(bp);
      if (!name) continue;
      seen.add(bp.id);
      const tokens = nameTokens(name);
      all.push({
        candidate: {
          blueprint_id: bp.id,
          expansion_id: exp.expansionId,
          expansion_name: exp.expansionName,
          name,
          collector_number: readCollectorNumberFromBlueprint(bp) ?? '',
          image_url: readBlueprintImageUrl(bp) || null,
        },
        key: tokens.join(' '),
        tokens,
      });
    }
  }

  const strip = (list: typeof all): QuoteBlueprintCandidate[] =>
    list.map((row) => row.candidate);
  const byNumber = (list: typeof all) =>
    wantNumber
      ? list.filter(
          (row) =>
            normalizeCollectorNumber(row.candidate.collector_number) ===
            wantNumber,
        )
      : [];

  let named = wantKey ? all.filter((c) => c.key === wantKey) : [];
  if (named.length === 0 && wantTokens.length > 0) {
    named = all.filter((c) => wantTokens.every((t) => c.tokens.includes(t)));
  }

  if (named.length === 1) return { candidates: strip(named), unique: true };
  if (named.length > 1) {
    const numbered = byNumber(named);
    if (numbered.length === 1) {
      return { candidates: strip(numbered), unique: true };
    }
    return {
      candidates: strip(numbered.length > 1 ? numbered : named),
      unique: false,
    };
  }

  return { candidates: strip(byNumber(all)), unique: false };
}

export function matchBlueprintsForQuoteLine(args: {
  blueprints: CtBlueprintLike[];
  expansionId: number;
  expansionName: string;
  collectorNumber: string;
  cardName: string;
}): QuoteBlueprintCandidate[] {
  const wantNumber = normalizeCollectorNumber(args.collectorNumber);
  if (!wantNumber) return [];
  const wantName = foldCardName(args.cardName);

  const numbered: QuoteBlueprintCandidate[] = [];
  for (const bp of args.blueprints) {
    const id = bp.id;
    if (typeof id !== 'number') continue;
    const collector = readCollectorNumberFromBlueprint(bp);
    if (!collector) continue;
    if (normalizeCollectorNumber(collector) !== wantNumber) continue;
    const name = blueprintName(bp);
    numbered.push({
      blueprint_id: id,
      expansion_id: args.expansionId,
      expansion_name: args.expansionName,
      name: name || args.cardName,
      collector_number: collector,
      image_url: readBlueprintImageUrl(bp) || null,
    });
  }

  if (numbered.length <= 1) return numbered;
  if (!wantName) return numbered;

  const exactName = numbered.filter((c) => foldCardName(c.name) === wantName);
  if (exactName.length > 0) return exactName;

  const partial = numbered.filter((c) => {
    const n = foldCardName(c.name);
    return n.includes(wantName) || wantName.includes(n);
  });
  return partial.length > 0 ? partial : numbered;
}
