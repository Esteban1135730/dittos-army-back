import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { IncomingShipRoundRepository } from 'src/repository/incoming-ship-round.repository';
import { IncomingShipRoundItemRepository } from 'src/repository/incoming-ship-round-item.repository';
import { IncomingBatchItemRepository } from 'src/repository/incoming-batch-item.repository';
import { IncomingBatchRepository } from 'src/repository/incoming-batch.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { StockDto } from 'src/Dto/stock.dto';
import {
  ReviewIncomingShipRoundDto,
} from 'src/Dto/incoming-ship-round.dto';
import { CreateIncomingShipRoundDto } from 'src/Dto/incoming-ship-round.dto';
import { normalizeOperationalRareza } from 'src/constants/item-rareza';


@Controller('incoming/ship-round')
export class IncomingShipRoundController {
  constructor(
    private readonly shipRoundRepository: IncomingShipRoundRepository,
    private readonly shipRoundItemRepository: IncomingShipRoundItemRepository,
    private readonly incomingBatchItemRepository: IncomingBatchItemRepository,
    private readonly incomingBatchRepository: IncomingBatchRepository,
    private readonly stockRepository: StockRepository,
  ) {}

  @Post()
  async createShipRound(
    @Body() body: CreateIncomingShipRoundDto,
  ): Promise<{ round_id: string; included_items: number }> {
    const shipping_total_cop = body?.shipping_total_cop;
    if (shipping_total_cop == null || shipping_total_cop <= 0) {
      throw new Error('shipping_total_cop es requerido y debe ser mayor a 0');
    }

    const batchItemsInRoute =
      await this.incomingBatchItemRepository.findByRemainingQuantityGreaterThanZero();

    if (batchItemsInRoute.length === 0) {
      throw new Error('No hay cartas en camino (remaining_quantity > 0)');
    }

    const round = await this.shipRoundRepository.create({ shipping_total_cop });

    const roundItems = batchItemsInRoute.map((it) => ({
      ship_round_id: round._id.toString(),
      batch_item_id: it._id.toString(),
      arrived_quantity: 0,
      novedad_quantity: 0,
      novedad_notes: '',
      created_at: new Date(),
      updated_at: new Date(),
    }));

    await this.shipRoundItemRepository.createMany(roundItems);

    return { round_id: round._id.toString(), included_items: roundItems.length };
  }

  @Get('open')
  async listOpenRounds(): Promise<
    Array<{
      round_id: string;
      shipping_total_cop: number;
      status: string;
      created_at: Date;
    }>
  > {
    const rounds = await this.shipRoundRepository.listOpenRounds();
    return rounds.map((r) => ({
      round_id: r._id.toString(),
      shipping_total_cop: r.shipping_total_cop,
      status: r.status,
      created_at: r.created_at,
    }));
  }

  @Delete(':roundId')
  async deleteShipRound(@Param('roundId') roundId: string): Promise<{ success: boolean; message?: string }> {
    const round = await this.shipRoundRepository.findById(roundId);
    if (!round) {
      return { success: false, message: 'Ship round no encontrada' };
    }
    if (round.status !== 'reviewing') {
      return {
        success: false,
        message: 'Solo se pueden eliminar tandas en estado reviewing',
      };
    }

    await this.shipRoundItemRepository.deleteByRoundId(roundId);
    const deleted = await this.shipRoundRepository.deleteById(roundId);
    return { success: deleted };
  }

  @Get(':roundId')
  async getShipRoundReviewData(@Param('roundId') roundId: string) {
    const round = await this.shipRoundRepository.findById(roundId);
    if (!round) throw new Error('Ship round no encontrada');

    const roundItems = await this.shipRoundItemRepository.findByRoundId(roundId);
    const batchItemIds = roundItems.map((ri) => ri.batch_item_id);

    const batchItems = await this.incomingBatchItemRepository.findByIds(batchItemIds);
    const batchItemMap = new Map<string, any>();
    batchItems.forEach((bi) => batchItemMap.set(bi._id.toString(), bi));

    const items = roundItems.map((ri) => {
      const bi = batchItemMap.get(ri.batch_item_id);
      if (!bi) {
        return {
          batch_item_id: ri.batch_item_id,
          card_id: '',
          card_name: '',
          image_url: '',
          language: '',
          quantity_ordered: 0,
          remaining_quantity: 0,
          unit_cost_cop: 0,
          rareza: null,
          arrived_quantity: ri.arrived_quantity ?? 0,
          novedad_quantity: ri.novedad_quantity ?? 0,
          novedad_notes: ri.novedad_notes ?? '',
        };
      }

      return {
        batch_item_id: ri.batch_item_id,
        card_id: bi.card_id,
        card_name: bi.card_name ?? '',
        image_url: bi.image_url ?? '',
        language: bi.language,
        quantity_ordered: bi.quantity_ordered,
        remaining_quantity: bi.remaining_quantity,
        unit_cost_cop: bi.unit_cost_cop,
        rareza: bi.rareza ?? null,
        arrived_quantity: ri.arrived_quantity ?? 0,
        novedad_quantity: ri.novedad_quantity ?? 0,
        novedad_notes: ri.novedad_notes ?? '',
      };
    });

    const arrivedTotalQuantity = items.reduce(
      (sum, it) => sum + (it.arrived_quantity ?? 0),
      0,
    );

    return {
      round_id: round._id.toString(),
      shipping_total_cop: round.shipping_total_cop,
      round_status: round.status,
      arrived_total_quantity: arrivedTotalQuantity,
      items,
    };
  }

  @Put(':roundId/review')
  async saveShipRoundReview(
    @Param('roundId') roundId: string,
    @Body() body: ReviewIncomingShipRoundDto,
  ): Promise<{ success: boolean }> {
    const round = await this.shipRoundRepository.findById(roundId);
    if (!round) throw new Error('Ship round no encontrada');
    if (round.status !== 'reviewing') throw new Error('Ship round ya finalizada');

    const decisions = body?.decisions ?? [];
    if (!Array.isArray(decisions)) throw new Error('decisions es requerido');

    const roundItems = await this.shipRoundItemRepository.findByRoundId(roundId);
    if (decisions.length !== roundItems.length) {
      // mantenemos simple: exigir que incluyan todos los items del round
      throw new Error('decisions debe incluir TODOS los batch items del round');
    }

    const batchItemIds = decisions.map((d) => d.batch_item_id);
    const batchItems = await this.incomingBatchItemRepository.findByIds(batchItemIds);
    const batchItemMap = new Map<string, any>();
    batchItems.forEach((bi) => batchItemMap.set(bi._id.toString(), bi));

    const decisionsNormalized = roundItems.map((ri) => {
      const d = decisions.find((x) => x.batch_item_id === ri.batch_item_id);
      if (!d) throw new Error('Faltan decisiones para algún item del round');

      const arrived_quantity = Number(d.arrived_quantity ?? 0);
      const novedad_quantity = Number(d.novedad_quantity ?? 0);
      const novedad_notes = (d.novedad_notes ?? '').toString();

      const bi = batchItemMap.get(ri.batch_item_id);
      if (!bi) throw new Error('batch_item no encontrada');

      if (!Number.isFinite(arrived_quantity) || arrived_quantity < 0) {
        throw new Error('arrived_quantity inválido');
      }
      if (arrived_quantity > bi.remaining_quantity) {
        throw new Error('arrived_quantity no puede superar remaining_quantity');
      }
      if (!Number.isFinite(novedad_quantity) || novedad_quantity < 0) {
        throw new Error('novedad_quantity inválido');
      }
      if (novedad_quantity > arrived_quantity) {
        throw new Error('novedad_quantity no puede superar arrived_quantity');
      }

      return {
        batch_item_id: ri.batch_item_id,
        arrived_quantity,
        novedad_quantity,
        novedad_notes,
      };
    });

    await this.shipRoundItemRepository.upsertManyDecisions(roundId, decisionsNormalized);
    return { success: true };
  }

  @Post(':roundId/finalize')
  async finalizeShipRound(@Param('roundId') roundId: string) {
    const round = await this.shipRoundRepository.findById(roundId);
    if (!round) throw new Error('Ship round no encontrada');
    if (round.status !== 'reviewing') throw new Error('Ship round ya finalizada');

    const roundItems = await this.shipRoundItemRepository.findByRoundId(roundId);
    const batchItemIds = roundItems.map((ri) => ri.batch_item_id);
    const batchItems = await this.incomingBatchItemRepository.findByIds(batchItemIds);
    const batchItemMap = new Map<string, any>();
    batchItems.forEach((bi) => batchItemMap.set(bi._id.toString(), bi));

    const itemsWithDecisions = roundItems
      .map((ri) => {
        const bi = batchItemMap.get(ri.batch_item_id);
        if (!bi) return null;
        return { ri, bi };
      })
      .filter((x) => x !== null) as Array<{ ri: any; bi: any }>;

    let arrivedTotalQuantity = 0;
    for (const pair of itemsWithDecisions) {
      if (pair.ri.arrived_quantity > pair.bi.remaining_quantity) {
        throw new Error('arrived_quantity excede remaining_quantity');
      }
      if (pair.ri.novedad_quantity > pair.ri.arrived_quantity) {
        throw new Error('novedad_quantity excede arrived_quantity');
      }
      arrivedTotalQuantity += pair.ri.arrived_quantity ?? 0;
    }

    if (arrivedTotalQuantity <= 0) {
      throw new Error('No hay cartas arribadas para convertir a stock en esta tanda');
    }

    const shipping_total_cop = round.shipping_total_cop;

    const stockDtos: StockDto[] = [];
    for (const pair of itemsWithDecisions) {
      const arrived_quantity = Number(pair.ri.arrived_quantity ?? 0);
      const novedad_quantity = Number(pair.ri.novedad_quantity ?? 0);
      const novedad_notes = (pair.ri.novedad_notes ?? '').toString();
      if (arrived_quantity <= 0) continue;

      const bi = pair.bi;
      const rarezaStock = normalizeOperationalRareza(bi.rareza) ?? undefined;
      for (let i = 0; i < arrived_quantity; i++) {
        stockDtos.push({
          card_id: bi.card_id,
          card_name: bi.card_name ?? '',
          shipment: shipping_total_cop,
          unity_cost: bi.unit_cost_cop,
          cards_in_shipmet: arrivedTotalQuantity,
          image_url: bi.image_url ?? '',
          card_state: 'disponible',
          language: bi.language,
          currency: 'COP',
          incoming_notes: i < novedad_quantity ? novedad_notes : '',
          rareza: rarezaStock,
        });
      }
    }

    const createdStocks = await this.stockRepository.createMany(stockDtos);

    // Actualizar remaining_quantity en cada batch_item
    for (const pair of itemsWithDecisions) {
      const newRemaining = Number(pair.bi.remaining_quantity ?? 0) - Number(pair.ri.arrived_quantity ?? 0);
      if (newRemaining < 0) throw new Error('remaining_quantity quedó negativo');
      await this.incomingBatchItemRepository.updateRemainingQuantity(
        pair.bi._id.toString(),
        newRemaining,
      );
    }

    // Actualizar estado de batch por cada batch_id afectado
    const affectedBatchIds = Array.from(
      new Set(itemsWithDecisions.map((p) => p.bi.batch_id.toString())),
    );
    await Promise.all(
      affectedBatchIds.map(async (batchId) => {
        const items = await this.incomingBatchItemRepository.findByBatchId(batchId);
        const remainingTotal = items.reduce(
          (sum, it) => sum + (it.remaining_quantity ?? 0),
          0,
        );
        if (remainingTotal === 0) {
          await this.incomingBatchRepository.setStatus(batchId, 'completed');
        }
      }),
    );

    await this.shipRoundRepository.setFinalized(roundId);

    return {
      success: true,
      createdStockCount: createdStocks.length,
      arrivedTotalQuantity,
    };
  }
}

