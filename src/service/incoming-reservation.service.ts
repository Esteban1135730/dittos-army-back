import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReservaIncomingRepository } from '../repository/reserva-incoming.repository';
import { IncomingBatchItemRepository } from '../repository/incoming-batch-item.repository';
import { IncomingBatchRepository } from '../repository/incoming-batch.repository';
import { ReservaRepository } from '../repository/reserva.repository';
import { StockRepository } from '../repository/stock.repository';
import { PvpRepository } from '../repository/pvp.repository';
import {
  effectiveOperationalRarezaFromStock,
  groupPvpsByCardId,
  resolvePvpForLine,
} from '../utils/pvp-resolve';
import type { Stock } from '../schema/stock.schema';
import { normalizeOperationalRareza } from '../constants/item-rareza';

function precioToCop(precio: number, currency: string): number {
  if (currency === 'COP') return precio;
  if (currency === 'EUR') {
    const rate = parseFloat(process.env.EUR_TO_COP || '0') || 5000;
    return Math.round(precio * rate);
  }
  if (currency === 'USD') {
    const rate = parseFloat(process.env.USD_TO_COP || '0') || 4500;
    return Math.round(precio * rate);
  }
  return precio;
}

@Injectable()
export class IncomingReservationService {
  constructor(
    private readonly reservaIncomingRepo: ReservaIncomingRepository,
    private readonly batchItemRepo: IncomingBatchItemRepository,
    private readonly incomingBatchRepo: IncomingBatchRepository,
    private readonly reservaRepository: ReservaRepository,
    private readonly stockRepository: StockRepository,
    private readonly pvpRepository: PvpRepository,
  ) {}

  /**
   * Tras insertMany de líneas de stock y crear meta[i] = batch_item_id por cada unidad creada.
   */
  async materializeForNewStockLines(
    createdStocks: Array<Stock & { _id?: unknown }>,
    batchItemIds: string[],
  ): Promise<void> {
    if (createdStocks.length !== batchItemIds.length) {
      throw new Error('materializeForNewStockLines: arrays de distinto tamaño');
    }
    const cardIds = [
      ...new Set(createdStocks.map((s) => s.card_id).filter(Boolean)),
    ];
    const pvps = await this.pvpRepository.findByCardIds(cardIds);
    const pvpMap = groupPvpsByCardId(pvps as any);

    for (let i = 0; i < createdStocks.length; i++) {
      const stockDoc = createdStocks[i];
      const batchItemId = batchItemIds[i];
      const stockId = String(stockDoc._id);

      const slot = await this.reservaIncomingRepo.consumeOneFifo(batchItemId);
      if (!slot) continue;

      const rarezaLine = effectiveOperationalRarezaFromStock(stockDoc as any);
      const linePvps = pvpMap.get(stockDoc.card_id) ?? [];
      const resolved = resolvePvpForLine(linePvps as any, rarezaLine);
      let precioCop = 0;
      const currency = 'COP';
      if (resolved) {
        precioCop = precioToCop(resolved.pvp, resolved.pvp_currency);
      }

      await this.reservaRepository.create({
        client_id: slot.client_id,
        stock_id: stockId,
        precio: precioCop,
        currency,
      });
      await this.stockRepository.updateCardState(stockId, 'reserva');
    }
  }

  async addQuantity(
    clientId: string,
    batchItemId: string,
    delta: number,
  ): Promise<any> {
    if (!delta || delta <= 0 || !Number.isFinite(delta)) {
      throw new BadRequestException('quantity debe ser un entero positivo');
    }
    const bi = await this.batchItemRepo.findById(batchItemId);
    if (!bi) {
      throw new NotFoundException('Línea de lote no encontrada');
    }

    const existing = await this.reservaIncomingRepo.findByClientAndBatchItem(
      clientId,
      batchItemId,
    );
    const currentQty = existing?.quantity ?? 0;
    const newQty = currentQty + Math.floor(delta);

    await this.assertCupoReplace(
      batchItemId,
      bi.remaining_quantity,
      currentQty,
      newQty,
    );

    const saved = await this.reservaIncomingRepo.upsertQuantity(
      clientId,
      batchItemId,
      newQty,
    );
    if (!saved) throw new BadRequestException('Cantidad resultante inválida');
    return saved.toObject ? saved.toObject() : saved;
  }

  /**
   * Reserva cantidad distribuyendo FIFO entre líneas de lote abiertas que coinciden en
   * card_id + rareza operativa + idioma (no importa el paquete). Usa lotes más antiguos primero
   * (fecha compra del batch, luego created_at del ítem).
   */
  async addQuantityByCardVariant(
    clientId: string,
    cardId: string,
    language: string,
    rarezaRaw: string | null | undefined,
    delta: number,
  ): Promise<any> {
    if (!delta || delta <= 0 || !Number.isFinite(delta)) {
      throw new BadRequestException('quantity debe ser un entero positivo');
    }
    const targetRareza = normalizeOperationalRareza(rarezaRaw);
    const qty = Math.floor(delta);

    const batches = await this.incomingBatchRepo.findOpenBatches();
    type Cand = {
      batchItemId: string;
      remaining: number;
      purchaseMs: number;
      createdMs: number;
    };
    const candidates: Cand[] = [];

    for (const batch of batches) {
      const items = await this.batchItemRepo.findByBatchId(
        batch._id.toString(),
      );
      const purchaseMs = new Date(batch.purchase_date).getTime();
      for (const bi of items) {
        if (bi.card_id !== cardId) continue;
        if (String(bi.language).trim() !== String(language).trim()) continue;
        const rz = normalizeOperationalRareza(bi.rareza);
        if (rz !== targetRareza) continue;
        if ((bi.remaining_quantity ?? 0) <= 0) continue;
        candidates.push({
          batchItemId: bi._id.toString(),
          remaining: bi.remaining_quantity ?? 0,
          purchaseMs,
          createdMs: bi.created_at ? new Date(bi.created_at).getTime() : 0,
        });
      }
    }

    candidates.sort((a, b) => {
      if (a.purchaseMs !== b.purchaseMs) return a.purchaseMs - b.purchaseMs;
      return a.createdMs - b.createdMs;
    });

    let totalFree = 0;
    for (const c of candidates) {
      const sumP = await this.reservaIncomingRepo.sumQuantityForBatchItem(
        c.batchItemId,
      );
      totalFree += Math.max(0, c.remaining - sumP);
    }
    if (qty > totalFree) {
      throw new ConflictException({
        error:
          'Cantidad en reserva supera lo disponible en camino para esta carta (misma rareza e idioma)',
        code: 'RESERVA_INCOMING_CUPO',
      });
    }

    let need = qty;
    let lastSaved: any = null;
    for (const c of candidates) {
      if (need <= 0) break;
      const sumP = await this.reservaIncomingRepo.sumQuantityForBatchItem(
        c.batchItemId,
      );
      const free = Math.max(0, c.remaining - sumP);
      const take = Math.min(free, need);
      if (take <= 0) continue;
      lastSaved = await this.addQuantity(clientId, c.batchItemId, take);
      need -= take;
    }

    if (need > 0) {
      throw new ConflictException({
        error: 'No se pudo completar la reserva (cupo)',
        code: 'RESERVA_INCOMING_CUPO',
      });
    }
    return lastSaved;
  }

  async listIncoming(clientId?: string): Promise<
    Array<{
      _id: string;
      client_id: string;
      batch_item_id: string;
      quantity: number;
      created_at?: Date;
      updated_at?: Date;
      card_name?: string;
      card_id?: string;
      image_url?: string;
      rareza?: string;
      remaining_quantity?: number;
      language?: string;
    }>
  > {
    const rows = await this.reservaIncomingRepo.findAll(clientId);
    const ids = [...new Set(rows.map((r) => r.batch_item_id))];
    const items = ids.length ? await this.batchItemRepo.findByIds(ids) : [];
    const map = new Map(items.map((it) => [it._id.toString(), it]));
    return rows.map((r) => {
      const bi = map.get(r.batch_item_id);
      return {
        _id: r._id.toString(),
        client_id: r.client_id,
        batch_item_id: r.batch_item_id,
        quantity: r.quantity,
        created_at: r.created_at,
        updated_at: r.updated_at,
        card_name: bi?.card_name,
        card_id: bi?.card_id,
        image_url: bi?.image_url,
        rareza: bi?.rareza,
        remaining_quantity: bi?.remaining_quantity,
        language: bi?.language,
      };
    });
  }

  async setAbsoluteQuantity(id: string, quantity: number): Promise<any> {
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new BadRequestException('quantity inválida');
    }
    const doc = await this.reservaIncomingRepo.findById(id);
    if (!doc) throw new NotFoundException('Reserva en camino no encontrada');

    const bi = await this.batchItemRepo.findById(doc.batch_item_id);
    if (!bi) throw new NotFoundException('Línea de lote no encontrada');

    const q = Math.floor(quantity);
    await this.assertCupoReplace(
      doc.batch_item_id,
      bi.remaining_quantity,
      doc.quantity,
      q,
    );

    return this.reservaIncomingRepo.upsertQuantity(
      doc.client_id,
      doc.batch_item_id,
      q,
    );
  }

  async deleteById(id: string): Promise<boolean> {
    return this.reservaIncomingRepo.deleteById(id);
  }

  private async assertCupoReplace(
    batchItemId: string,
    remainingQuantity: number,
    oldQtyThisLine: number,
    newQtyThisLine: number,
  ): Promise<void> {
    const sumPending =
      await this.reservaIncomingRepo.sumQuantityForBatchItem(batchItemId);
    const newTotalPending = sumPending - oldQtyThisLine + newQtyThisLine;
    if (newTotalPending > remainingQuantity) {
      throw new ConflictException({
        error:
          'Cantidad en reserva supera lo disponible en camino para esta línea',
        code: 'RESERVA_INCOMING_CUPO',
      });
    }
  }
}
