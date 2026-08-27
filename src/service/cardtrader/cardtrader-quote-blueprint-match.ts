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
  const raw = String(value ?? '').trim().toUpperCase();
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
        !!x && typeof x === 'object' && typeof (x as CtBlueprintLike).id === 'number',
    );
  }
  return [];
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
