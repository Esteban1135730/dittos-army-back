import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Reserva } from 'src/schema/reserva.schema';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { SaleRepository } from 'src/repository/sale.repository';
import { ReservaDto } from 'src/Dto/reserva.dto';
import { IncomingReservationService } from 'src/service/incoming-reservation.service';
import { StoreWhatsAppReservationImportService } from 'src/service/store-whatsapp-reservation-import.service';
import { precioToCop } from 'src/utils/precio-to-cop';
import { enrichSaleCreatePayload } from 'src/utils/sale-cost-snapshot';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';

const ESTADO_RESERVA = 'reserva';
const ESTADO_DISPONIBLE = 'disponible';
const ESTADO_VENDIDA = 'vendida';

@Controller('reserva')
export class ReservaController {
  constructor(
    private readonly reservaRepository: ReservaRepository,
    private readonly stockRepository: StockRepository,
    private readonly saleRepository: SaleRepository,
    private readonly incomingReservationService: IncomingReservationService,
    private readonly storeWhatsAppImportService: StoreWhatsAppReservationImportService,
    private readonly cardStockTagRepository: CardStockTagRepository,
  ) {}

  @Post('import-store-whatsapp/preview')
  async previewImportStoreWhatsApp(
    @Body() body: { client_id?: string; message?: string },
  ) {
    const client_id = body?.client_id?.trim();
    const message = body?.message ?? '';
    if (!client_id) {
      throw new BadRequestException('client_id es requerido');
    }
    return this.storeWhatsAppImportService.preview(client_id, message);
  }

  @Post('import-store-whatsapp')
  async importStoreWhatsApp(
    @Body() body: { client_id?: string; message?: string },
  ) {
    const client_id = body?.client_id?.trim();
    const message = body?.message ?? '';
    if (!client_id) {
      throw new BadRequestException('client_id es requerido');
    }
    return this.storeWhatsAppImportService.import(client_id, message);
  }

  @Post('incoming')
  async createReservaIncoming(
    @Body()
    body: {
      client_id?: string;
      batch_item_id?: string;
      card_id?: string;
      language?: string;
      rareza?: string | null;
      quantity?: number;
    },
  ): Promise<Record<string, unknown>> {
    const client_id = body?.client_id?.trim();
    const quantity = body?.quantity;
    if (!client_id || quantity == null) {
      throw new BadRequestException('client_id y quantity son requeridos');
    }
    const batch_item_id = body?.batch_item_id?.trim();
    if (batch_item_id) {
      return this.incomingReservationService.addQuantity(
        client_id,
        batch_item_id,
        Number(quantity),
      );
    }
    const card_id = body?.card_id?.trim();
    const language = body?.language?.trim();
    if (card_id && language != null && language !== '') {
      return this.incomingReservationService.addQuantityByCardVariant(
        client_id,
        card_id,
        language,
        body.rareza,
        Number(quantity),
      );
    }
    throw new BadRequestException(
      'Indica batch_item_id o bien card_id + language (y rareza opcional) para reservar por variante',
    );
  }

  @Get('incoming')
  async listReservaIncoming(@Query('client_id') clientId?: string) {
    return this.incomingReservationService.listIncoming(
      clientId?.trim() || undefined,
    );
  }

  @Patch('incoming/:id')
  async patchReservaIncoming(
    @Param('id') id: string,
    @Body() body: { quantity?: number },
  ) {
    if (body?.quantity == null) {
      throw new BadRequestException('quantity es requerido');
    }
    return this.incomingReservationService.setAbsoluteQuantity(
      id,
      Number(body.quantity),
    );
  }

  @Delete('incoming/:id')
  async deleteReservaIncoming(
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    const ok = await this.incomingReservationService.deleteById(id);
    return { success: ok };
  }

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
  async finalizarVenta(
    @Param('clientId') clientId: string,
  ): Promise<{ success: boolean; vendidas?: number; error?: string }> {
    const reservas = await this.reservaRepository.findByClientId(clientId);
    if (!reservas || reservas.length === 0) {
      return { success: false, error: 'El cliente no tiene reservas' };
    }
    for (const reserva of reservas) {
      const stock = await this.stockRepository.findById(reserva.stock_id);
      if (!stock) {
        return {
          success: false,
          error: `Stock no encontrado: ${reserva.stock_id}`,
        };
      }
      const amountCop = precioToCop(reserva.precio, reserva.currency ?? 'COP');
      const tagsMap = await this.cardStockTagRepository.findMapByCardIds([
        stock.card_id,
      ]);
      await this.saleRepository.create(
        enrichSaleCreatePayload(
          {
            stock_id: reserva.stock_id,
            card_id: stock.card_id,
            type: 'venta',
            amount_cop: amountCop,
            client_id: clientId,
            notes: `Venta finalizada desde reserva (cliente ${clientId}). Precio original: ${reserva.precio} ${reserva.currency ?? 'COP'}.`,
          },
          stock,
          {
            tags_snapshot: tagsMap.get(String(stock.card_id).trim()) ?? [],
          },
        ),
      );
      await this.stockRepository.updateCardState(
        reserva.stock_id,
        ESTADO_VENDIDA,
      );
      await this.reservaRepository.deleteByStockId(reserva.stock_id);
    }
    return { success: true, vendidas: reservas.length };
  }
}
