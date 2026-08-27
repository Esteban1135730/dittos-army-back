import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientRepository } from '../repository/client.repository';
import { PvpRepository } from '../repository/pvp.repository';
import { IncomingReservationService } from './incoming-reservation.service';
import { precioToCop } from '../utils/precio-to-cop';
import {
  groupPvpsByCardId,
  resolvePvpForLine,
} from '../utils/pvp-resolve';
import { normalizeOperationalRareza } from '../constants/item-rareza';
import {
  extractClientNameFromStoreMessage,
  parseStoreCatalogCartLines,
} from '../utils/store-whatsapp-message-parser';

export type IncomingWhatsAppVariant = {
  rareza: string | null;
  cupo: number;
  card_name: string;
  image_url: string;
};

export type IncomingWhatsAppLineResult = {
  index: number;
  raw: string;
  parsed?: {
    card_id: string;
    language: string;
    rareza: string | null;
    quantity: number;
    card_name: string | null;
    unit_price_cop: number | null;
  };
  requested: number;
  matched: number;
  resolved_rareza: string | null;
  available_variants: IncomingWhatsAppVariant[];
  suggested_pvp_cop: number | null;
  card_name?: string;
  image_url?: string;
  issues: string[];
};

export type IncomingWhatsAppPlan = {
  client_id: string;
  client_name_from_message: string | null;
  lines: IncomingWhatsAppLineResult[];
  summary: {
    lines_ok: number;
    lines_partial: number;
    lines_failed: number;
    units_reserved: number;
  };
};

export type IncomingWhatsAppLineOverride = {
  index: number;
  rareza?: string | null;
  pvp_cop?: number | null;
};

function cardNameFromRaw(raw: string): string | null {
  const m = raw.match(/^-\s*(.+?)\s*\|\s*ID:/i);
  return m ? m[1].trim() : null;
}

@Injectable()
export class StoreWhatsAppIncomingImportService {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly pvpRepository: PvpRepository,
    private readonly incomingReservationService: IncomingReservationService,
  ) {}

  async preview(
    clientId: string,
    message: string,
  ): Promise<IncomingWhatsAppPlan> {
    await this.ensureClient(clientId);
    return this.buildPlan(clientId, message);
  }

  async import(
    clientId: string,
    message: string,
    overrides: IncomingWhatsAppLineOverride[] = [],
  ): Promise<
    IncomingWhatsAppPlan & {
      created: { card_id: string; quantity: number; rareza: string | null }[];
      skipped: {
        line_index: number;
        reason: string;
        requested: number;
        matched: number;
      }[];
      pvp_saved: number;
    }
  > {
    await this.ensureClient(clientId);
    const overrideMap = new Map(overrides.map((o) => [o.index, o]));
    const plan = await this.buildPlan(clientId, message, overrideMap);
    const created: { card_id: string; quantity: number; rareza: string | null }[] =
      [];
    const skipped: {
      line_index: number;
      reason: string;
      requested: number;
      matched: number;
    }[] = [];
    let pvpSaved = 0;

    for (const line of plan.lines) {
      if (!line.parsed || line.matched <= 0 || line.issues.includes('ambiguous_rareza')) {
        if (line.requested > 0) {
          skipped.push({
            line_index: line.index,
            reason: line.issues[0] ?? 'not_matched',
            requested: line.requested,
            matched: line.matched,
          });
        }
        continue;
      }
      const overridePvp = overrideMap.get(line.index)?.pvp_cop;
      const pvpCop =
        typeof overridePvp === 'number' && overridePvp > 0
          ? overridePvp
          : line.parsed.unit_price_cop;
      try {
        await this.incomingReservationService.addQuantityByCardVariant(
          clientId,
          line.parsed.card_id,
          line.parsed.language,
          line.resolved_rareza,
          line.matched,
          typeof pvpCop === 'number' && pvpCop > 0 ? Math.round(pvpCop) : undefined,
        );
        created.push({
          card_id: line.parsed.card_id,
          quantity: line.matched,
          rareza: line.resolved_rareza,
        });
      } catch (err) {
        const reason =
          err instanceof ConflictException
            ? 'race_or_unavailable'
            : 'import_failed';
        skipped.push({
          line_index: line.index,
          reason,
          requested: line.requested,
          matched: line.matched,
        });
        continue;
      }

      if (typeof pvpCop === 'number' && Number.isFinite(pvpCop) && pvpCop > 0) {
        await this.pvpRepository.update({
          card_id: line.parsed.card_id,
          pvp: Math.round(pvpCop),
          currency: 'COP',
          rareza: line.resolved_rareza,
        });
        pvpSaved += 1;
      }
    }

    return { ...plan, created, skipped, pvp_saved: pvpSaved };
  }

  private async ensureClient(clientId: string): Promise<void> {
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }
  }

  private async buildPlan(
    clientId: string,
    message: string,
    overrides?: Map<number, IncomingWhatsAppLineOverride>,
  ): Promise<IncomingWhatsAppPlan> {
    const text = message?.trim() ?? '';
    if (!text) {
      throw new BadRequestException('message es requerido');
    }
    const parsedLines = parseStoreCatalogCartLines(text);
    const cardIds = parsedLines
      .map((row) => (row.result.ok ? row.result.parsed.card_id : null))
      .filter((id): id is string => !!id);
    const pvps = await this.pvpRepository.findByCardIds([...new Set(cardIds)]);
    const pvpMap = groupPvpsByCardId(pvps as any);

    const lines: IncomingWhatsAppLineResult[] = [];
    for (let index = 0; index < parsedLines.length; index++) {
      const { raw, result } = parsedLines[index];
      if (!result.ok) {
        lines.push({
          index,
          raw,
          requested: 0,
          matched: 0,
          resolved_rareza: null,
          available_variants: [],
          suggested_pvp_cop: null,
          issues: [result.issue],
        });
        continue;
      }

      const parsed = result.parsed;
      const variants = await this.incomingReservationService.listVariantCupos(
        parsed.card_id,
        parsed.language,
      );
      const override = overrides?.get(index);
      const overrideRareza =
        override && 'rareza' in override
          ? normalizeOperationalRareza(override.rareza)
          : undefined;
      const { resolved, issues } = this.resolveVariant(
        variants,
        parsed.rareza,
        overrideRareza,
      );
      const cupo = resolved?.cupo ?? 0;
      const matched = Math.min(parsed.quantity, cupo);
      if (parsed.quantity > 0 && cupo <= 0 && !issues.includes('ambiguous_rareza')) {
        issues.push('insufficient_incoming');
      } else if (matched < parsed.quantity && matched > 0) {
        issues.push('insufficient_incoming');
      }

      const rarezaForPvp = resolved?.rareza ?? parsed.rareza;
      const resolvedPvp = resolvePvpForLine(
        pvpMap.get(parsed.card_id) ?? [],
        rarezaForPvp,
      );
      const fromTable =
        resolvedPvp != null
          ? precioToCop(resolvedPvp.pvp, resolvedPvp.pvp_currency)
          : null;
      const fromMessage =
        parsed.unit_price_cop != null && parsed.unit_price_cop > 0
          ? parsed.unit_price_cop
          : null;
      const suggested = fromMessage ?? (fromTable != null && fromTable > 0 ? fromTable : null);
      if (suggested == null || suggested <= 0) {
        issues.push('no_pvp');
      }

      lines.push({
        index,
        raw,
        parsed: {
          ...parsed,
          card_name: cardNameFromRaw(raw),
        },
        requested: parsed.quantity,
        matched: issues.includes('ambiguous_rareza') ? 0 : matched,
        resolved_rareza: resolved?.rareza ?? null,
        available_variants: variants.map((v) => ({
          rareza: v.rareza,
          cupo: v.cupo,
          card_name: v.card_name,
          image_url: v.image_url,
        })),
        suggested_pvp_cop: suggested != null && suggested > 0 ? suggested : null,
        card_name: resolved?.card_name ?? cardNameFromRaw(raw) ?? parsed.card_id,
        image_url: resolved?.image_url,
        issues,
      });
    }

    const summary = {
      lines_ok: lines.filter(
        (l) =>
          l.matched === l.requested &&
          l.requested > 0 &&
          !l.issues.some((i) => i !== 'no_pvp'),
      ).length,
      lines_partial: lines.filter(
        (l) => l.matched > 0 && l.matched < l.requested,
      ).length,
      lines_failed: lines.filter((l) => l.requested > 0 && l.matched <= 0).length,
      units_reserved: lines.reduce((s, l) => s + l.matched, 0),
    };

    return {
      client_id: clientId,
      client_name_from_message: extractClientNameFromStoreMessage(text),
      lines,
      summary,
    };
  }

  private resolveVariant(
    variants: Array<{
      rareza: string | null;
      cupo: number;
      card_name: string;
      image_url: string;
      language: string;
    }>,
    parsedRareza: string | null,
    overrideRareza: string | null | undefined,
  ): {
    resolved:
      | {
          rareza: string | null;
          cupo: number;
          card_name: string;
          image_url: string;
          language: string;
        }
      | undefined;
    issues: string[];
  } {
    const issues: string[] = [];
    const target =
      overrideRareza !== undefined
        ? overrideRareza
        : normalizeOperationalRareza(parsedRareza);

    if (target != null) {
      const found = variants.find((v) => v.rareza === target);
      if (!found) {
        issues.push('insufficient_incoming');
        return { resolved: undefined, issues };
      }
      return { resolved: found, issues };
    }

    if (overrideRareza === null) {
      const found = variants.find((v) => v.rareza == null);
      if (!found && variants.length === 1) return { resolved: variants[0], issues };
      if (!found) {
        issues.push(variants.length > 1 ? 'ambiguous_rareza' : 'insufficient_incoming');
        return { resolved: undefined, issues };
      }
      return { resolved: found, issues };
    }

    if (variants.length === 1) return { resolved: variants[0], issues };
    if (variants.length === 0) {
      issues.push('insufficient_incoming');
      return { resolved: undefined, issues };
    }
    issues.push('ambiguous_rareza');
    return { resolved: undefined, issues };
  }
}
