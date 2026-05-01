import { Body, Controller, Get, Post, Put, Delete, Param } from '@nestjs/common';
import { SaleRepository } from 'src/repository/sale.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import {
  effectiveOperationalRarezaFromStock,
  resolvePvpForLine,
} from 'src/utils/pvp-resolve';
import { SaleDocument } from 'src/schema/sale.schema';
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';

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
    private readonly stockRepository: StockRepository,
    private readonly pvpRepository: PvpRepository,
    private readonly tcgDexService: TCGDexService,
  ) {}

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

  @Post('sell')
  async sellCard(
    @Body()
    body: {
      stock_id: string;
      card_id: string;
      amount_cop: number;
      notes?: string;
    },
  ) {
    if (!body.stock_id || !body.card_id || body.amount_cop === undefined) {
      return { success: false, message: 'stock_id, card_id y amount_cop son requeridos' };
    }

    await this.saleRepository.create({
      stock_id: body.stock_id,
      card_id: body.card_id,
      type: 'venta',
      amount_cop: body.amount_cop,
      notes: body.notes ?? '',
    });

    await this.stockRepository.updateCardState(body.stock_id, 'vendida');

    return { success: true };
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
        const cardCost = stock.shipment / stock.cards_in_shipmet + stock.unity_cost;

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
      })
    );

    return salesWithStockInfo.filter((sale) => sale !== null);
  }

  @Get('consistency')
  async getSalesConsistency(): Promise<{
    stockVendidas: Array<{ _id: string; stock_id: string; card_id: string }>;
    salesVentas: Array<{ _id: string; stock_id: string; card_id: string; amount_cop: number; created_at: Date }>;
    onlyInStock: Array<{ _id: string; stock_id: string; card_id: string; card_name?: string; image_url?: string }>;
    onlyInSales: Array<{ _id: string; stock_id: string; card_id: string; amount_cop: number; created_at: Date }>;
    summary: { totalStockVendida: number; totalSales: number; onlyInStockCount: number; onlyInSalesCount: number; matchingCount: number };
  }> {
    const [stockVendidas, salesVentas] = await Promise.all([
      this.stockRepository.findByCardState('vendida'),
      this.saleRepository.findActiveVentas(),
    ]);

    const stockVendidasNormalized = stockVendidas.map((s) => ({
      _id: (s as any)._id?.toString?.(),
      stock_id: (s as any)._id?.toString?.(),
      card_id: s.card_id,
    })).filter((s) => s._id && s.stock_id);

    const salesVentasNormalized = salesVentas.map((s) => ({
      _id: (s as any)._id?.toString?.(),
      stock_id: s.stock_id,
      card_id: s.card_id,
      amount_cop: s.amount_cop,
      created_at: (s as any).created_at,
    }));

    const stockIds = new Set(stockVendidasNormalized.map((s) => s.stock_id));
    const saleStockIds = new Set(salesVentasNormalized.map((s) => s.stock_id));

    const onlyInStockRaw = stockVendidasNormalized.filter((s) => !saleStockIds.has(s.stock_id));
    const onlyInSales = salesVentasNormalized.filter((s) => !stockIds.has(s.stock_id));
    const matchingCount = stockVendidasNormalized.filter((s) => saleStockIds.has(s.stock_id)).length;

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
  async closeCycle(): Promise<{ success: boolean; closedCount?: number; message?: string }> {
    const closedCount = await this.saleRepository.closeCurrentCycle();
    return { success: true, closedCount };
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

        const cardCost = stock.shipment / stock.cards_in_shipmet + stock.unity_cost;

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
            shipment: stock.shipment,
            cards_in_shipmet: stock.cards_in_shipmet,
            unity_cost: stock.unity_cost,
          },
        };
      })
    );

    return salesWithStockInfo.filter((sale) => sale !== null);
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
      return { success: false, message: 'La carta no está marcada como vendida en stock' };
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
    await this.saleRepository.create({
      stock_id: body.stock_id,
      card_id: stock.card_id,
      type: 'venta',
      amount_cop: amountCop,
      notes: `Registrado desde consistencia (venta al PVP: ${resolved.pvp} ${resolved.pvp_currency ?? 'COP'})`,
    });
    return { success: true };
  }

  @Post('reopen/:id')
  async reopenSale(@Param('id') id: string): Promise<{ success: boolean; message?: string }> {
    if (!id) {
      return { success: false, message: 'ID de venta es requerido' };
    }
    const reopened = await this.saleRepository.reopenSale(id);
    if (!reopened) {
      return { success: false, message: 'Venta no encontrada o no está en histórico' };
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

