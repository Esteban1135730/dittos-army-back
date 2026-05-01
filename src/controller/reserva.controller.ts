import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { Reserva } from 'src/schema/reserva.schema';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { SaleRepository } from 'src/repository/sale.repository';
import { ReservaDto } from 'src/Dto/reserva.dto';
import { effectiveOperationalRarezaFromStock } from 'src/utils/pvp-resolve';

const ESTADO_RESERVA = 'reserva';
const ESTADO_DISPONIBLE = 'disponible';
const ESTADO_VENDIDA = 'vendida';

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

@Controller('reserva')
export class ReservaController {
  constructor(
    private readonly reservaRepository: ReservaRepository,
    private readonly stockRepository: StockRepository,
    private readonly pvpRepository: PvpRepository,
    private readonly saleRepository: SaleRepository,
  ) {}

  @Post()
  async create(@Body() dto: ReservaDto): Promise<Reserva | { error: string }> {
    if (!dto.client_id || !dto.stock_id || dto.precio == null) {
      throw new Error('client_id, stock_id y precio son requeridos');
    }
    const stock = await this.stockRepository.findById(dto.stock_id);
    if (!stock) {
      return { error: 'Stock no encontrado' };
    }
    if (stock.card_state === ESTADO_RESERVA) {
      return { error: 'La carta ya está reservada' };
    }
    if (stock.card_state === 'vendida' || stock.card_state === 'propiedad') {
      return { error: 'La carta no está disponible para reservar' };
    }
    const existing = await this.reservaRepository.findByStockId(dto.stock_id);
    if (existing) {
      return { error: 'Ya existe una reserva para esta carta' };
    }
    const reserva = await this.reservaRepository.create({
      ...dto,
      currency: dto.currency ?? 'COP',
    });
    await this.stockRepository.updateCardState(dto.stock_id, ESTADO_RESERVA);
    return reserva;
  }

  @Get()
  async findAll(): Promise<Reserva[]> {
    return this.reservaRepository.findAll();
  }

  @Get('client/:clientId')
  async findByClient(@Param('clientId') clientId: string): Promise<Reserva[]> {
    return this.reservaRepository.findByClientId(clientId);
  }

  @Delete('stock/:stockId')
  async cancelByStockId(
    @Param('stockId') stockId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const reserva = await this.reservaRepository.findByStockId(stockId);
    if (!reserva) {
      return { success: false, error: 'Reserva no encontrada' };
    }
    await this.reservaRepository.deleteByStockId(stockId);
    await this.stockRepository.updateCardState(stockId, ESTADO_DISPONIBLE);
    return { success: true };
  }

  @Put('stock/:stockId')
  async updatePrecioByStockId(
    @Param('stockId') stockId: string,
    @Body() body: { precio: number; currency?: string },
  ): Promise<Reserva | { error: string }> {
    if (body.precio == null || body.precio < 0) {
      throw new Error('precio es requerido y debe ser mayor o igual a 0');
    }
    const reserva = await this.reservaRepository.findByStockId(stockId);
    if (!reserva) {
      return { error: 'Reserva no encontrada' };
    }
    const updated = await this.reservaRepository.updateByStockId(stockId, {
      precio: body.precio,
      currency: body.currency ?? reserva.currency,
    });
    return updated ?? { error: 'Error al actualizar' };
  }

  @Post('client/:clientId/finalizar-venta')
  async finalizarVenta(@Param('clientId') clientId: string): Promise<{ success: boolean; vendidas?: number; error?: string }> {
    const reservas = await this.reservaRepository.findByClientId(clientId);
    if (!reservas || reservas.length === 0) {
      return { success: false, error: 'El cliente no tiene reservas' };
    }
    for (const reserva of reservas) {
      const stock = await this.stockRepository.findById(reserva.stock_id);
      if (!stock) {
        return { success: false, error: `Stock no encontrado: ${reserva.stock_id}` };
      }
      const amountCop = precioToCop(reserva.precio, reserva.currency ?? 'COP');
      await this.saleRepository.create({
        stock_id: reserva.stock_id,
        card_id: stock.card_id,
        type: 'venta',
        amount_cop: amountCop,
        notes: `Venta finalizada desde reserva (cliente ${clientId}). Precio original: ${reserva.precio} ${reserva.currency ?? 'COP'}.`,
      });
      await this.stockRepository.updateCardState(reserva.stock_id, ESTADO_VENDIDA);
      await this.pvpRepository.update({
        card_id: stock.card_id,
        pvp: reserva.precio,
        currency: reserva.currency ?? 'COP',
        rareza: effectiveOperationalRarezaFromStock(stock as any),
      });
      await this.reservaRepository.deleteByStockId(reserva.stock_id);
    }
    return { success: true, vendidas: reservas.length };
  }
}
