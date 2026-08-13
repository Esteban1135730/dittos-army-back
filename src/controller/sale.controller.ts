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
import { SaleRepository } from 'src/repository/sale.repository';
import { ClientRepository } from 'src/repository/client.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { ReservaRepository } from 'src/repository/reserva.repository';
import {
  effectiveOperationalRarezaFromStock,
  resolvePvpForLine,
} from 'src/utils/pvp-resolve';
import { SaleDocument } from 'src/schema/sale.schema';
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';
import { isQuantityKind } from 'src/constants/bulk-product';
import {
  type OwnerKey,
  isOwnerKey,
} from 'src/config/owners.config';
import {
  getCurrentOwner,
  runWithOwnerAsync,
} from 'src/owner/owner-context';
import { enrichSaleCreatePayload } from 'src/utils/sale-cost-snapshot';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';
import type { Stock } from 'src/schema/stock.schema';

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

@Controller('sales')
export class SaleController {
  constructor(
    private readonly saleRepository: SaleRepository,
    private readonly clientRepository: ClientRepository,
    private readonly stockRepository: StockRepository,
    private readonly pvpRepository: PvpRepository,
    private readonly reservaRepository: ReservaRepository,
    private readonly tcgDexService: TCGDexService,
    private readonly cardStockTagRepository: CardStockTagRepository,
  ) {}

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
        this.sellBatchOneItem(item, itemOwner, remainingQtyByStockOwner),
      );
      results.push(result);
    }

    const sold_count = results.filter((r) => r.success).length;
    return {
      success: sold_count > 0,
      sold_count,
      results,
    };
  }

  private async sellBatchOneItem(
    item: {
      stock_id: string;
      amount_cop: number;
      notes?: string;
    },
    owner: OwnerKey,
    remainingQtyByStockOwner: Map<string, number>,
  ): Promise<{
    stock_id: string;
    success: boolean;
    message?: string;
    owner: OwnerKey;
  }> {
    const stockId = item.stock_id?.trim() ?? '';
    if (!stockId || !isValidObjectId(stockId)) {
      return {
        stock_id: stockId || '(vacío)',
        success: false,
        message: 'stock_id inválido',
        owner,
      };
    }
    if (item.amount_cop == null || item.amount_cop <= 0) {
      return {
        stock_id: stockId,
        success: false,
        message: 'amount_cop debe ser mayor a 0',
        owner,
      };
    }

    const stock = await this.stockRepository.findById(stockId);
    if (!stock) {
      return {
        stock_id: stockId,
        success: false,
        message: 'Stock no encontrado',
        owner,
      };
    }

    const cardState = (stock as { card_state?: string }).card_state ?? '';
    const productKind = (stock as { product_kind?: string }).product_kind;
    const isQty = isQuantityKind(productKind);
    const qtyKey = `${owner}:${stockId}`;

    if (!isQty && cardState === 'vendida') {
      return {
        stock_id: stockId,
        success: false,
        message: 'La carta ya está vendida',
        owner,
      };
    }
    if (cardState === 'propiedad') {
      return {
        stock_id: stockId,
        success: false,
        message: 'La carta está en propiedad',
        owner,
      };
    }
    if (
      cardState !== 'disponible' &&
      cardState !== 'en_stock_colombia' &&
      cardState !== 'reserva'
    ) {
      return {
        stock_id: stockId,
        success: false,
        message: 'Estado de stock no vendible',
        owner,
      };
    }

    if (isQty) {
      if (!remainingQtyByStockOwner.has(qtyKey)) {
        const q =
          typeof (stock as { quantity?: number }).quantity === 'number'
            ? (stock as { quantity: number }).quantity
            : 0;
        remainingQtyByStockOwner.set(qtyKey, q);
      }
      const remaining = remainingQtyByStockOwner.get(qtyKey) ?? 0;
      if (remaining < 1) {
        return {
          stock_id: stockId,
          success: false,
          message: 'Stock insuficiente',
          owner,
        };
      }

      try {
        const updated = await this.stockRepository.decrementQuantityAtomic(
          stockId,
          1,
        );
        if (!updated) {
          remainingQtyByStockOwner.set(qtyKey, 0);
          return {
            stock_id: stockId,
            success: false,
            message: 'Stock insuficiente',
            owner,
          };
        }
        remainingQtyByStockOwner.set(
          qtyKey,
          typeof (updated as { quantity?: number }).quantity === 'number'
            ? (updated as { quantity: number }).quantity
            : remaining - 1,
        );
        await this.saleRepository.create(
          await this.enrichVenta(
            {
              stock_id: stockId,
              card_id: stock.card_id,
              type: 'venta',
              amount_cop: Math.round(item.amount_cop),
              notes: item.notes ?? 'Venta asistida QR',
            },
            stock,
          ),
        );
        return { stock_id: stockId, success: true, owner };
      } catch {
        return {
          stock_id: stockId,
          success: false,
          message: 'Error al registrar la venta',
          owner,
        };
      }
    }

    try {
      await this.saleRepository.create(
        await this.enrichVenta(
          {
            stock_id: stockId,
            card_id: stock.card_id,
            type: 'venta',
            amount_cop: Math.round(item.amount_cop),
            notes: item.notes ?? 'Venta asistida QR',
          },
          stock,
        ),
      );
      await this.stockRepository.updateCardState(stockId, 'vendida');
      if (cardState === 'reserva') {
        await this.reservaRepository.deleteByStockId(stockId);
      }
      return { stock_id: stockId, success: true, owner };
    } catch {
      return {
        stock_id: stockId,
        success: false,
        message: 'Error al registrar la venta',
        owner,
      };
    }
  }

  @Get('dashboard')
  async getSalesDashboard() {
    const sales = await this.saleRepository.findActiveVentas();

    // Obtener información del stock para cada venta (y nombre/imagen desde TCGDex si no están en DB)
    const salesWithStockInfo = await Promise.all(
      sales.map(async (sale: SaleDocument) => {
        const stock = await this.stockRepository.findById(sale.stock_id);
        if (!stock) {
          return null;
        }

        // El nombre y la imagen suelen venir de TCGDex en el listado de stock, no se persisten en DB
        let cardName = stock.card_name || '';
        let imageUrl = stock.image_url || '';
        if (!cardName || !imageUrl) {
          const card = await this.tcgDexService.getCard(stock.card_id);
          if (card) {
            if (!cardName) cardName = card.name || '';
            if (!imageUrl && card.images?.small) imageUrl = card.images.small;
          }
        }

        // Calcular costo de compra
        const cardCost =
          stock.shipment / stock.cards_in_shipmet + stock.unity_cost;

        return {
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
        };
      }),
    );

    return salesWithStockInfo.filter((sale) => sale !== null);
  }

  @Get('consistency')
  async getSalesConsistency(): Promise<{
    stockVendidas: Array<{ _id: string; stock_id: string; card_id: string }>;
    salesVentas: Array<{
      _id: string;
      stock_id: string;
      card_id: string;
      amount_cop: number;
      created_at: Date;
    }>;
    onlyInStock: Array<{
      _id: string;
      stock_id: string;
      card_id: string;
      card_name?: string;
      image_url?: string;
    }>;
    onlyInSales: Array<{
      _id: string;
      stock_id: string;
      card_id: string;
      amount_cop: number;
      created_at: Date;
    }>;
    summary: {
      totalStockVendida: number;
      totalSales: number;
      onlyInStockCount: number;
      onlyInSalesCount: number;
      matchingCount: number;
    };
  }> {
    const [stockVendidas, salesVentas] = await Promise.all([
      this.stockRepository.findByCardState('vendida'),
      this.saleRepository.findActiveVentas(),
    ]);

    const stockVendidasNormalized = stockVendidas
      .map((s) => ({
        _id: (s as any)._id?.toString?.(),
        stock_id: (s as any)._id?.toString?.(),
        card_id: s.card_id,
      }))
      .filter((s) => s._id && s.stock_id);

    const salesVentasNormalized = salesVentas.map((s) => ({
      _id: (s as any)._id?.toString?.(),
      stock_id: s.stock_id,
      card_id: s.card_id,
      amount_cop: s.amount_cop,
      created_at: (s as any).created_at,
    }));

    const stockIds = new Set(stockVendidasNormalized.map((s) => s.stock_id));
    const saleStockIds = new Set(salesVentasNormalized.map((s) => s.stock_id));

    const onlyInStockRaw = stockVendidasNormalized.filter(
      (s) => !saleStockIds.has(s.stock_id),
    );
    const onlyInSales = salesVentasNormalized.filter(
      (s) => !stockIds.has(s.stock_id),
    );
    const matchingCount = stockVendidasNormalized.filter((s) =>
      saleStockIds.has(s.stock_id),
    ).length;

    // Enriquecer onlyInStock con datos de TCG Dex (nombre e imagen)
    const onlyInStock = await Promise.all(
      onlyInStockRaw.map(async (item) => {
        let card_name: string | undefined;
        let image_url: string | undefined;
        try {
          const card = await this.tcgDexService.getCard(item.card_id);
          if (card) {
            card_name = card.name || '';
            image_url = card.images?.small || card.images?.large || '';
          }
        } catch {
          // dejar vacío si falla la API
        }
        return { ...item, card_name, image_url };
      }),
    );

    return {
      stockVendidas: stockVendidasNormalized,
      salesVentas: salesVentasNormalized,
      onlyInStock,
      onlyInSales,
      summary: {
        totalStockVendida: stockVendidasNormalized.length,
        totalSales: salesVentasNormalized.length,
        onlyInStockCount: onlyInStock.length,
        onlyInSalesCount: onlyInSales.length,
        matchingCount,
      },
    };
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
    const sales = await this.saleRepository.findHistoricalVentas();

    const salesWithStockInfo = await Promise.all(
      sales.map(async (sale: SaleDocument) => {
        const stock = await this.stockRepository.findById(sale.stock_id);
        if (!stock) {
          return null;
        }

        let cardName = stock.card_name || '';
        let imageUrl = stock.image_url || '';
        if (!cardName || !imageUrl) {
          const card = await this.tcgDexService.getCard(stock.card_id);
          if (card) {
            if (!cardName) cardName = card.name || '';
            if (!imageUrl && card.images?.small) imageUrl = card.images.small;
          }
        }

        const cardCost =
          stock.shipment / stock.cards_in_shipmet + stock.unity_cost;

        return {
          _id: sale._id.toString(),
          stock_id: sale.stock_id,
          card_id: sale.card_id,
          type: sale.type,
          amount_cop: sale.amount_cop,
          notes: sale.notes || '',
          created_at: sale.created_at,
          cycle_closed_at: (sale as any).cycle_closed_at ?? null,
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
        };
      }),
    );

    return salesWithStockInfo.filter((sale) => sale !== null);
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
    const sales = await this.saleRepository.findVentasByClientId(clientId, {
      limit,
    });
    return sales.map((sale) => ({
      _id: (sale as any)._id.toString(),
      stock_id: sale.stock_id,
      card_id: sale.card_id,
      type: sale.type,
      amount_cop: sale.amount_cop,
      notes: sale.notes ?? '',
      created_at: sale.created_at,
      cycle_closed_at: (sale as any).cycle_closed_at ?? null,
      client_id: sale.client_id,
    }));
  }

  @Post('register-from-stock-with-pvp')
  async registerFromStockWithPvp(
    @Body() body: { stock_id: string },
  ): Promise<{ success: boolean; message?: string }> {
    if (!body.stock_id) {
      return { success: false, message: 'stock_id es requerido' };
    }
    const stock = await this.stockRepository.findById(body.stock_id);
    if (!stock) {
      return { success: false, message: 'Stock no encontrado' };
    }
    if (stock.card_state !== 'vendida') {
      return {
        success: false,
        message: 'La carta no está marcada como vendida en stock',
      };
    }
    const pvps = await this.pvpRepository.findAllByCardId(stock.card_id);
    const resolved = resolvePvpForLine(
      pvps,
      effectiveOperationalRarezaFromStock(stock as any),
    );
    if (!resolved) {
      return { success: false, message: 'No hay PVP asignado para esta carta' };
    }
    const amountCop = pvpToCop(resolved.pvp, resolved.pvp_currency ?? 'COP');
    await this.saleRepository.create(
      await this.enrichVenta(
        {
          stock_id: body.stock_id,
          card_id: stock.card_id,
          type: 'venta',
          amount_cop: amountCop,
          notes: `Registrado desde consistencia (venta al PVP: ${resolved.pvp} ${resolved.pvp_currency ?? 'COP'})`,
        },
        stock,
        { pvp_cop_snapshot: amountCop },
      ),
    );
    return { success: true };
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

    const updateData: any = {};
    if (body.amount_cop !== undefined) {
      updateData.amount_cop = body.amount_cop;
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
