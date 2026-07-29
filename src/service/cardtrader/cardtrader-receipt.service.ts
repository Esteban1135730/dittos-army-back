import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CardtraderReceiptSessionRepository } from '../../repository/cardtrader-receipt-session.repository';
import { CardtraderReceiptLineRepository } from '../../repository/cardtrader-receipt-line.repository';
import { CardtraderTransitLineRepository } from '../../repository/cardtrader-transit-line.repository';
import { StockRepository } from '../../repository/stock.repository';
import {
  FinalizeReceiptDto,
  InconsistencyLineDto,
  ReceiveLineDto,
} from '../../Dto/cardtrader-receipt.dto';

@Injectable()
export class CardtraderReceiptService {
  constructor(
    private readonly sessionRepo: CardtraderReceiptSessionRepository,
    private readonly lineRepo: CardtraderReceiptLineRepository,
    private readonly transitLineRepo: CardtraderTransitLineRepository,
    private readonly stockRepo: StockRepository,
  ) {}

  async getActiveSession() {
    const session = await this.sessionRepo.findActiveSession();
    if (!session) return null;
    const lines = await this.lineRepo.findBySessionId(
      (session._id as any).toString(),
    );
    return { session, lines };
  }

  async getSession(sessionId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session)
      throw new NotFoundException(`Sesión ${sessionId} no encontrada`);
    const lines = await this.lineRepo.findBySessionId(sessionId);
    return { session, lines };
  }

  async createSession() {
    const existing = await this.sessionRepo.findActiveSession();
    if (existing) {
      throw new ConflictException(
        `Ya existe una sesión activa (id: ${(existing._id as any).toString()}). Ciérrala antes de abrir una nueva.`,
      );
    }

    const transitLines =
      await this.transitLineRepo.findByRemainingQuantityGreaterThanZero();

    if (!transitLines.length) {
      throw new BadRequestException(
        'No hay líneas de tránsito abiertas (remaining_quantity > 0). No se puede iniciar una sesión de recepción.',
      );
    }

    const lotIds = [...new Set(transitLines.map((l) => String(l.lot_id)))];

    const session = await this.sessionRepo.create({
      status: 'open',
      lot_ids: lotIds,
    });

    const sessionId = (session._id as any).toString();

    const receiptLines = transitLines.map((tl) => ({
      session_id: sessionId,
      transit_line_id: (tl._id as any).toString(),
      transit_lot_id: String(tl.lot_id),
      card_id: tl.card_id,
      card_name: tl.card_name ?? '',
      image_url: tl.image_url ?? '',
      language: tl.language ?? '',
      rareza: tl.rareza ?? null,
      collector_number: tl.collector_number ?? null,
      expansion: tl.expansion ?? null,
      quantity_expected: tl.remaining_quantity,
      fx_unit_price: tl.fx_unit_price,
      unit_cost_cop: tl.unit_cost_cop,
      status: 'pending' as const,
      received_qty: null,
      inconsistency_type: null,
      notes: '',
      stock_id: null,
    }));

    await this.lineRepo.createMany(receiptLines);

    return {
      session_id: sessionId,
      status: session.status,
      lines_loaded: receiptLines.length,
      lot_ids: lotIds,
    };
  }

  async receiveLine(sessionId: string, lineId: string, dto: ReceiveLineDto) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session)
      throw new NotFoundException(`Sesión ${sessionId} no encontrada`);
    if (session.status !== 'open') {
      throw new BadRequestException(
        `La sesión ${sessionId} no está abierta (estado actual: ${session.status}).`,
      );
    }

    const line = await this.lineRepo.findById(lineId);
    if (!line || line.session_id !== sessionId) {
      throw new NotFoundException(
        `Línea ${lineId} no encontrada en la sesión ${sessionId}.`,
      );
    }
    if (line.status !== 'pending') {
      throw new BadRequestException(
        `La línea ${lineId} (${line.card_name}) no está en estado pending (estado actual: ${line.status}).`,
      );
    }

    const qty = dto.received_qty;
    if (!Number.isFinite(qty) || qty <= 0 || qty > line.quantity_expected) {
      throw new BadRequestException(
        `received_qty (${qty}) debe ser > 0 y ≤ quantity_expected (${line.quantity_expected}) para "${line.card_name}".`,
      );
    }

    await this.lineRepo.updateById(lineId, {
      status: 'received',
      received_qty: qty,
      notes: dto.notes ?? '',
    });

    return {
      session_id: sessionId,
      line_id: lineId,
      status: 'received',
      received_qty: qty,
    };
  }

  async markInconsistency(
    sessionId: string,
    lineId: string,
    dto: InconsistencyLineDto,
  ) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session)
      throw new NotFoundException(`Sesión ${sessionId} no encontrada`);
    if (session.status !== 'open') {
      throw new BadRequestException(
        `La sesión ${sessionId} no está abierta (estado actual: ${session.status}).`,
      );
    }

    const line = await this.lineRepo.findById(lineId);
    if (!line || line.session_id !== sessionId) {
      throw new NotFoundException(
        `Línea ${lineId} no encontrada en la sesión ${sessionId}.`,
      );
    }
    if (line.status !== 'pending') {
      throw new BadRequestException(
        `La línea ${lineId} (${line.card_name}) no está en estado pending (estado actual: ${line.status}).`,
      );
    }

    if (!dto.notes?.trim()) {
      throw new BadRequestException(
        'Las notas son obligatorias al marcar una inconsistencia.',
      );
    }

    await this.lineRepo.updateById(lineId, {
      status: 'inconsistency',
      inconsistency_type: dto.type,
      notes: dto.notes,
    });

    return {
      session_id: sessionId,
      line_id: lineId,
      status: 'inconsistency',
      inconsistency_type: dto.type,
    };
  }

  async undoLine(sessionId: string, lineId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session)
      throw new NotFoundException(`Sesión ${sessionId} no encontrada`);
    if (session.status !== 'open') {
      throw new BadRequestException(
        `La sesión ${sessionId} no está abierta (estado actual: ${session.status}).`,
      );
    }

    const line = await this.lineRepo.findById(lineId);
    if (!line || line.session_id !== sessionId) {
      throw new NotFoundException(
        `Línea ${lineId} no encontrada en la sesión ${sessionId}.`,
      );
    }
    if (line.status === 'pending') {
      throw new BadRequestException(
        `La línea ${lineId} ya está en estado pending; no hay nada que deshacer.`,
      );
    }

    await this.lineRepo.updateById(lineId, {
      status: 'pending',
      received_qty: null,
      inconsistency_type: null,
      notes: '',
    });

    return { session_id: sessionId, line_id: lineId, status: 'pending' };
  }

  async finalize(sessionId: string, dto: FinalizeReceiptDto) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session)
      throw new NotFoundException(`Sesión ${sessionId} no encontrada`);
    if (session.status !== 'open') {
      throw new BadRequestException(
        `La sesión ${sessionId} no está abierta (estado actual: ${session.status}).`,
      );
    }

    if (
      !Number.isFinite(dto.shipping_total_cop) ||
      dto.shipping_total_cop <= 0
    ) {
      throw new BadRequestException(
        `shipping_total_cop (${dto.shipping_total_cop}) debe ser un número positivo.`,
      );
    }

    const lines = await this.lineRepo.findBySessionId(sessionId);
    const pendingLines = lines.filter((l) => l.status === 'pending');
    if (pendingLines.length > 0) {
      throw new BadRequestException(
        `Quedan ${pendingLines.length} línea(s) en estado pending. Todas deben estar confirmadas o marcadas como inconsistencia antes de finalizar.`,
      );
    }

    const receivedLines = lines.filter((l) => l.status === 'received');
    const inconsistencyLines = lines.filter(
      (l) => l.status === 'inconsistency',
    );

    const totalReceivedQty = receivedLines.reduce(
      (sum, l) => sum + (l.received_qty ?? 0),
      0,
    );

    let stockCreated = 0;

    for (const line of receivedLines) {
      const shipmentPerUnit =
        totalReceivedQty > 0
          ? Math.round(dto.shipping_total_cop / totalReceivedQty)
          : 0;

      const stock = await this.stockRepo.create({
        card_id: line.card_id,
        card_name: line.card_name ?? '',
        image_url: line.image_url ?? '',
        language: line.language ?? '',
        rareza: line.rareza ?? undefined,
        unity_cost: line.unit_cost_cop,
        shipment: shipmentPerUnit,
        card_state: 'disponible',
        currency: 'COP',
        incoming_notes: '[recepción CT 028]',
        cards_in_shipmet: 0,
      } as any);

      const stockId = (stock as any)._id?.toString() ?? '';

      await this.lineRepo.updateById((line._id as any).toString(), {
        stock_id: stockId,
      });

      await this.transitLineRepo.decrementRemainingQuantity(
        line.transit_line_id,
        line.received_qty!,
      );

      stockCreated++;
    }

    await this.sessionRepo.updateStatus(sessionId, 'finalized', {
      finalized_at: new Date(),
      shipping_total_cop: dto.shipping_total_cop,
    });

    return {
      session_id: sessionId,
      stock_created: stockCreated,
      inconsistencies: inconsistencyLines.map((l) => ({
        line_id: (l._id as any).toString(),
        card_id: l.card_id,
        card_name: l.card_name,
        inconsistency_type: l.inconsistency_type,
        notes: l.notes,
      })),
      shipping_total_cop: dto.shipping_total_cop,
    };
  }

  async revertFinalization(sessionId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session)
      throw new NotFoundException(`Sesión ${sessionId} no encontrada`);
    if (session.status !== 'finalized') {
      throw new BadRequestException(
        `La sesión ${sessionId} no está en estado finalized (estado actual: ${session.status}).`,
      );
    }

    const lines = await this.lineRepo.findBySessionId(sessionId);
    const receivedLines = lines.filter(
      (l) => l.status === 'received' && l.stock_id,
    );

    // Verificar que ningún stock haya sido usado (card_state !== 'disponible' = fue vendido/reservado)
    for (const line of receivedLines) {
      const stock = await this.stockRepo.findById(line.stock_id!);
      if (stock && (stock as any).card_state !== 'disponible') {
        throw new ConflictException(
          `El stock de "${line.card_name}" (stock_id: ${line.stock_id}) ya fue vendido o reservado. No se puede revertir.`,
        );
      }
    }

    let stockDeleted = 0;

    for (const line of receivedLines) {
      await this.stockRepo.deleteById(line.stock_id!);
      stockDeleted++;

      await this.transitLineRepo.incrementRemainingQuantity(
        line.transit_line_id,
        line.received_qty!,
      );

      // Limpiar stock_id; mantener status 'received' para conservar datos de recepción
      await this.lineRepo.updateById((line._id as any).toString(), {
        stock_id: null,
      });
    }

    await this.sessionRepo.updateStatus(sessionId, 'open', {
      finalized_at: null,
      shipping_total_cop: null,
    });

    return {
      session_id: sessionId,
      status: 'open',
      stock_deleted: stockDeleted,
      remaining_restored: stockDeleted,
    };
  }

  async cancelSession(sessionId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session)
      throw new NotFoundException(`Sesión ${sessionId} no encontrada`);
    if (session.status === 'finalized') {
      throw new BadRequestException(
        'Una sesión finalizada no puede cancelarse. Usa el endpoint de revertir primero.',
      );
    }
    if (session.status === 'cancelled') {
      throw new BadRequestException(
        `La sesión ${sessionId} ya está cancelada.`,
      );
    }

    await this.sessionRepo.updateStatus(sessionId, 'cancelled');

    return { session_id: sessionId, status: 'cancelled' };
  }
}
