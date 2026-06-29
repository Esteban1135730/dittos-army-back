export type CtBlueprintLike = {
  expansion_id?: number;
  expansion?: { id?: number; name_en?: string; name?: string };
  version?: string;
  image?: { url?: string; show?: { url?: string } };
  image_url?: string | null;
  name?: string;
  name_en?: string;
  fixed_properties?: {
    collector_number?: string;
    number?: string;
  };
};

export function isTemporaryNovedadCardId(cardId: string | null | undefined): boolean {
  const id = String(cardId ?? '').trim();
  return id.startsWith('ct-bp-') || id.startsWith('novedad-');
}

export function blueprintIdFromTemporaryCardId(
  cardId: string | null | undefined,
): number | null {
  const id = String(cardId ?? '').trim();
  const match = /^ct-bp-(\d+)$/.exec(id);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function readCollectorNumberFromBlueprint(
  blueprint: CtBlueprintLike | null | undefined,
): string | null {
  const raw =
    blueprint?.fixed_properties?.collector_number ??
    blueprint?.fixed_properties?.number;
  if (raw != null) {
    const s = String(raw).trim();
    if (s) return s;
  }
  return readCollectorNumberFromVersion(blueprint?.version);
}

export function readCollectorNumberFromVersion(
  version: string | null | undefined,
): string | null {
  const s = String(version ?? '').trim();
  if (!s) return null;
  const matches = [...s.matchAll(/(\d+)\s*\/\s*\d+/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1][1];
  return last || null;
}

export function readExpansionIdFromBlueprint(
  blueprint: CtBlueprintLike | null | undefined,
): number | undefined {
  const direct = blueprint?.expansion_id;
  if (typeof direct === 'number' && direct > 0) return direct;
  const nested = blueprint?.expansion?.id;
  if (typeof nested === 'number' && nested > 0) return nested;
  return undefined;
}

export function readExpansionNameFromBlueprint(
  blueprint: CtBlueprintLike | null | undefined,
): string {
  const name = blueprint?.expansion?.name_en ?? blueprint?.expansion?.name;
  return typeof name === 'string' ? name.trim() : '';
}

export function readBlueprintImageUrl(
  blueprint: CtBlueprintLike | null | undefined,
): string {
  if (!blueprint) return '';
  const img = blueprint.image;
  if (img && typeof img === 'object') {
    const show = img.show?.url ?? img.url;
    if (typeof show === 'string' && show.trim()) {
      return absolutizeCardTraderUrl(show.trim());
    }
  }
  let url = blueprint.image_url;
  if (typeof url !== 'string' || !url.trim()) return '';
  url = url.trim();
  if (url.includes('/preview_')) {
    url = url.replace('/preview_', '/show_');
  }
  return absolutizeCardTraderUrl(url);
}

function absolutizeCardTraderUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `https://www.cardtrader.com${url.startsWith('/') ? '' : '/'}${url}`;
}

export function buildNovedadTcgdexResolveInput(args: {
  expansionName?: string;
  collectorNumber?: string | null;
  expansionId?: number;
  blueprint?: CtBlueprintLike | null;
}): {
  expansionName?: string;
  expansionId?: number;
  collectorNumber?: string;
} {
  const blueprint = args.blueprint;
  const collectorNumber =
    (args.collectorNumber != null && String(args.collectorNumber).trim()
      ? String(args.collectorNumber).trim()
      : null) ?? readCollectorNumberFromBlueprint(blueprint);

  const expansionId =
    args.expansionId && args.expansionId > 0
      ? args.expansionId
      : readExpansionIdFromBlueprint(blueprint);

  const expansionName =
    (args.expansionName?.trim() || '') ||
    readExpansionNameFromBlueprint(blueprint) ||
    undefined;

  return {
    expansionName,
    expansionId,
    collectorNumber: collectorNumber ?? undefined,
  };
}
