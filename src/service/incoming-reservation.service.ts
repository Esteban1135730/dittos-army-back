import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReservaIncomingRepository } from '../repository/reserva-incoming.repository';
import { CardtraderTransitLineRepository } from '../repository/cardtrader-transit-line.repository';
import { CardtraderTransitLotRepository } from '../repository/cardtrader-transit-lot.repository';
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

type ReservationLineSnapshot = {
  lineId: string;
  card_id: string;
  card_name: string;
  image_url: string;
  language: string;
  rareza?: string | null;
  remaining_quantity: number;
};

type VariantCandidate = {
  lineId: string;
  remaining: number;
  purchaseMs: number;
  createdMs: number;
};

@Injectable()
export class IncomingReservationService {
  constructor(
    private readonly reservaIncomingRepo: ReservaIncomingRepository,
    private readonly transitLineRepo: CardtraderTransitLineRepository,
    private readonly transitLotRepo: CardtraderTransitLotRepository,
    private readonly reservaRepository: ReservaRepository,
    private readonly stockRepository: StockRepository,
    private readonly pvpRepository: PvpRepository,
  ) {}

  /**
   * Tras insertMany de líneas de stock y crear meta[i] = line_id por cada unidad creada.
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
      const lineId = batchItemIds[i];
      const stockId = String(stockDoc._id);

      const slot = await this.reservaIncomingRepo.consumeOneFifo(lineId);
      if (!slot) continue;

      const rarezaLine = effectiveOperationalRarezaFromStock(stockDoc as any);
      const linePvps = pvpMap.get(stockDoc.card_id) ?? [];
      const resolved = resolvePvpForLine(linePvps as any, rarezaLine);
      let precioCop = 0;
      const currency = 'COP';
      if (slot.precio_cop != null && slot.precio_cop > 0) {
        precioCop = slot.precio_cop;
      } else if (resolved) {
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
    lineId: string,
    delta: number,
    precioCop?: number | null,
  ): Promise<any> {
    if (!delta || delta <= 0 || !Number.isFinite(delta)) {
      throw new BadRequestException('quantity debe ser un entero positivo');
    }
    const line = await this.resolveLine(lineId);
    if (!line) {
      throw new NotFoundException('Línea en tránsito no encontrada');
    }

    const existing = await this.reservaIncomingRepo.findByClientAndBatchItem(
      clientId,
      lineId,
    );
    const currentQty = existing?.quantity ?? 0;
    const newQty = currentQty + Math.floor(delta);

    await this.assertCupoReplace(
      lineId,
      line.remaining_quantity,
      currentQty,
      newQty,
    );

    const saved = await this.reservaIncomingRepo.upsertQuantity(
      clientId,
      lineId,
      newQty,
      precioCop,
    );
    if (!saved) throw new BadRequestException('Cantidad resultante inválida');
    return saved.toObject ? saved.toObject() : saved;
  }

  /**
   * Reserva cantidad distribuyendo FIFO entre líneas abiertas de tránsito CT
   * que coinciden en card_id + rareza operativa + idioma.
   */
  async addQuantityByCardVariant(
    clientId: string,
    cardId: string,
    language: string,
    rarezaRaw: string | null | undefined,
    delta: number,
    precioCop?: number | null,
  ): Promise<any> {
    if (!delta || delta <= 0 || !Number.isFinite(delta)) {
      throw new BadRequestException('quantity debe ser un entero positivo');
    }
    const targetRareza = normalizeOperationalRareza(rarezaRaw);
    const qty = Math.floor(delta);

    const candidates = await this.collectVariantCandidates(
      cardId,
      language,
      targetRareza,
    );

    let totalFree = 0;
    for (const c of candidates) {
      const sumP = await this.reservaIncomingRepo.sumQuantityForBatchItem(
        c.lineId,
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
        c.lineId,
      );
      const free = Math.max(0, c.remaining - sumP);
      const take = Math.min(free, need);
      if (take <= 0) continue;
      lastSaved = await this.addQuantity(clientId, c.lineId, take, precioCop);
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

  async listVariantCupos(
    cardId: string,
    language: string,
  ): Promise<
    Array<{
      rareza: string | null;
      cupo: number;
      card_name: string;
      image_url: string;
      language: string;
    }>
  > {
    const byRareza = new Map<
      string,
      {
        rareza: string | null;
        cupo: number;
        card_name: string;
        image_url: string;
        language: string;
      }
    >();
    const lang = String(language).trim().toLowerCase();
    const openLots = await this.transitLotRepo.findOpenLots();
    for (const lot of openLots) {
      const lines = await this.transitLineRepo.findByLotId(lot._id.toString());
      for (const line of lines) {
        if (line.card_id !== cardId) continue;
        if (String(line.language).trim().toLowerCase() !== lang) continue;
        if ((line.remaining_quantity ?? 0) <= 0) continue;
        const rz = normalizeOperationalRareza(line.rareza);
        const key = rz ?? '';
        const sumP = await this.reservaIncomingRepo.sumQuantityForBatchItem(
          line._id.toString(),
        );
        const free = Math.max(0, (line.remaining_quantity ?? 0) - sumP);
        const existing = byRareza.get(key);
        if (!existing) {
          byRareza.set(key, {
            rareza: rz,
            cupo: free,
            card_name: line.card_name ?? line.card_id,
            image_url: line.image_url ?? '',
            language: String(line.language).trim(),
          });
        } else {
          existing.cupo += free;
        }
      }
    }
    return [...byRareza.values()].filter((g) => g.cupo > 0);
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
      precio_cop?: number | null;
    }>
  > {
    const rows = await this.reservaIncomingRepo.findAll(clientId);
    const ids = [...new Set(rows.map((r) => r.batch_item_id))];
    const transitLines = ids.length
      ? await this.transitLineRepo.findByIds(ids)
      : [];
    const transitMap = new Map(transitLines.map((it) => [it._id.toString(), it]));

    return rows.map((r) => {
      const tl = transitMap.get(r.batch_item_id);
      return {
        _id: r._id.toString(),
        client_id: r.client_id,
        batch_item_id: r.batch_item_id,
        quantity: r.quantity,
        created_at: r.created_at,
        updated_at: r.updated_at,
        card_name: tl?.card_name,
        card_id: tl?.card_id,
        image_url: tl?.image_url,
        rareza: tl?.rareza,
        remaining_quantity: tl?.remaining_quantity,
        language: tl?.language,
        precio_cop: r.precio_cop ?? null,
      };
    });
  }

  async setAbsoluteQuantity(id: string, quantity: number): Promise<any> {
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new BadRequestException('quantity inválida');
    }
    const doc = await this.reservaIncomingRepo.findById(id);
    if (!doc) throw new NotFoundException('Reserva en camino no encontrada');

    const line = await this.resolveLine(doc.batch_item_id);
    if (!line) throw new NotFoundException('Línea en tránsito no encontrada');

    const q = Math.floor(quantity);
    await this.assertCupoReplace(
      doc.batch_item_id,
      line.remaining_quantity,
      doc.quantity,
      q,
    );

    return this.reservaIncomingRepo.upsertQuantity(
      doc.client_id,
      doc.batch_item_id,
      q,
    );
  }

  async setPrecioCop(id: string, precioCop: number | null): Promise<any> {
    const doc = await this.reservaIncomingRepo.findById(id);
    if (!doc) throw new NotFoundException('Reserva en camino no encontrada');
    const saved = await this.reservaIncomingRepo.setPrecioCop(id, precioCop);
    return saved?.toObject ? saved.toObject() : saved;
  }

  async deleteById(id: string): Promise<boolean> {
    return this.reservaIncomingRepo.deleteById(id);
  }

  private async resolveLine(
    lineId: string,
  ): Promise<ReservationLineSnapshot | null> {
    const tl = await this.transitLineRepo.findById(lineId);
    if (!tl) return null;
    return {
      lineId: tl._id.toString(),
      card_id: tl.card_id,
      card_name: tl.card_name ?? tl.card_id,
      image_url: tl.image_url ?? '',
      language: tl.language,
      rareza: tl.rareza,
      remaining_quantity: tl.remaining_quantity ?? 0,
    };
  }

  private async collectVariantCandidates(
    cardId: string,
    language: string,
    targetRareza: string | null,
  ): Promise<VariantCandidate[]> {
    const candidates: VariantCandidate[] = [];

    const openLots = await this.transitLotRepo.findOpenLots();
    for (const lot of openLots) {
      const lines = await this.transitLineRepo.findByLotId(lot._id.toString());
      const purchaseMs = new Date(lot.purchase_date).getTime();
      for (const line of lines) {
        if (line.card_id !== cardId) continue;
        if (
          String(line.language).trim().toLowerCase() !==
          String(language).trim().toLowerCase()
        )
          continue;
        const rz = normalizeOperationalRareza(line.rareza);
        if (rz !== targetRareza) continue;
        if ((line.remaining_quantity ?? 0) <= 0) continue;
        candidates.push({
          lineId: line._id.toString(),
          remaining: line.remaining_quantity ?? 0,
          purchaseMs,
          createdMs: line.created_at ? new Date(line.created_at).getTime() : 0,
        });
      }
    }

    candidates.sort((a, b) => {
      if (a.purchaseMs !== b.purchaseMs) return a.purchaseMs - b.purchaseMs;
      return a.createdMs - b.createdMs;
    });

    return candidates;
  }

  private async assertCupoReplace(
    lineId: string,
    remainingQuantity: number,
    oldQtyThisLine: number,
    newQtyThisLine: number,
  ): Promise<void> {
    const sumPending =
      await this.reservaIncomingRepo.sumQuantityForBatchItem(lineId);
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
