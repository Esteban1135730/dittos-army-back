import {
  BadRequestException,
  Body,
  ConflictException,
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
import { ReservaDto } from 'src/Dto/reserva.dto';
import { IncomingReservationService } from 'src/service/incoming-reservation.service';
import { PedidoService } from 'src/service/pedido.service';
import { StoreWhatsAppReservationImportService } from 'src/service/store-whatsapp-reservation-import.service';
import { isQuantityKind } from 'src/constants/bulk-product';
import type { Stock } from 'src/schema/stock.schema';

function reservaQty(quantity: number | undefined): number {
  if (typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= 1) {
    return quantity;
  }
  return 1;
}

const ESTADO_RESERVA = 'reserva';
const ESTADO_DISPONIBLE = 'disponible';

@Controller('reserva')
export class ReservaController {
  constructor(
    private readonly reservaRepository: ReservaRepository,
    private readonly stockRepository: StockRepository,
    private readonly incomingReservationService: IncomingReservationService,
    private readonly storeWhatsAppImportService: StoreWhatsAppReservationImportService,
    private readonly pedidoService: PedidoService,
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
    if (isQuantityKind((stock as { product_kind?: string }).product_kind)) {
      return this.createQuantityReserva(dto, stock);
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
    const pedido = await this.pedidoService.requireReservadoPedido(
      dto.client_id,
      dto.pedido_id,
    );
    const reserva = await this.reservaRepository.create({
      ...dto,
      pedido_id: String(pedido._id),
      currency: dto.currency ?? 'COP',
    });
    await this.stockRepository.updateCardState(dto.stock_id, ESTADO_RESERVA);
    return reserva;
  }

  /** Reserva de SKU con cantidad (bulk): no bloquea la línea; varios clientes pueden reservar. */
  private async createQuantityReserva(
    dto: ReservaDto,
    stock: Stock,
  ): Promise<Reserva | { error: string }> {
    if (stock.card_state === 'vendida' || stock.card_state === 'propiedad') {
      return { error: 'La carta no está disponible para reservar' };
    }
    if (stock.card_state === ESTADO_RESERVA) {
      await this.stockRepository.updateCardState(dto.stock_id, ESTADO_DISPONIBLE);
    }
    const qtyRaw = dto.quantity;
    const qty = qtyRaw === undefined || qtyRaw === null ? 1 : Number(qtyRaw);
    if (!Number.isInteger(qty) || qty < 1) {
      return { error: 'quantity debe ser un entero >= 1' };
    }
    const available =
      typeof (stock as { quantity?: number }).quantity === 'number'
        ? (stock as { quantity: number }).quantity
        : 0;
    if (qty > available) {
      return { error: `Stock insuficiente (disponible: ${available})` };
    }
    const pedido = await this.pedidoService.requireReservadoPedido(
      dto.client_id,
      dto.pedido_id,
    );
    const pedidoId = String(pedido._id);
    const existing = await this.reservaRepository.findByClientAndStockId(
      dto.client_id,
      dto.stock_id,
    );
    if (existing) {
      const existingPedido = (existing as { pedido_id?: string }).pedido_id;
      if (existingPedido && existingPedido !== pedidoId) {
        throw new ConflictException(
          'Ya hay una reserva de este stock en otro pedido; no se mezclan cantidades',
        );
      }
    }
    const decremented = await this.stockRepository.decrementQuantityAtomic(
      dto.stock_id,
      qty,
    );
    if (!decremented) {
      return { error: 'Stock insuficiente' };
    }
    if (existing) {
      const id = String((existing as { _id?: unknown })._id ?? '');
      const updated = await this.reservaRepository.addQuantity(id, qty);
      return updated ?? existing;
    }
    return this.reservaRepository.create({
      ...dto,
      pedido_id: pedidoId,
      currency: dto.currency ?? 'COP',
      quantity: qty,
    });
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
    @Query('client_id') clientId?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const reserva = clientId?.trim()
      ? await this.reservaRepository.findByClientAndStockId(
          clientId.trim(),
          stockId,
        )
      : await this.reservaRepository.findByStockId(stockId);
    if (!reserva) {
      return { success: false, error: 'Reserva no encontrada' };
    }
    await this.pedidoService.assertReservaLineMutable(reserva);
    const stock = await this.stockRepository.findById(stockId);
    const reservaId = String((reserva as { _id?: unknown })._id ?? '');
    if (stock && isQuantityKind((stock as { product_kind?: string }).product_kind)) {
      const held = reservaQty(reserva.quantity);
      await this.stockRepository.incrementQuantityAtomic(stockId, held);
      if (reservaId) {
        await this.reservaRepository.deleteById(reservaId);
      } else {
        await this.reservaRepository.deleteByStockId(stockId);
      }
      return { success: true };
    }
    await this.reservaRepository.deleteByStockId(stockId);
    await this.stockRepository.updateCardState(stockId, ESTADO_DISPONIBLE);
    return { success: true };
  }

  @Put('stock/:stockId')
  async updatePrecioByStockId(
    @Param('stockId') stockId: string,
    @Query('client_id') clientId: string | undefined,
    @Body() body: { precio: number; currency?: string },
  ): Promise<Reserva | { error: string }> {
    if (body.precio == null || body.precio < 0) {
      throw new Error('precio es requerido y debe ser mayor o igual a 0');
    }
    const reserva = clientId?.trim()
      ? await this.reservaRepository.findByClientAndStockId(
          clientId.trim(),
          stockId,
        )
      : await this.reservaRepository.findByStockId(stockId);
    if (!reserva) {
      return { error: 'Reserva no encontrada' };
    }
    await this.pedidoService.assertReservaLineMutable(reserva);
    const updated = clientId?.trim()
      ? await this.reservaRepository.updateByClientAndStockId(
          clientId.trim(),
          stockId,
          {
            precio: body.precio,
            currency: body.currency ?? reserva.currency,
          },
        )
      : await this.reservaRepository.updateByStockId(stockId, {
          precio: body.precio,
          currency: body.currency ?? reserva.currency,
        });
    return updated ?? { error: 'Error al actualizar' };
  }

  @Post('client/:clientId/finalizar-venta')
  async finalizarVenta(
    @Param('clientId') clientId: string,
  ): Promise<{ success: boolean; vendidas?: number; error?: string }> {
    return this.pedidoService.pagarReservadoDeCliente(clientId);
  }
}
