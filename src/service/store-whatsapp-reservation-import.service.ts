import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientRepository } from '../repository/client.repository';
import { PvpRepository } from '../repository/pvp.repository';
import { ReservaRepository } from '../repository/reserva.repository';
import { StockRepository } from '../repository/stock.repository';
import { Stock } from '../schema/stock.schema';

type StockRow = Stock & { _id: unknown };
import { precioToCop } from '../utils/precio-to-cop';
import {
  effectiveOperationalRarezaFromStock,
  groupPvpsByCardId,
  resolvePvpForLine,
} from '../utils/pvp-resolve';
import { stockLineLanguage } from '../utils/store-language-labels';
import {
  extractClientNameFromStoreMessage,
  parseStoreCatalogCartLines,
} from '../utils/store-whatsapp-message-parser';

const BLOCKED_STOCK_STATES = new Set(['reserva', 'vendida', 'propiedad']);

export type ImportLineAssignment = {
  stock_id: string;
  precio_cop: number;
};

export type ImportWhatsAppLineResult = {
  index: number;
  raw: string;
  parsed?: {
    card_id: string;
    language: string;
    rareza: string | null;
    quantity: number;
  };
  requested: number;
  matched: number;
  stock_ids: string[];
  precio_cop_por_unidad: number[];
  issues: string[];
};

export type ImportWhatsAppPlan = {
  client_id: string;
  client_name_from_message: string | null;
  lines: ImportWhatsAppLineResult[];
  summary: {
    lines_ok: number;
    lines_partial: number;
    lines_failed: number;
    units_reserved: number;
  };
};

export type ImportWhatsAppCreated = {
  stock_id: string;
  reserva_id: string;
  precio: number;
  currency: string;
};

@Injectable()
export class StoreWhatsAppReservationImportService {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly stockRepository: StockRepository,
    private readonly reservaRepository: ReservaRepository,
    private readonly pvpRepository: PvpRepository,
  ) {}

  async preview(clientId: string, message: string): Promise<ImportWhatsAppPlan> {
    await this.ensureClient(clientId);
    return this.buildPlan(clientId, message);
  }

  async import(
    clientId: string,
    message: string,
  ): Promise<
    ImportWhatsAppPlan & {
      created: ImportWhatsAppCreated[];
      skipped: { line_index: number; reason: string; requested: number; matched: number }[];
    }
  > {
    await this.ensureClient(clientId);
    const plan = await this.buildPlan(clientId, message);
    const created: ImportWhatsAppCreated[] = [];
    const skipped: { line_index: number; reason: string; requested: number; matched: number }[] =
      [];

    for (const line of plan.lines) {
      let lineCreated = 0;
      for (const stockId of line.stock_ids) {
        const precioCop = line.precio_cop_por_unidad[lineCreated] ?? line.precio_cop_por_unidad[0];
        if (precioCop == null || precioCop <= 0) continue;

        const stock = await this.stockRepository.findById(stockId);
        if (!stock || !this.isStockReservable(stock)) {
          continue;
        }
        const existing = await this.reservaRepository.findByStockId(stockId);
        if (existing) continue;

        const reserva = await this.reservaRepository.create({
          client_id: clientId,
          stock_id: stockId,
          precio: precioCop,
          currency: 'COP',
        });
        await this.stockRepository.updateCardState(stockId, 'reserva');
        created.push({
          stock_id: stockId,
          reserva_id: String((reserva as { _id?: unknown })._id ?? ''),
          precio: precioCop,
          currency: 'COP',
        });
        lineCreated += 1;
      }

      if (line.matched > 0 && lineCreated < line.matched) {
        skipped.push({
          line_index: line.index,
          reason: 'race_or_unavailable',
          requested: line.requested,
          matched: lineCreated,
        });
      } else if (line.matched < line.requested) {
        skipped.push({
          line_index: line.index,
          reason: line.issues.includes('no_pvp') ? 'no_pvp' : 'insufficient_stock',
          requested: line.requested,
          matched: line.matched,
        });
      } else if (line.matched === 0 && line.issues.length > 0) {
        skipped.push({
          line_index: line.index,
          reason: line.issues[0],
          requested: line.requested,
          matched: 0,
        });
      }
    }

    return { ...plan, created, skipped };
  }

  private async ensureClient(clientId: string): Promise<void> {
    const id = clientId?.trim();
    if (!id) throw new BadRequestException('client_id es requerido');
    const client = await this.clientRepository.findById(id);
    if (!client) throw new NotFoundException('Cliente no encontrado');
  }

  private async buildPlan(clientId: string, message: string): Promise<ImportWhatsAppPlan> {
    const text = message?.trim();
    if (!text) throw new BadRequestException('message es requerido');

    const parsedLines = parseStoreCatalogCartLines(text);
    if (parsedLines.length === 0) {
      throw new BadRequestException('No se encontraron líneas de carta en el mensaje');
    }

    const [allStock, allReservas] = await Promise.all([
      this.stockRepository.findAll(),
      this.reservaRepository.findAll(),
    ]);
    const reservedStockIds = new Set(allReservas.map((r) => r.stock_id));
    const available = allStock
      .filter(
        (s) =>
          this.isStockReservable(s) &&
          !reservedStockIds.has(this.stockId(s as StockRow)),
      )
      .sort((a, b) =>
        this.stockId(a as StockRow).localeCompare(this.stockId(b as StockRow)),
      ) as StockRow[];

    const cardIds = [
      ...new Set(
        parsedLines
          .filter((l) => l.result.ok)
          .map((l) => (l.result.ok ? l.result.parsed.card_id : '')),
      ),
    ].filter(Boolean);
    const pvps = await this.pvpRepository.findByCardIds(cardIds);
    const pvpByCard = groupPvpsByCardId(pvps);

    const lines: ImportWhatsAppLineResult[] = [];
    let linesOk = 0;
    let linesPartial = 0;
    let linesFailed = 0;
    let unitsReserved = 0;

    const usedStockIds = new Set<string>();

    parsedLines.forEach((entry, index) => {
      if (!entry.result.ok) {
        const issue = entry.result.issue;
        lines.push({
          index,
          raw: entry.raw,
          requested: 0,
          matched: 0,
          stock_ids: [],
          precio_cop_por_unidad: [],
          issues: [issue],
        });
        linesFailed += 1;
        return;
      }

      const { parsed } = entry.result;
      const assignments = this.matchLine(parsed, available, usedStockIds, pvpByCard);
      const issues: string[] = [];
      const matched = assignments.length;
      const requested = parsed.quantity;

      if (matched < requested) {
        if (matched === 0 && this.lineHasNoPvp(parsed, available, pvpByCard)) {
          issues.push('no_pvp');
        } else {
          issues.push('insufficient_stock');
        }
      }

      const stock_ids = assignments.map((a) => a.stock_id);
      const precio_cop_por_unidad = assignments.map((a) => a.precio_cop);
      for (const id of stock_ids) usedStockIds.add(id);

      unitsReserved += matched;

      if (matched === requested && requested > 0) linesOk += 1;
      else if (matched > 0) linesPartial += 1;
      else linesFailed += 1;

      lines.push({
        index,
        raw: entry.raw,
        parsed,
        requested,
        matched,
        stock_ids,
        precio_cop_por_unidad,
        issues,
      });
    });

    return {
      client_id: clientId,
      client_name_from_message: extractClientNameFromStoreMessage(text),
      lines,
      summary: {
        lines_ok: linesOk,
        lines_partial: linesPartial,
        lines_failed: linesFailed,
        units_reserved: unitsReserved,
      },
    };
  }

  private matchLine(
    parsed: { card_id: string; language: string; rareza: string | null; quantity: number },
    available: StockRow[],
    usedStockIds: Set<string>,
    pvpByCard: Map<string, { card_id: string; rareza?: string | null; pvp: number; currency: string }[]>,
  ): ImportLineAssignment[] {
    const candidates = available.filter((s) => {
      const id = this.stockId(s);
      if (usedStockIds.has(id)) return false;
      if (s.card_id !== parsed.card_id) return false;
      if (stockLineLanguage(s) !== parsed.language) return false;
      const lineRareza = effectiveOperationalRarezaFromStock(s);
      return parsed.rareza === lineRareza;
    });

    const pvps = pvpByCard.get(parsed.card_id) ?? [];
    const out: ImportLineAssignment[] = [];

    for (const stock of candidates) {
      if (out.length >= parsed.quantity) break;
      const lineRareza = effectiveOperationalRarezaFromStock(stock);
      const pvpData = resolvePvpForLine(pvps, lineRareza);
      if (!pvpData || pvpData.pvp <= 0) continue;
      const precioCop = precioToCop(pvpData.pvp, pvpData.pvp_currency || 'COP');
      if (precioCop <= 0) continue;
      out.push({ stock_id: this.stockId(stock), precio_cop: precioCop });
    }

    return out;
  }

  private lineHasNoPvp(
    parsed: { card_id: string; language: string; rareza: string | null },
    available: StockRow[],
    pvpByCard: Map<string, { card_id: string; rareza?: string | null; pvp: number; currency: string }[]>,
  ): boolean {
    const candidates = available.filter(
      (s) =>
        s.card_id === parsed.card_id &&
        stockLineLanguage(s) === parsed.language &&
        effectiveOperationalRarezaFromStock(s) === parsed.rareza,
    );
    if (candidates.length === 0) return false;
    const pvps = pvpByCard.get(parsed.card_id) ?? [];
    return candidates.every((stock) => {
      const pvpData = resolvePvpForLine(pvps, effectiveOperationalRarezaFromStock(stock));
      return !pvpData || pvpData.pvp <= 0 || precioToCop(pvpData.pvp, pvpData.pvp_currency || 'COP') <= 0;
    });
  }

  private stockId(stock: StockRow): string {
    return String(stock._id);
  }

  private isStockReservable(stock: Stock): boolean {
    const state = (stock.card_state ?? '').toString().toLowerCase();
    return !BLOCKED_STOCK_STATES.has(state);
  }
}
