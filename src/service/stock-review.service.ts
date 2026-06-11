import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import {
  STOCK_TAG_VALUES,
  type StockTag,
} from '../constants/stock-tags';
import { CardStockTagRepository } from '../repository/card-stock-tag.repository';
import { PvpRepository } from '../repository/pvp.repository';
import { SaleRepository } from '../repository/sale.repository';
import { StockRepository } from '../repository/stock.repository';
import { StockReviewSessionRepository } from '../repository/stock-review-session.repository';
import {
  StockReviewOutcome,
  StockReviewSessionDocument,
  StockReviewSessionItem,
} from '../schema/stock-review-session.schema';
import {
  effectiveOperationalRarezaFromStock,
  resolvePvpForLine,
} from '../utils/pvp-resolve';

function pvpToCop(pvp: number, currency: string): number {
  if (currency === 'COP') return Math.round(pvp);
  if (currency === 'EUR') {
    const rate = parseFloat(process.env.EUR_TO_COP || '0') || 5000;
    return Math.round(pvp * rate);
  }
  if (currency === 'USD') {
    const rate = parseFloat(process.env.USD_TO_COP || '0') || 4500;
    return Math.round(pvp * rate);
  }
  return Math.round(pvp);
}

export const REVIEW_ELIGIBLE_STATES = [
  'disponible',
  'en_stock_colombia',
  'reserva',
] as const;

export type StockReviewItemView = {
  stock_id: string;
  card_id: string;
  card_name: string;
  image_url?: string;
  card_state: string;
  language?: string;
  rareza?: string | null;
  verified: boolean;
  outcome?: StockReviewOutcome | null;
  obsolete?: boolean;
};

export type StockReviewSessionView = {
  id: string;
  tag: StockTag;
  status: string;
  items: StockReviewItemView[];
  summary: {
    total: number;
    verified: number;
    pending_verification: number;
    pending_resolution: number;
    resolved: number;
  };
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
};

export type StockLostRowView = {
  stock_id: string;
  card_id: string;
  card_name: string;
  image_url?: string;
  language?: string;
  rareza?: string | null;
  card_state: string;
};

@Injectable()
export class StockReviewService {
  constructor(
    private readonly sessionRepository: StockReviewSessionRepository,
    private readonly stockRepository: StockRepository,
    private readonly cardStockTagRepository: CardStockTagRepository,
    private readonly saleRepository: SaleRepository,
    private readonly pvpRepository: PvpRepository,
  ) {}

  private assertValidTag(tag: string): StockTag {
    const t = String(tag ?? '').trim().toLowerCase();
    if (!STOCK_TAG_VALUES.includes(t as StockTag)) {
      throw new BadRequestException(
        `tag inválido. Permitidos: ${STOCK_TAG_VALUES.join(', ')}`,
      );
    }
    return t as StockTag;
  }

  private languageFromStock(stock: {
    language?: string | null;
    languaje?: string | null;
  }): string | undefined {
    const raw = stock.language ?? stock.languaje;
    if (raw == null || String(raw).trim() === '') return undefined;
    return String(raw).trim().toLowerCase();
  }

  private rarezaFromStock(stock: {
    rareza?: string | null;
    holofoil?: boolean;
    league_card?: boolean;
  }): string | null {
    if (stock.rareza != null && String(stock.rareza).trim() !== '') {
      return String(stock.rareza).trim();
    }
    if (stock.holofoil) return 'holofoil';
    if (stock.league_card) return 'league card';
    return null;
  }

  private snapshotMetaFromStock(stock: {
    language?: string | null;
    languaje?: string | null;
    rareza?: string | null;
    holofoil?: boolean;
    league_card?: boolean;
  }): { language?: string; rareza: string | null } {
    return {
      language: this.languageFromStock(stock),
      rareza: this.rarezaFromStock(stock),
    };
  }

  private toItemView(item: StockReviewSessionItem): StockReviewItemView {
    return {
      stock_id: item.stock_id,
      card_id: item.card_id,
      card_name: item.card_name ?? '',
      image_url: item.image_url,
      card_state: item.card_state_snapshot,
      language: item.language,
      rareza: item.rareza ?? null,
      verified: item.verified,
      outcome: item.outcome ?? null,
      obsolete: item.obsolete ?? false,
    };
  }

  private buildSummary(items: StockReviewSessionItem[]) {
    const total = items.length;
    const verified = items.filter((i) => i.verified).length;
    const resolved = items.filter((i) => i.outcome != null).length;
    const pending_verification = items.filter(
      (i) => !i.verified && i.outcome == null,
    ).length;
    const pending_resolution = items.filter(
      (i) => !i.verified && i.outcome == null,
    ).length;
    return {
      total,
      verified,
      pending_verification,
      pending_resolution,
      resolved,
    };
  }

  private toSessionView(doc: StockReviewSessionDocument): StockReviewSessionView {
    const items = (doc.items ?? []).map((i) => this.toItemView(i));
    return {
      id: doc._id.toString(),
      tag: doc.tag,
      status: doc.status,
      items,
      summary: this.buildSummary(doc.items ?? []),
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      completed_at: doc.completed_at,
    };
  }

  async getActiveSession(): Promise<StockReviewSessionView | null> {
    const doc = await this.sessionRepository.findActive();
    if (!doc) return null;
    await this.syncObsoleteItems(doc);
    return this.toSessionView(doc);
  }

  async getSession(sessionId: string): Promise<StockReviewSessionView> {
    if (!isValidObjectId(sessionId)) {
      throw new BadRequestException('sessionId inválido');
    }
    const doc = await this.sessionRepository.findById(sessionId);
    if (!doc || doc.status === 'cancelada') {
      throw new NotFoundException('Sesión no encontrada');
    }
    await this.syncObsoleteItems(doc);
    return this.toSessionView(doc);
  }

  private async syncObsoleteItems(doc: StockReviewSessionDocument): Promise<void> {
    let changed = false;
    for (const item of doc.items ?? []) {
      if (item.obsolete || item.outcome != null) continue;
      const stock = await this.stockRepository.findById(item.stock_id);
      const state = stock?.card_state ?? '';
      const stillEligible =
        stock != null &&
        REVIEW_ELIGIBLE_STATES.includes(
          state as (typeof REVIEW_ELIGIBLE_STATES)[number],
        );
      if (!stillEligible) {
        item.obsolete = true;
        changed = true;
      } else {
        if (state !== item.card_state_snapshot) {
          item.card_state_snapshot = state;
          changed = true;
        }
        const meta = this.snapshotMetaFromStock(stock as any);
        if (meta.language && item.language !== meta.language) {
          item.language = meta.language;
          changed = true;
        }
        if (meta.rareza !== item.rareza) {
          item.rareza = meta.rareza;
          changed = true;
        }
      }
    }
    if (changed) {
      await this.sessionRepository.save(doc);
    }
  }

  async createSession(tagRaw: string): Promise<StockReviewSessionView> {
    const tag = this.assertValidTag(tagRaw);
    const active = await this.sessionRepository.findActive();
    if (active) {
      if (active.tag === tag) {
        await this.syncObsoleteItems(active);
        return this.toSessionView(active);
      }
      throw new ConflictException(
        `Ya hay una revisión activa (${active.tag}). Cancélala o continúala antes de iniciar otra.`,
      );
    }

    const cardIds = await this.cardStockTagRepository.findCardIdsByTag(tag);
    const stocks = await this.stockRepository.findByCardIdsInStates(
      cardIds,
      [...REVIEW_ELIGIBLE_STATES],
    );

    const items: StockReviewSessionItem[] = stocks.map((s) => {
      const id = (s as any)._id?.toString?.() ?? '';
      const meta = this.snapshotMetaFromStock(s as any);
      return {
        stock_id: id,
        card_id: s.card_id,
        card_name: s.card_name ?? '',
        image_url: s.image_url,
        card_state_snapshot: s.card_state ?? '',
        language: meta.language,
        rareza: meta.rareza,
        verified: false,
        obsolete: false,
      };
    });

    const doc = await this.sessionRepository.create({
      tag,
      status: 'en_verificacion',
      items,
    });
    return this.toSessionView(doc);
  }

  async verifyItem(sessionId: string, stockId: string): Promise<StockReviewSessionView> {
    const doc = await this.loadMutableSession(sessionId);
    if (doc.status !== 'en_verificacion') {
      throw new BadRequestException(
        'Solo se puede verificar en sesiones en fase de verificación',
      );
    }
    const item = this.findItem(doc, stockId);
    item.verified = true;
    await this.sessionRepository.save(doc);
    return this.toSessionView(doc);
  }

  async finalizeVerification(sessionId: string): Promise<StockReviewSessionView> {
    const doc = await this.loadMutableSession(sessionId);
    if (doc.status !== 'en_verificacion') {
      throw new BadRequestException('La sesión no está en verificación');
    }

    const pending = (doc.items ?? []).filter(
      (i) => !i.verified && !i.obsolete,
    );
    if (pending.length === 0) {
      doc.status = 'completada';
      doc.completed_at = new Date();
    } else {
      doc.status = 'pendiente_resolucion';
    }
    await this.sessionRepository.save(doc);
    return this.toSessionView(doc);
  }

  async resolveItem(
    sessionId: string,
    stockId: string,
    outcome: StockReviewOutcome,
    amountCop?: number,
  ): Promise<StockReviewSessionView> {
    const doc = await this.loadMutableSession(sessionId);
    if (doc.status !== 'pendiente_resolucion') {
      throw new BadRequestException(
        'Solo se puede resolver en sesiones pendientes de resolución',
      );
    }

    const item = this.findItem(doc, stockId);
    if (item.verified) {
      throw new BadRequestException('La línea ya fue verificada en stock');
    }
    if (item.outcome != null) {
      throw new BadRequestException('La línea ya fue resuelta');
    }

    const stock = await this.stockRepository.findById(stockId);
    if (!stock) {
      throw new NotFoundException('Stock no encontrado');
    }

    if (outcome === 'perdida') {
      await this.stockRepository.updateCardState(stockId, 'perdida');
    } else if (outcome === 'propiedad') {
      await this.saleRepository.create({
        stock_id: stockId,
        card_id: stock.card_id,
        type: 'propiedad',
        amount_cop: 0,
        notes: 'Marcada en revisión de stock',
      });
      await this.stockRepository.updateCardState(stockId, 'propiedad');
    } else if (outcome === 'vendida') {
      const amount = await this.resolveSaleAmountCop(stock, amountCop);
      await this.saleRepository.create({
        stock_id: stockId,
        card_id: stock.card_id,
        type: 'venta',
        amount_cop: amount,
        notes: 'Registrada en revisión de stock',
      });
      await this.stockRepository.updateCardState(stockId, 'vendida');
    } else if (outcome === 'en_stock') {
      // Sin cambios en stock ni ventas: solo cierra la línea en la sesión.
    } else {
      throw new BadRequestException('outcome inválido');
    }

    item.outcome = outcome;
    item.resolved_at = new Date();
    await this.maybeCompleteSession(doc);
    await this.sessionRepository.save(doc);
    return this.toSessionView(doc);
  }

  private async resolveSaleAmountCop(
    stock: { card_id: string; rareza?: string | null; holofoil?: boolean; league_card?: boolean },
    amountCop?: number,
  ): Promise<number> {
    if (amountCop != null && !Number.isNaN(amountCop) && amountCop >= 0) {
      return Math.round(amountCop);
    }
    const pvps = await this.pvpRepository.findAllByCardId(stock.card_id);
    const resolved = resolvePvpForLine(
      pvps,
      effectiveOperationalRarezaFromStock(stock as any),
    );
    if (!resolved) {
      throw new BadRequestException('No hay PVP asignado para esta carta');
    }
    return pvpToCop(resolved.pvp, resolved.pvp_currency ?? 'COP');
  }

  private async maybeCompleteSession(doc: StockReviewSessionDocument): Promise<void> {
    const allDone = (doc.items ?? []).every(
      (i) => i.verified || i.obsolete || i.outcome != null,
    );
    if (allDone) {
      doc.status = 'completada';
      doc.completed_at = new Date();
    }
  }

  async cancelSession(sessionId: string): Promise<void> {
    const doc = await this.loadMutableSession(sessionId);
    if (doc.status === 'completada') {
      throw new BadRequestException('No se puede cancelar una sesión completada');
    }
    await this.sessionRepository.markCancelled(sessionId);
  }

  async listPerdidas(): Promise<StockLostRowView[]> {
    const rows = await this.stockRepository.findByCardState('perdida');
    return rows.map((s) => {
      const id = (s as any)._id?.toString?.() ?? '';
      return {
        stock_id: id,
        card_id: s.card_id,
        card_name: s.card_name ?? '',
        image_url: s.image_url,
        language: (s as any).language ?? (s as any).languaje,
        rareza: this.rarezaFromStock(s as any),
        card_state: s.card_state ?? 'perdida',
      };
    });
  }

  private async loadMutableSession(
    sessionId: string,
  ): Promise<StockReviewSessionDocument> {
    if (!isValidObjectId(sessionId)) {
      throw new BadRequestException('sessionId inválido');
    }
    const doc = await this.sessionRepository.findById(sessionId);
    if (!doc || doc.status === 'cancelada') {
      throw new NotFoundException('Sesión no encontrada');
    }
    return doc;
  }

  private findItem(
    doc: StockReviewSessionDocument,
    stockId: string,
  ): StockReviewSessionItem {
    const item = (doc.items ?? []).find((i) => i.stock_id === stockId);
    if (!item) {
      throw new NotFoundException('Ítem no encontrado en la sesión');
    }
    return item;
  }
}
