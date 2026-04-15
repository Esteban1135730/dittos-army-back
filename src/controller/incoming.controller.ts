import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { IncomingBatchRepository } from 'src/repository/incoming-batch.repository';
import { IncomingBatchItemRepository } from 'src/repository/incoming-batch-item.repository';
import { IncomingRoundRepository } from 'src/repository/incoming-round.repository';
import { IncomingRoundItemRepository } from 'src/repository/incoming-round-item.repository';
import { IncomingShipRoundRepository } from 'src/repository/incoming-ship-round.repository';
import { IncomingShipRoundItemRepository } from 'src/repository/incoming-ship-round-item.repository';
import {
  CreateIncomingBatchDto,
  CreateIncomingRoundDto,
  ReviewIncomingRoundDto,
} from 'src/Dto/incoming.dto';

const INCOMING_ITEM_RAREZA_VALUES = new Set([
  'hollow',
  'foil',
  'pokeball',
  'masterball',
  'first edition',
]);
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';
import { StockRepository } from 'src/repository/stock.repository';
import { StockDto } from 'src/Dto/stock.dto';

type BatchItemDecision = {
  batchItemId: string;
  arrived_quantity: number;
  novedad_quantity: number;
  novedad_notes: string;
};

@Controller('incoming')
export class IncomingController {
  constructor(
    private readonly incomingBatchRepository: IncomingBatchRepository,
    private readonly incomingBatchItemRepository: IncomingBatchItemRepository,
    private readonly incomingRoundRepository: IncomingRoundRepository,
    private readonly incomingRoundItemRepository: IncomingRoundItemRepository,
    private readonly incomingShipRoundRepository: IncomingShipRoundRepository,
    private readonly incomingShipRoundItemRepository: IncomingShipRoundItemRepository,
    private readonly tcgDexService: TCGDexService,
    private readonly stockRepository: StockRepository,
  ) {}

  @Post('batch')
  async createBatch(@Body() body: CreateIncomingBatchDto): Promise<{ batch_id: string }> {
    const items = body?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('items es requerido y debe ser un array');
    }
    if (body.total_cop_cards_cost == null || body.total_cop_cards_cost <= 0) {
      throw new Error('total_cop_cards_cost es requerido y debe ser mayor a 0');
    }
    if (!body.purchase_date) {
      throw new Error('purchase_date es requerido');
    }
    const purchaseDate = new Date(body.purchase_date);
    if (Number.isNaN(purchaseDate.getTime())) {
      throw new Error('purchase_date inv?lido');
    }

    for (const it of items) {
      if (!it.card_id) throw new Error('card_id es requerido');
      if (!it.language) throw new Error('language es requerido');
      if (it.quantity == null || it.quantity <= 0) throw new Error('quantity es requerido y debe ser > 0');
      if (it.eur_total_lot == null || it.eur_total_lot <= 0) {
        throw new Error('eur_total_lot es requerido y debe ser > 0');
      }
      const rz =
        it.rareza == null || String(it.rareza).trim() === ''
          ? null
          : String(it.rareza).trim();
      if (rz != null && !INCOMING_ITEM_RAREZA_VALUES.has(rz)) {
        throw new Error('rareza inválida');
      }
    }

    const total_eur_cards_cost = items.reduce((sum, it) => sum + it.eur_total_lot, 0);
    if (total_eur_cards_cost <= 0) {
      throw new Error('total_eur_cards_cost calculado inv?lido');
    }

    const real_euro_rate_cop_per_eur = body.total_cop_cards_cost / total_eur_cards_cost;
    if (!Number.isFinite(real_euro_rate_cop_per_eur) || real_euro_rate_cop_per_eur <= 0) {
      throw new Error('real_euro_rate_cop_per_eur calculado inv?lido');
    }

    const batch = await this.incomingBatchRepository.create({
      status: 'open',
      purchase_date: purchaseDate,
      total_eur_cards_cost,
      total_cop_cards_cost: body.total_cop_cards_cost,
      real_euro_rate_cop_per_eur,
    });

    const cardIds = [...new Set(items.map((it) => it.card_id))];
    const cardMap = new Map<string, { name: string; image: string }>();
    await Promise.all(
      cardIds.map(async (cardId) => {
        try {
          const card = await this.tcgDexService.getCard(cardId);
          if (card) {
            cardMap.set(cardId, {
              name: card.name || '',
              image: card.image || card.images?.small || card.images?.large || '',
            });
          }
        } catch {
          // dejar vac?o si falla la API
        }
      }),
    );

    const batchItemsToInsert = items.map((it) => {
      const eur_unit_price = it.eur_total_lot / it.quantity;
      const unit_cost_cop = eur_unit_price * real_euro_rate_cop_per_eur;
      const card = cardMap.get(it.card_id);
      const rarezaNorm =
        it.rareza == null || String(it.rareza).trim() === ''
          ? undefined
          : String(it.rareza).trim();

      return {
        batch_id: batch._id.toString(),
        card_id: it.card_id,
        language: it.language,
        quantity_ordered: it.quantity,
        eur_total_lot: it.eur_total_lot,
        eur_unit_price,
        unit_cost_cop,
        remaining_quantity: it.quantity,
        card_name: (card?.name && String(card.name).trim()) || (it.card_name && String(it.card_name).trim()) || '',
        image_url: (card?.image && String(card.image).trim()) || (it.image_url && String(it.image_url).trim()) || '',
        rareza: rarezaNorm,
        created_at: new Date(),
      };
    });

    await this.incomingBatchItemRepository.createMany(batchItemsToInsert);

    return { batch_id: batch._id.toString() };
  }

  @Get('batch/open')
  async listOpenBatches(): Promise<
    Array<{
      batch_id: string;
      status: string;
      purchase_date: Date;
      created_at: Date;
      total_eur_cards_cost: number;
      total_cop_cards_cost: number;
      remaining_total_quantity: number;
    }>
  > {
    const batches = await this.incomingBatchRepository.findOpenBatches();
    if (batches.length === 0) return [];

    const batchIds = batches.map((b) => b._id.toString());
    const itemsByBatchId = new Map<string, number>();
    await Promise.all(
      batchIds.map(async (batchId) => {
        const items = await this.incomingBatchItemRepository.findByBatchId(batchId);
        const remainingTotal = items.reduce((sum, i) => sum + (i.remaining_quantity || 0), 0);
        itemsByBatchId.set(batchId, remainingTotal);
      }),
    );

    return batches.map((b) => ({
      batch_id: b._id.toString(),
      status: b.status,
      purchase_date: b.purchase_date,
      created_at: b.created_at,
      total_eur_cards_cost: b.total_eur_cards_cost,
      total_cop_cards_cost: b.total_cop_cards_cost,
      remaining_total_quantity: itemsByBatchId.get(b._id.toString()) ?? 0,
    }));
  }

  @Delete('batch/:batchId')
  async deleteBatch(
    @Param('batchId') batchId: string,
  ): Promise<{ success: boolean; message?: string }> {
    const batch = await this.incomingBatchRepository.findById(batchId);
    if (!batch) return { success: false, message: 'Batch no encontrado' };

    const batchItems = await this.incomingBatchItemRepository.findByBatchId(batchId);
    const batchItemIds = new Set(batchItems.map((it) => it._id.toString()));

    // Bloquear eliminaci?n si existe una tanda global abierta que use items de este batch.
    const openShipRounds = await this.incomingShipRoundRepository.listOpenRounds();
    for (const round of openShipRounds) {
      const roundItems = await this.incomingShipRoundItemRepository.findByRoundId(
        round._id.toString(),
      );
      const hasAny = roundItems.some((ri) => batchItemIds.has(ri.batch_item_id));
      if (hasAny) {
        return {
          success: false,
          message:
            'No se puede eliminar: el batch est? incluido en una tanda global abierta',
        };
      }
    }

    // Eliminar tandas legacy del batch y sus decisiones
    const legacyRounds = await this.incomingRoundRepository.findByBatchId(batchId);
    const legacyRoundIds = legacyRounds.map((r) => r._id.toString());
    await this.incomingRoundItemRepository.deleteByRoundIds(legacyRoundIds);
    await this.incomingRoundRepository.deleteByBatchId(batchId);

    // Eliminar items y batch
    await this.incomingBatchItemRepository.deleteByBatchId(batchId);
    const deleted = await this.incomingBatchRepository.deleteById(batchId);
    return { success: deleted };
  }

  @Get('batch/:batchId')
  async getBatch(@Param('batchId') batchId: string) {
    const batch = await this.incomingBatchRepository.findById(batchId);
    if (!batch) throw new Error('Batch no encontrado');
    return {
      batch_id: batch._id.toString(),
      status: batch.status,
      purchase_date: batch.purchase_date,
      total_eur_cards_cost: batch.total_eur_cards_cost,
      total_cop_cards_cost: batch.total_cop_cards_cost,
      real_euro_rate_cop_per_eur: batch.real_euro_rate_cop_per_eur,
      created_at: batch.created_at,
    };
  }

  @Put('batch/:batchId')
  async updateBatch(
    @Param('batchId') batchId: string,
    @Body()
    body: {
      purchase_date?: string;
      total_cop_cards_cost?: number;
    },
  ): Promise<{ success: boolean; message?: string }> {
    const batch = await this.incomingBatchRepository.findById(batchId);
    if (!batch) return { success: false, message: 'Batch no encontrado' };

    const updateData: any = {};

    if (body.purchase_date != null) {
      const parsed = new Date(body.purchase_date);
      if (Number.isNaN(parsed.getTime())) {
        return { success: false, message: 'purchase_date inv?lido' };
      }
      updateData.purchase_date = parsed;
    }

    if (body.total_cop_cards_cost != null) {
      if (!Number.isFinite(body.total_cop_cards_cost) || body.total_cop_cards_cost <= 0) {
        return {
          success: false,
          message: 'total_cop_cards_cost debe ser mayor a 0',
        };
      }
      const newRate = body.total_cop_cards_cost / Number(batch.total_eur_cards_cost || 0);
      if (!Number.isFinite(newRate) || newRate <= 0) {
        return { success: false, message: 'No se pudo recalcular la tasa real' };
      }
      updateData.total_cop_cards_cost = body.total_cop_cards_cost;
      updateData.real_euro_rate_cop_per_eur = newRate;
      await this.incomingBatchItemRepository.updateUnitCostByBatchId(batchId, newRate);
    }

    await this.incomingBatchRepository.updateById(batchId, updateData);
    return { success: true };
  }

  @Get('batch/:batchId/rounds')
  async listRoundsForBatch(@Param('batchId') batchId: string) {
    const rounds = await this.incomingRoundRepository.findByBatchId(batchId);
    return rounds.map((r) => ({
      round_id: r._id.toString(),
      batch_id: r.batch_id,
      round_index: r.round_index,
      shipping_total_cop: r.shipping_total_cop,
      status: r.status,
      created_at: r.created_at,
      finalized_at: r.finalized_at ?? null,
    }));
  }

  @Get('batch/:batchId/items')
  async listBatchItems(@Param('batchId') batchId: string) {
    const items = await this.incomingBatchItemRepository.findByBatchId(batchId);
    return items.map((it) => ({
      batch_item_id: it._id.toString(),
      batch_id: it.batch_id,
      card_id: it.card_id,
      card_name: it.card_name ?? '',
      image_url: it.image_url ?? '',
      language: it.language,
      quantity_ordered: it.quantity_ordered,
      remaining_quantity: it.remaining_quantity,
      eur_total_lot: it.eur_total_lot,
      eur_unit_price: it.eur_unit_price,
      unit_cost_cop: it.unit_cost_cop,
      rareza: it.rareza ?? null,
    }));
  }

  @Get('batch/:batchId/round/:roundId')
  async getRoundReviewData(
    @Param('batchId') batchId: string,
    @Param('roundId') roundId: string,
  ) {
    const round = await this.incomingRoundRepository.findById(roundId);
    if (!round) throw new Error('Round no encontrada');
    if (round.batch_id !== batchId) throw new Error('Round no pertenece al batch');

    const items = await this.incomingBatchItemRepository.findByBatchId(batchId);
    const decisions = await this.incomingRoundItemRepository.findByRoundId(roundId);
    const decisionsMap = new Map<string, any>();
    decisions.forEach((d) => decisionsMap.set(d.batch_item_id, d));

    const arrivedTotalQuantity = items.reduce(
      (sum, it) => sum + (decisionsMap.get(it._id.toString())?.arrived_quantity ?? 0),
      0,
    );

    return {
      round_id: round._id.toString(),
      batch_id: batchId,
      shipping_total_cop: round.shipping_total_cop,
      round_status: round.status,
      arrived_total_quantity: arrivedTotalQuantity,
      items: items.map((it) => {
        const d = decisionsMap.get(it._id.toString());
        const arrived_quantity = d?.arrived_quantity ?? 0;
        const novedad_quantity = d?.novedad_quantity ?? 0;
        const novedad_notes = d?.novedad_notes ?? '';

        return {
          batch_item_id: it._id.toString(),
          card_id: it.card_id,
          card_name: it.card_name ?? '',
          image_url: it.image_url ?? '',
          language: it.language,
          quantity_ordered: it.quantity_ordered,
          remaining_quantity: it.remaining_quantity,
          unit_cost_cop: it.unit_cost_cop,
          rareza: it.rareza ?? null,
          arrived_quantity,
          novedad_quantity,
          novedad_notes,
        };
      }),
    };
  }

  @Post('batch/:batchId/round')
  async createRound(
    @Param('batchId') batchId: string,
    @Body() body: CreateIncomingRoundDto,
  ): Promise<{ round_id: string }> {
    const batch = await this.incomingBatchRepository.findById(batchId);
    if (!batch) throw new Error('Batch no encontrado');
    if (batch.status !== 'open') throw new Error('El batch no est? abierto');

    const shipping_total_cop = body?.shipping_total_cop;
    if (shipping_total_cop == null || shipping_total_cop <= 0) {
      throw new Error('shipping_total_cop es requerido y debe ser mayor a 0');
    }

    const rounds = await this.incomingRoundRepository.findByBatchId(batchId);
    const lastIndex = rounds.length ? Math.max(...rounds.map((r) => r.round_index)) : 0;
    const round = await this.incomingRoundRepository.create({
      batch_id: batchId,
      round_index: lastIndex + 1,
      shipping_total_cop,
    });

    return { round_id: round._id.toString() };
  }

  @Put('batch/:batchId/round/:roundId/review')
  async saveRoundReview(
    @Param('batchId') batchId: string,
    @Param('roundId') roundId: string,
    @Body() body: ReviewIncomingRoundDto,
  ): Promise<{ success: boolean }> {
    const round = await this.incomingRoundRepository.findById(roundId);
    if (!round) throw new Error('Round no encontrada');
    if (round.batch_id !== batchId) throw new Error('Round no pertenece al batch');
    if (round.status !== 'reviewing') throw new Error('Round ya est? finalizada');

    const batchItems = await this.incomingBatchItemRepository.findByBatchId(batchId);
    if (!Array.isArray(body.decisions)) {
      throw new Error('decisions es requerido');
    }

    const decisionsByBatchItemId = new Map<string, any>();
    for (const d of body.decisions) {
      if (!d.batch_item_id) throw new Error('batch_item_id es requerido en decisions');
      decisionsByBatchItemId.set(d.batch_item_id, d);
    }

    // Aseguramos consistencia: las decisiones deben incluir TODOS los batch items
    for (const it of batchItems) {
      const d = decisionsByBatchItemId.get(it._id.toString());
      if (!d) {
        throw new Error('decisions debe incluir todos los batch items');
      }
    }

    const upserts: BatchItemDecision[] = batchItems.map((it) => {
      const d = decisionsByBatchItemId.get(it._id.toString());
      const arrived_quantity = Number(d.arrived_quantity ?? 0);
      const novedad_quantity = Number(d.novedad_quantity ?? 0);
      const novedad_notes = (d.novedad_notes ?? '').toString();

      if (!Number.isFinite(arrived_quantity) || arrived_quantity < 0) {
        throw new Error('arrived_quantity inv?lido');
      }
      if (!Number.isFinite(novedad_quantity) || novedad_quantity < 0) {
        throw new Error('novedad_quantity inv?lido');
      }
      if (arrived_quantity > it.remaining_quantity) {
        throw new Error('arrived_quantity no puede superar remaining_quantity');
      }
      if (novedad_quantity > arrived_quantity) {
        throw new Error('novedad_quantity no puede superar arrived_quantity');
      }

      return {
        batchItemId: it._id.toString(),
        arrived_quantity,
        novedad_quantity,
        novedad_notes,
      };
    });

    await this.incomingRoundItemRepository.upsertManyDecisions(
      roundId,
      upserts.map((u) => ({
        batchItemId: u.batchItemId,
        arrived_quantity: u.arrived_quantity,
        novedad_quantity: u.novedad_quantity,
        novedad_notes: u.novedad_notes,
      })),
    );

    return { success: true };
  }

  @Post('batch/:batchId/round/:roundId/finalize')
  async finalizeRound(
    @Param('batchId') batchId: string,
    @Param('roundId') roundId: string,
  ): Promise<{ success: boolean; createdStockCount: number; arrivedTotalQuantity: number }> {
    const [round, batch, batchItems] = await Promise.all([
      this.incomingRoundRepository.findById(roundId),
      this.incomingBatchRepository.findById(batchId),
      this.incomingBatchItemRepository.findByBatchId(batchId),
    ]);

    if (!round) throw new Error('Round no encontrada');
    if (!batch) throw new Error('Batch no encontrada');
    if (round.batch_id !== batchId) throw new Error('Round no pertenece al batch');
    if (round.status !== 'reviewing') throw new Error('Round no est? en estado reviewing');

    const roundItems = await this.incomingRoundItemRepository.findByRoundId(roundId);
    const decisionsMap = new Map<string, any>();
    roundItems.forEach((d) => decisionsMap.set(d.batch_item_id, d));

    let arrivedTotalQuantity = 0;
    for (const it of batchItems) {
      const d = decisionsMap.get(it._id.toString());
      const arrived_quantity = Number(d?.arrived_quantity ?? 0);
      const novedad_quantity = Number(d?.novedad_quantity ?? 0);
      if (arrived_quantity > it.remaining_quantity) {
        throw new Error('arrived_quantity excede remaining_quantity (recalculo)');
      }
      if (novedad_quantity > arrived_quantity) {
        throw new Error('novedad_quantity excede arrived_quantity (recalculo)');
      }
      arrivedTotalQuantity += arrived_quantity;
    }

    if (arrivedTotalQuantity <= 0) {
      throw new Error('No hay cartas arribadas para convertir a stock en esta tanda');
    }

    const shipping_total_cop = round.shipping_total_cop;

    const stockDtos: StockDto[] = [];
    for (const it of batchItems) {
      const d = decisionsMap.get(it._id.toString());
      const arrived_quantity = Number(d?.arrived_quantity ?? 0);
      const novedad_quantity = Number(d?.novedad_quantity ?? 0);
      const novedad_notes = (d?.novedad_notes ?? '').toString();
      if (arrived_quantity <= 0) continue;

      const rarezaStock =
        it.rareza != null && String(it.rareza).trim() !== '' ? String(it.rareza).trim() : undefined;
      for (let i = 0; i < arrived_quantity; i++) {
        stockDtos.push({
          card_id: it.card_id,
          card_name: it.card_name ?? '',
          shipment: shipping_total_cop,
          unity_cost: it.unit_cost_cop,
          cards_in_shipmet: arrivedTotalQuantity,
          image_url: it.image_url ?? '',
          card_state: 'disponible',
          language: it.language,
          currency: 'COP',
          incoming_notes: i < novedad_quantity ? novedad_notes : '',
          rareza: rarezaStock,
        });
      }
    }

    const createdStocks = await this.stockRepository.createMany(stockDtos);

    // Actualizar remaining_quantity del batch
    await Promise.all(
      batchItems.map(async (it) => {
        const d = decisionsMap.get(it._id.toString());
        const arrived_quantity = Number(d?.arrived_quantity ?? 0);
        const newRemaining = it.remaining_quantity - arrived_quantity;
        if (newRemaining < 0) {
          throw new Error('remaining_quantity qued? negativo');
        }
        await this.incomingBatchItemRepository.updateRemainingQuantity(it._id.toString(), newRemaining);
      }),
    );

    const updatedItems = await this.incomingBatchItemRepository.findByBatchId(batchId);
    const remainingTotal = updatedItems.reduce((sum, i) => sum + (i.remaining_quantity || 0), 0);
    if (remainingTotal === 0) {
      await this.incomingBatchRepository.setStatus(batchId, 'completed');
    }

    await this.incomingRoundRepository.setFinalized(roundId);

    return {
      success: true,
      createdStockCount: createdStocks.length,
      arrivedTotalQuantity,
    };
  }
}

