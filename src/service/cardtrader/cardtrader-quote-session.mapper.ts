import { BadRequestException } from '@nestjs/common';
import type {
  QuoteSessionLine,
  QuoteSessionLineStatus,
  QuoteSessionResolveStatus,
  QuoteSessionSource,
  QuoteSessionBlueprintRef,
} from '../../schema/cardtrader-quote-session.schema';

export type QuoteSessionResolveInput = {
  status?: string;
  blueprint_id?: number | null;
  expansion_id?: number | null;
  expansion_name?: string | null;
  name?: string;
  collector_number?: string;
  image_url?: string | null;
  pokemon_language?: string | null;
  condition?: string | null;
  candidates?: Array<{
    blueprint_id?: number;
    expansion_id?: number;
    expansion_name?: string;
    name?: string;
    collector_number?: string;
    image_url?: string | null;
  }>;
  error?: string | null;
};

export type QuoteSessionLineInput = {
  name?: string;
  expansion?: string;
  collector_number?: string;
  language_label?: string | null;
  condition_label?: string | null;
  resolve?: QuoteSessionResolveInput;
};

export type QuoteSessionCreateInput = {
  source?: string;
  raw_paste?: string;
  lines?: QuoteSessionLineInput[];
};

export type QuoteSessionPickInput = {
  blueprint_id?: number;
  expansion_id?: number;
  expansion_name?: string;
  name?: string;
  collector_number?: string;
  image_url?: string | null;
};

const RESOLVE_STATUSES = new Set<QuoteSessionResolveStatus>([
  'matched',
  'ambiguous',
  'not_found',
]);

function trimStr(value: unknown): string {
  return String(value ?? '').trim();
}

function optionalStr(value: unknown): string | null {
  const t = trimStr(value);
  return t ? t : null;
}

function asInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function asCandidate(raw: {
  blueprint_id?: number;
  expansion_id?: number;
  expansion_name?: string;
  name?: string;
  collector_number?: string;
  image_url?: string | null;
}): QuoteSessionBlueprintRef | null {
  const blueprintId = asInt(raw.blueprint_id);
  const expansionId = asInt(raw.expansion_id);
  if (!blueprintId || !expansionId) return null;
  return {
    blueprint_id: blueprintId,
    expansion_id: expansionId,
    expansion_name: trimStr(raw.expansion_name),
    name: trimStr(raw.name),
    collector_number: trimStr(raw.collector_number),
    image_url: raw.image_url == null ? null : trimStr(raw.image_url) || null,
  };
}

function normalizeResolve(
  raw: QuoteSessionResolveInput | undefined,
  lineIndex: number,
): Record<string, unknown> {
  const status = trimStr(raw?.status) as QuoteSessionResolveStatus;
  if (!RESOLVE_STATUSES.has(status)) {
    throw new BadRequestException(
      `resolve.status inválido en línea ${lineIndex + 1}`,
    );
  }
  const candidates = Array.isArray(raw?.candidates)
    ? raw.candidates.map(asCandidate).filter((c): c is QuoteSessionBlueprintRef => !!c)
    : [];
  return {
    status,
    blueprint_id: asInt(raw?.blueprint_id),
    expansion_id: asInt(raw?.expansion_id),
    expansion_name: optionalStr(raw?.expansion_name),
    name: trimStr(raw?.name),
    collector_number: trimStr(raw?.collector_number),
    image_url: raw?.image_url == null ? null : trimStr(raw.image_url) || null,
    pokemon_language: optionalStr(raw?.pokemon_language),
    condition: optionalStr(raw?.condition),
    candidates,
    error: optionalStr(raw?.error),
  };
}

function selectedFromMatchedResolve(
  resolve: Record<string, unknown>,
): QuoteSessionBlueprintRef | null {
  if (resolve.status !== 'matched') return null;
  const blueprintId = asInt(resolve.blueprint_id);
  const expansionId = asInt(resolve.expansion_id);
  if (!blueprintId || !expansionId) return null;
  return {
    blueprint_id: blueprintId,
    expansion_id: expansionId,
    expansion_name: trimStr(resolve.expansion_name),
    name: trimStr(resolve.name),
    collector_number: trimStr(resolve.collector_number),
    image_url:
      resolve.image_url == null ? null : trimStr(resolve.image_url) || null,
  };
}

export function parseQuoteSessionSource(raw: unknown): QuoteSessionSource {
  const source = trimStr(raw);
  if (source === 'whatsapp' || source === 'urls') return source;
  throw new BadRequestException('source debe ser whatsapp o urls');
}

export function buildQuoteSessionLines(
  lines: QuoteSessionLineInput[] | undefined,
): QuoteSessionLine[] {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 100) {
    throw new BadRequestException('lines debe tener entre 1 y 100 elementos');
  }
  return lines.map((line, index) => {
    const name = trimStr(line?.name);
    const expansion = trimStr(line?.expansion);
    const collector = trimStr(line?.collector_number);
    if (!name || !expansion || !collector) {
      throw new BadRequestException(
        `name, expansion y collector_number obligatorios en línea ${index + 1}`,
      );
    }
    const resolve = normalizeResolve(line.resolve, index);
    const selected = selectedFromMatchedResolve(resolve);
    const lineStatus: QuoteSessionLineStatus = selected ? 'picked' : 'pending';
    return {
      index,
      name,
      expansion,
      collector_number: collector,
      language_label: optionalStr(line.language_label),
      condition_label: optionalStr(line.condition_label),
      resolve,
      selected_blueprint: selected,
      line_status: lineStatus,
    };
  });
}

export function parseRawPaste(raw: unknown): string {
  const paste = String(raw ?? '');
  if (paste.length < 1 || paste.length > 20_000) {
    throw new BadRequestException('raw_paste debe tener entre 1 y 20000 caracteres');
  }
  return paste;
}

export function parsePickBlueprint(body: QuoteSessionPickInput): QuoteSessionBlueprintRef {
  const hit = asCandidate(body);
  if (!hit) {
    throw new BadRequestException('blueprint_id y expansion_id son obligatorios');
  }
  return hit;
}

export function toSessionListItem(doc: {
  _id: unknown;
  status: string;
  source: string;
  active_index: number;
  lines?: unknown[];
  createdAt?: Date;
  created_at?: Date;
}): Record<string, unknown> {
  return {
    id: String(doc._id),
    status: doc.status,
    source: doc.source,
    active_index: doc.active_index,
    line_count: Array.isArray(doc.lines) ? doc.lines.length : 0,
    created_at: doc.createdAt ?? doc.created_at ?? null,
  };
}

export function toSessionDetail(doc: {
  _id: unknown;
  status: string;
  source: string;
  raw_paste: string;
  active_index: number;
  lines: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}): Record<string, unknown> {
  return {
    id: String(doc._id),
    status: doc.status,
    source: doc.source,
    raw_paste: doc.raw_paste,
    active_index: doc.active_index,
    lines: doc.lines,
    created_at: doc.createdAt ?? null,
    updated_at: doc.updatedAt ?? null,
  };
}
