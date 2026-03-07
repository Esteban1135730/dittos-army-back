import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { Reserva } from 'src/schema/reserva.schema';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { ReservaDto } from 'src/Dto/reserva.dto';

const ESTADO_RESERVA = 'reserva';
const ESTADO_DISPONIBLE = 'disponible';

@Controller('reserva')
export class ReservaController {
  constructor(
    private readonly reservaRepository: ReservaRepository,
    private readonly stockRepository: StockRepository,
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
}
