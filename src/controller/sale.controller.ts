import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { SaleLean, SaleRepository } from 'src/repository/sale.repository';
import { ClientRepository } from 'src/repository/client.repository';
import { StockLean, StockRepository } from 'src/repository/stock.repository';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { CardDto, TCGDexService } from 'src/pokemon';
import { mapWithConcurrency } from 'src/utils/concurrency';
import { StockCardImagesSyncService } from 'src/service/stock-card-images-sync.service';
import { isQuantityKind, isZeroProfitCardId } from 'src/constants/bulk-product';
import { type OwnerKey, isOwnerKey } from 'src/config/owners.config';
import { getCurrentOwner, runWithOwnerAsync } from 'src/owner/owner-context';
import {
  enrichSaleCreatePayload,
  effectiveSaleCostCop,
} from 'src/utils/sale-cost-snapshot';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';
import type { Stock } from 'src/schema/stock.schema';
import { SaleBatchService } from 'src/service/sale-batch.service';

const TCGDEX_FALLBACK_CONCURRENCY = 6;

/** `findById` castea a ObjectId (hex insensible a mayúsculas); el Map debe igualarlo. */
function stockLookupKey(id: string | undefined): string {
  return String(id ?? '')
    .trim()
    .toLowerCase();
}

@Controller('sales')
export class SaleController {
  constructor(
    private readonly saleRepository: SaleRepository,
    private readonly clientRepository: ClientRepository,
    private readonly stockRepository: StockRepository,
    private readonly reservaRepository: ReservaRepository,
    private readonly tcgDexService: TCGDexService,
    private readonly cardStockTagRepository: CardStockTagRepository,
    private readonly stockCardImagesSync: StockCardImagesSyncService,
    private readonly saleBatchService: SaleBatchService,
  ) {}

  private schedulePruneIfUnused(cardId: string | undefined): void {
    const id = String(cardId ?? '').trim();
    if (!id) return;
    void this.stockCardImagesSync.pruneIfCardUnused(id).catch(() => undefined);
  }

  private async tagsForCard(cardId: string): Promise<string[]> {
    const map = await this.cardStockTagRepository.findMapByCardIds([cardId]);
    return map.get(String(cardId ?? '').trim()) ?? [];
  }

  private async enrichVenta(
    base: Parameters<typeof enrichSaleCreatePayload>[0],
    stock: Stock & { _id?: unknown },
    opts?: Parameters<typeof enrichSaleCreatePayload>[2],
  ) {
    const tags_snapshot = await this.tagsForCard(stock.card_id);
    return enrichSaleCreatePayload(base, stock, {
      ...opts,
      tags_snapshot,
    });
  }

  @Post('keep')
  async keepCard(
    @Body()
    body: {
      stock_id: string;
      card_id: string;
      notes?: string;
    },
  ) {
    if (!body.stock_id || !body.card_id) {
      return { success: false, message: 'stock_id y card_id son requeridos' };
    }

    await this.saleRepository.create({
      stock_id: body.stock_id,
      card_id: body.card_id,
      type: 'propiedad',
      amount_cop: 0,
      notes: body.notes ?? '',
    });

    await this.stockRepository.updateCardState(body.stock_id, 'propiedad');

    return { success: true };
  }

  @Get('keep')
  async listKeepedCards() {
    return await this.saleRepository.findByType('propiedad');
  }

  /**
   * Eliminar definitivo: Sale type propiedad + hard delete del Stock.
   * Ruta estática `keep/:id` para no chocar con `DELETE /sales/:id`.
   */
  @Delete('keep/:id')
  async purgeKeep(@Param('id') id: string) {
    if (!id) {
      return { success: false, message: 'ID de venta es requerido' };
    }

    const sale = await this.saleRepository.findById(id);
    if (!sale) {
      return { success: false, message: 'Venta no encontrada' };
    }

    if (sale.type !== 'propiedad') {
      return {
        success: false,
        message: 'Solo se pueden eliminar registros de propiedad',
      };
    }

    const reserva = await this.reservaRepository.findByStockId(sale.stock_id);
    if (reserva) {
      return {
        success: false,
        message: 'No se puede eliminar: la carta tiene una reserva asociada',
      };
    }

    await this.saleRepository.delete(id);

    try {
      await this.stockRepository.deleteById(sale.stock_id);
      return { success: true };
    } catch {
      return {
        success: false,
        message: 'Sale eliminado, pero no se pudo borrar el stock',
      };
    }
  }

  @Post('sell')
  async sellCard(
    @Body()
    body: {
      stock_id: string;
      card_id: string;
      amount_cop: number;
      notes?: string;
      quantity?: number;
    },
  ) {
    if (!body.stock_id || !body.card_id || body.amount_cop === undefined) {
      return {
        success: false,
        message: 'stock_id, card_id y amount_cop son requeridos',
      };
    }

    const qtyRaw = body.quantity;
    const sellQty =
      qtyRaw === undefined || qtyRaw === null ? 1 : Number(qtyRaw);
    if (!Number.isInteger(sellQty) || sellQty < 1) {
      return {
        success: false,
        message: 'quantity debe ser un entero >= 1',
      };
    }

    const stock = await this.stockRepository.findById(body.stock_id);
    if (!stock) {
      return { success: false, message: 'Stock no encontrado' };
    }

    const cardState = (stock as { card_state?: string }).card_state ?? '';
    if (cardState === 'vendida') {
      return { success: false, message: 'La carta ya está vendida' };
    }
    if (cardState === 'propiedad') {
      return { success: false, message: 'La carta está en propiedad' };
    }
    if (
      cardState !== 'disponible' &&
      cardState !== 'en_stock_colombia' &&
      cardState !== 'reserva'
    ) {
      return { success: false, message: 'Estado de stock no vendible' };
    }

    if (isQuantityKind((stock as { product_kind?: string }).product_kind)) {
      if (body.amount_cop <= 0) {
        return { success: false, message: 'amount_cop debe ser mayor a 0' };
      }
      const available =
        typeof (stock as { quantity?: number }).quantity === 'number'
          ? (stock as { quantity: number }).quantity
          : 0;
      if (sellQty > available) {
        return {
          success: false,
          message: `Stock insuficiente (disponible: ${available})`,
        };
      }

      const updated = await this.stockRepository.decrementQuantityAtomic(
        body.stock_id,
        sellQty,
      );
      if (!updated) {
        return {
          success: false,
          message: 'Stock insuficiente',
        };
      }

      const amount = Math.round(body.amount_cop);
      const notes = body.notes ?? '';
      for (let i = 0; i < sellQty; i++) {
        await this.saleRepository.create(
          await this.enrichVenta(
            {
              stock_id: body.stock_id,
              card_id: body.card_id,
              type: 'venta',
              amount_cop: amount,
              notes,
            },
            stock,
          ),
        );
      }

      // No marcar vendida mientras quede cantidad > 0.
      this.schedulePruneIfUnused(body.card_id);
      return { success: true, sold_count: sellQty };
    }

    // unit (legacy): quantity debe ser 1
    if (sellQty !== 1) {
      return {
        success: false,
        message: 'quantity debe ser 1 para productos unitarios',
      };
    }

    await this.saleRepository.create(
      await this.enrichVenta(
        {
          stock_id: body.stock_id,
          card_id: body.card_id,
          type: 'venta',
          amount_cop: body.amount_cop,
          notes: body.notes ?? '',
        },
        stock,
      ),
    );

    await this.stockRepository.updateCardState(body.stock_id, 'vendida');

    this.schedulePruneIfUnused(body.card_id);
    return { success: true };
  }

  @Post('sell-batch')
  async sellBatch(
    @Body()
    body: {
      items?: Array<{
        stock_id: string;
        amount_cop: number;
        notes?: string;
        /** Owner de la línea (venta QR multi-DB). Si falta → X-Owner activo. */
        owner?: OwnerKey;
      }>;
    },
  ) {
    const items = body.items ?? [];
    const emptyResults: Array<{
      stock_id: string;
      success: boolean;
      message?: string;
      owner?: OwnerKey;
    }> = [];
    if (items.length === 0) {
      return {
        success: false,
        sold_count: 0,
        results: emptyResults,
        message: 'items es requerido y no puede estar vacío',
      };
    }

    type BatchResult = {
      stock_id: string;
      success: boolean;
      message?: string;
      owner: OwnerKey;
    };
    const results: BatchResult[] = [];
    const defaultOwner = getCurrentOwner();
    const soldCardIds = new Set<string>();

    // Preserve input order; process sequentially, switching owner context per item.
    const remainingQtyByStockOwner = new Map<string, number>();

    for (const item of items) {
      const stockId = item.stock_id?.trim() ?? '';
      let itemOwner: OwnerKey = defaultOwner;
      if (item.owner != null) {
        if (!isOwnerKey(item.owner)) {
          results.push({
            stock_id: stockId || '(vacío)',
            success: false,
            message: 'owner inválido',
            owner: defaultOwner,
          });
          continue;
        }
        itemOwner = item.owner;
      }

      const result = await runWithOwnerAsync(itemOwner, async () =>
        this.saleBatchService.sellOneItem(
          item,
          itemOwner,
          remainingQtyByStockOwner,
        ),
      );
      const { card_id: soldCardId, sale_id: _saleId, ...publicResult } = result;
      results.push(publicResult);
      if (result.success && soldCardId) soldCardIds.add(soldCardId);
    }

    for (const cardId of soldCardIds) {
      this.schedulePruneIfUnused(cardId);
    }

    const sold_count = results.filter((r) => r.success).length;
    return {
      success: sold_count > 0,
      sold_count,
      results,
    };
  }

  /** Una sola query `$in` para todas las líneas de stock de las ventas. */
  private async stockMapForSales(
    sales: Array<{ stock_id: string }>,
  ): Promise<Map<string, StockLean>> {
    const stocks = await this.stockRepository.findByIdsLean(
      sales.map((s) => s.stock_id),
    );
    return new Map(stocks.map((s) => [stockLookupKey(String(s._id)), s]));
  }

  /**
   * Fallback TCGdex de nombre/imagen: una llamada por `card_id` distinto,
   * con concurrencia limitada. `swallowErrors` → error por carta = sin datos.
   */
  private async tcgdexCardsById(
    cardIds: Iterable<string | undefined>,
    swallowErrors: boolean,
  ): Promise<Map<string, CardDto | undefined>> {
    const unique = [
      ...new Set([...cardIds].filter((id): id is string => !!id)),
    ];
    const cards = await mapWithConcurrency(
      unique,
      TCGDEX_FALLBACK_CONCURRENCY,
      async (cardId) => {
        if (!swallowErrors) return this.tcgDexService.getCard(cardId);
        try {
          return await this.tcgDexService.getCard(cardId);
        } catch {
          return undefined;
        }
      },
    );
    return new Map(unique.map((id, i) => [id, cards[i]]));
  }

  /** Ventas con su línea de stock (descarta las que no la tienen) + nombre/imagen resueltos. */
  private async joinSalesWithStock(sales: SaleLean[]) {
    const stockById = await this.stockMapForSales(sales);
    const joined = sales
      .map((sale) => ({
        sale,
        stock: stockById.get(stockLookupKey(sale.stock_id)),
      }))
      .filter(
        (row): row is { sale: SaleLean; stock: StockLean } => row.stock != null,
      );
    const cards = await this.tcgdexCardsById(
      joined
        .filter(({ stock }) => !stock.card_name || !stock.image_url)
        .map(({ stock }) => stock.card_id),
      false,
    );
    return joined.map(({ sale, stock }) => {
      // El nombre y la imagen suelen venir de TCGDex en el listado de stock, no se persisten en DB
      let cardName = stock.card_name || '';
      let imageUrl = stock.image_url || '';
      if (!cardName || !imageUrl) {
        const card = cards.get(stock.card_id);
        if (card) {
          if (!cardName) cardName = card.name || '';
          if (!imageUrl && card.images?.small) imageUrl = card.images.small;
        }
      }
      // Calcular costo de compra (envio: costo = precio → ganancia 0)
      const cardCost = effectiveSaleCostCop(
        sale.card_id ?? stock.card_id,
        sale.amount_cop,
        stock.shipment / stock.cards_in_shipmet + stock.unity_cost,
      );
      return { sale, stock, cardName, imageUrl, cardCost };
    });
  }

  @Get('dashboard')
  async getSalesDashboard() {
    const sales = await this.saleRepository.findActiveVentasLean();
    const rows = await this.joinSalesWithStock(sales);
    return rows.map(({ sale, stock, cardName, imageUrl, cardCost }) => ({
      _id: sale._id.toString(),
      stock_id: sale.stock_id,
      card_id: sale.card_id,
      type: sale.type,
      amount_cop: sale.amount_cop,
      notes: sale.notes || '',
      created_at: sale.created_at,
      stock_info: {
        card_name: cardName,
        image_url: imageUrl,
        card_cost: cardCost,
        currency: stock.currency,
        shipment: stock.shipment,
        cards_in_shipmet: stock.cards_in_shipmet,
        unity_cost: stock.unity_cost,
      },
    }));
  }

  @Post('close-cycle')
  async closeCycle(): Promise<{
    success: boolean;
    closedCount?: number;
    message?: string;
  }> {
    const closedCount = await this.saleRepository.closeCurrentCycle();
    return { success: true, closedCount };
  }

  @Post('finalize-cycle/:id')
  async finalizeCycleForSale(
    @Param('id') id: string,
  ): Promise<{ success: boolean; closed?: boolean; message?: string }> {
    if (!isValidObjectId(id)) {
      return { success: false, message: 'ID de venta inválido' };
    }
    const result = await this.saleRepository.finalizeCycleForSale(id);
    if (result === 'not_found') {
      return { success: false, message: 'Venta no encontrada' };
    }
    if (result === 'wrong_type') {
      return {
        success: false,
        message: 'Solo se puede finalizar el ciclo de ventas de tipo venta',
      };
    }
    if (result === 'already_closed') {
      return {
        success: true,
        closed: false,
        message: 'La venta ya estaba en histórico',
      };
    }
    return { success: true, closed: true };
  }

  @Get('history')
  async getSalesHistory() {
    const sales = await this.saleRepository.findHistoricalVentasLean();
    const rows = await this.joinSalesWithStock(sales);
    return rows.map(({ sale, stock, cardName, imageUrl, cardCost }) => ({
      _id: sale._id.toString(),
      stock_id: sale.stock_id,
      card_id: sale.card_id,
      type: sale.type,
      amount_cop: sale.amount_cop,
      notes: sale.notes || '',
      created_at: sale.created_at,
      cycle_closed_at: sale.cycle_closed_at ?? null,
      stock_info: {
        card_name: cardName,
        image_url: imageUrl,
        card_cost: cardCost,
        currency: stock.currency,
        language: String(stock.language ?? stock.languaje ?? '').trim(),
        shipment: stock.shipment,
        cards_in_shipmet: stock.cards_in_shipmet,
        unity_cost: stock.unity_cost,
      },
    }));
  }

  private async enrichVentasClienteRows(sales: SaleLean[]) {
    const stockById = await this.stockMapForSales(sales);
    const base = sales.map((sale) => {
      const stock = stockById.get(stockLookupKey(sale.stock_id));
      return {
        sale,
        cardName: stock?.card_name ?? '',
        imageUrl: stock?.image_url ?? '',
        cardId: sale.card_id ?? stock?.card_id ?? '',
      };
    });
    const cards = await this.tcgdexCardsById(
      base
        .filter((r) => (!r.cardName || !r.imageUrl) && r.cardId)
        .map((r) => r.cardId),
      true,
    );
    return base.map(({ sale, cardName, imageUrl, cardId }) => {
      if ((!cardName || !imageUrl) && cardId) {
        const card = cards.get(cardId);
        if (card) {
          if (!cardName) cardName = card.name ?? '';
          if (!imageUrl && card.images?.small) imageUrl = card.images.small;
        }
      }
      return {
        _id: sale._id.toString(),
        stock_id: sale.stock_id,
        card_id: cardId,
        card_name: cardName || undefined,
        image_url: imageUrl || undefined,
        type: sale.type,
        amount_cop: sale.amount_cop,
        notes: sale.notes ?? '',
        created_at: sale.created_at,
        cycle_closed_at: sale.cycle_closed_at ?? null,
        client_id: sale.client_id,
      };
    });
  }

  @Get('by-client/:clientId')
  async listVentasByCliente(
    @Param('clientId') clientId: string,
    @Query('limit') limitRaw?: string,
  ) {
    if (!isValidObjectId(clientId)) {
      return { success: false, message: 'clientId inválido' };
    }
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      return { success: false, message: 'Cliente no encontrado' };
    }
    let limit = parseInt(String(limitRaw ?? '50'), 10);
    if (Number.isNaN(limit) || limit < 1) limit = 50;
    limit = Math.min(Math.max(limit, 1), 200);
    const sales = await this.saleRepository.findVentasByClientIdLean(clientId, {
      limit,
    });
    return this.enrichVentasClienteRows(sales);
  }

  @Post('reopen/:id')
  async reopenSale(
    @Param('id') id: string,
  ): Promise<{ success: boolean; message?: string }> {
    if (!id) {
      return { success: false, message: 'ID de venta es requerido' };
    }
    const reopened = await this.saleRepository.reopenSale(id);
    if (!reopened) {
      return {
        success: false,
        message: 'Venta no encontrada o no está en histórico',
      };
    }
    return { success: true };
  }

  @Put(':id')
  async updateSale(
    @Param('id') id: string,
    @Body()
    body: {
      amount_cop?: number;
      notes?: string;
    },
  ) {
    if (!id) {
      return { success: false, message: 'ID de venta es requerido' };
    }

    const sale = await this.saleRepository.findById(id);
    if (!sale) {
      return { success: false, message: 'Venta no encontrada' };
    }

    const updateData: Record<string, unknown> = {};
    if (body.amount_cop !== undefined) {
      updateData.amount_cop = body.amount_cop;
      if (isZeroProfitCardId(sale.card_id)) {
        updateData.cost_cop_snapshot = effectiveSaleCostCop(
          sale.card_id,
          body.amount_cop,
          0,
        );
      }
    }
    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }

    await this.saleRepository.update(id, updateData);

    return { success: true };
  }

  @Delete(':id')
  async undoSale(@Param('id') id: string) {
    if (!id) {
      return { success: false, message: 'ID de venta es requerido' };
    }

    const sale = await this.saleRepository.findById(id);
    if (!sale) {
      return { success: false, message: 'Venta no encontrada' };
    }

    // Eliminar la venta
    await this.saleRepository.delete(id);

    // Cambiar el estado de la carta de vuelta a disponible
    await this.stockRepository.updateCardState(sale.stock_id, 'disponible');

    return { success: true };
  }
}
