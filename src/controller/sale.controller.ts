import { Body, Controller, Get, Post, Put, Delete, Param } from '@nestjs/common';
import { SaleRepository } from 'src/repository/sale.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { SaleDocument } from 'src/schema/sale.schema';

@Controller('sales')
export class SaleController {
  constructor(
    private readonly saleRepository: SaleRepository,
    private readonly stockRepository: StockRepository,
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
    const sales = await this.saleRepository.findByType('venta');
    
    // Obtener información del stock para cada venta
    const salesWithStockInfo = await Promise.all(
      sales.map(async (sale: SaleDocument) => {
        const stock = await this.stockRepository.findById(sale.stock_id);
        if (!stock) {
          return null;
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
            card_name: stock.card_name || '',
            image_url: stock.image_url || '',
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

