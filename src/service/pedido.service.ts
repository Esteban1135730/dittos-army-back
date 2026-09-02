import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import {
  PedidoCalendarioItemDto,
  PedidoCalendarioResponseDto,
  PedidoCreateDto,
  PedidoLineDto,
  PedidoMapaDto,
  PedidoPatchDto,
  PedidoResponseDto,
} from 'src/Dto/pedido.dto';
import { ClientRepository } from 'src/repository/client.repository';
import { PedidoRepository } from 'src/repository/pedido.repository';
import { PedidoAbonoRepository } from 'src/repository/pedido-abono.repository';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { SaleRepository } from 'src/repository/sale.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';
import {
  PedidoDocument,
  PedidoLineSnapshot,
} from 'src/schema/pedido.schema';
import { Reserva } from 'src/schema/reserva.schema';
import { Stock } from 'src/schema/stock.schema';
import { precioToCop } from 'src/utils/precio-to-cop';
import { enrichSaleCreatePayload } from 'src/utils/sale-cost-snapshot';
import { isQuantityKind } from 'src/constants/bulk-product';
import {
  TIENDAS_ENTREGA,
  getTiendaEntrega,
  isCiudadBogota,
  isTiendaEntregaId,
} from 'src/utils/tiendas-entrega';

const CALENDARIO_MAX_DAYS = 62;
const CALENDARIO_PENDIENTE = new Set(['reservado', 'pagado']);

const ESTADO_VENDIDA = 'vendida';
const ESTADO_DISPONIBLE = 'disponible';

function reservaQty(quantity: number | undefined): number {
  if (typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= 1) {
    return quantity;
  }
  return 1;
}

type EntregaFields = {
  entrega_en_tienda: boolean;
  store_id?: string;
  store_name?: string;
  store_address?: string;
  ciudad?: string;
  direccion_o_punto?: string;
  notas_entrega?: string;
};

@Injectable()
export class PedidoService {
  constructor(
    private readonly pedidoRepository: PedidoRepository,
    private readonly clientRepository: ClientRepository,
    private readonly reservaRepository: ReservaRepository,
    private readonly stockRepository: StockRepository,
    private readonly saleRepository: SaleRepository,
    private readonly cardStockTagRepository: CardStockTagRepository,
    private readonly pedidoAbonoRepository: PedidoAbonoRepository,
  ) {}

  listTiendas() {
    return TIENDAS_ENTREGA.map((t) => ({
      id: t.id,
      name: t.name,
      address: t.address,
      lat: t.lat,
      lng: t.lng,
    }));
  }

  async listCalendario(
    fromRaw?: string,
    toRaw?: string,
  ): Promise<PedidoCalendarioResponseDto> {
    const fromStr = fromRaw?.trim() ?? '';
    const toStr = toRaw?.trim() ?? '';
    if (!fromStr || !toStr) {
      throw new BadRequestException('from y to son requeridos');
    }
    const fromDay = this.parseFechaDia(fromStr, true) as Date;
    const toDay = this.parseFechaDia(toStr, true) as Date;
    if (fromDay.getTime() > toDay.getTime()) {
      throw new BadRequestException('from no puede ser posterior a to');
    }
    const diffDays = Math.round(
      (toDay.getTime() - fromDay.getTime()) / 86400000,
    );
    if (diffDays > CALENDARIO_MAX_DAYS) {
      throw new BadRequestException('el rango no puede superar 62 días');
    }

    const from = new Date(
      Date.UTC(
        fromDay.getUTCFullYear(),
        fromDay.getUTCMonth(),
        fromDay.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    const to = new Date(
      Date.UTC(
        toDay.getUTCFullYear(),
        toDay.getUTCMonth(),
        toDay.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );

    const pedidos = await this.pedidoRepository.findPendientesByFechaRange(
      from,
      to,
    );
    const inRange = pedidos.filter((p) => {
      if (!CALENDARIO_PENDIENTE.has(p.status)) return false;
      const t = p.fecha_tentativa_entrega
        ? new Date(p.fecha_tentativa_entrega).getTime()
        : NaN;
      return Number.isFinite(t) && t >= from.getTime() && t <= to.getTime();
    });

    const clientIds = [...new Set(inRange.map((p) => p.client_id))];
    const clients = await this.clientRepository.findByIds(clientIds);
    const nameById = new Map<string, string>();
    for (const c of clients) {
      const id = String((c as { _id?: unknown })._id ?? '');
      if (id) nameById.set(id, c.nombre?.trim() || 'Cliente');
    }

    const today = this.todayBogotaYmd();
    const items: PedidoCalendarioItemDto[] = inRange.map((p) => {
      const fecha = this.formatFechaDia(p.fecha_tentativa_entrega) ?? '';
      const item: PedidoCalendarioItemDto = {
        id: String(p._id),
        client_id: p.client_id,
        client_name: nameById.get(p.client_id) || 'Cliente',
        status: p.status as 'reservado' | 'pagado',
        entrega_en_tienda: p.entrega_en_tienda,
        fecha_tentativa_entrega: fecha,
        overdue: this.isOverdue(fecha, today),
        mapa: this.mapaFromPedido(p),
      };
      if (p.store_id) item.store_id = p.store_id;
      if (p.store_name) item.store_name = p.store_name;
      if (p.store_address) item.store_address = p.store_address;
      if (p.ciudad) item.ciudad = p.ciudad;
      if (p.direccion_o_punto) item.direccion_o_punto = p.direccion_o_punto;
      if (p.notas_entrega) item.notas_entrega = p.notas_entrega;
      return item;
    });

    items.sort((a, b) => {
      const byFecha = a.fecha_tentativa_entrega.localeCompare(
        b.fecha_tentativa_entrega,
      );
      if (byFecha !== 0) return byFecha;
      const aKey = a.store_name ?? a.ciudad ?? '';
      const bKey = b.store_name ?? b.ciudad ?? '';
      return aKey.localeCompare(bKey, 'es');
    });

    return { from: fromStr, to: toStr, today, items };
  }

  async create(dto: PedidoCreateDto): Promise<PedidoResponseDto> {
    const clientId = this.requireObjectId(dto.client_id, 'client_id');
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const open = await this.pedidoRepository.findOpenByClientId(clientId);
    if (open) {
      throw new ConflictException('Ya hay un pedido abierto');
    }

    const entrega = this.validateEntrega(dto);
    const fecha = this.parseFechaDia(
      dto.fecha_tentativa_entrega,
      true,
    ) as Date;

    const created = await this.pedidoRepository.create({
      client_id: clientId,
      status: 'reservado',
      ...entrega,
      fecha_tentativa_entrega: fecha,
    });
    await this.attachOrphansToPedido(clientId, String(created._id));
    return this.toResponse(created);
  }

  async listByClient(clientId: string): Promise<PedidoResponseDto[]> {
    const id = this.requireObjectId(clientId, 'client_id');
    const client = await this.clientRepository.findById(id);
    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }
    const reservado =
      await this.pedidoRepository.findReservadoByClientId(id);
    if (reservado) {
      await this.attachOrphansToPedido(id, String(reservado._id));
    }
    const pedidos = await this.pedidoRepository.findByClientId(id);
    return Promise.all(pedidos.map((p) => this.toResponse(p)));
  }

  async getById(id: string): Promise<PedidoResponseDto> {
    const pedido = await this.requirePedido(id);
    if (pedido.status === 'reservado') {
      await this.attachOrphansToPedido(
        pedido.client_id,
        String(pedido._id),
      );
    }
    return this.toResponse(pedido);
  }

  async patch(id: string, dto: PedidoPatchDto): Promise<PedidoResponseDto> {
    const pedido = await this.requirePedido(id);
    if (pedido.status !== 'reservado' && pedido.status !== 'pagado') {
      throw new ConflictException(
        'Solo se puede editar entrega en un pedido reservado o pagado',
      );
    }

    const entregaSource: PedidoCreateDto = {
      client_id: pedido.client_id,
      entrega_en_tienda:
        dto.entrega_en_tienda ?? pedido.entrega_en_tienda,
      store_id: dto.store_id ?? pedido.store_id,
      ciudad: dto.ciudad ?? pedido.ciudad,
      direccion_o_punto: dto.direccion_o_punto ?? pedido.direccion_o_punto,
      notas_entrega:
        dto.notas_entrega !== undefined
          ? dto.notas_entrega
          : pedido.notas_entrega,
      fecha_tentativa_entrega: dto.fecha_tentativa_entrega ?? '',
    };

    if (dto.entrega_en_tienda !== undefined || this.hasEntregaPatch(dto)) {
      const entrega = this.validateEntrega(entregaSource);
      Object.assign(pedido, entrega);
    }

    if (dto.fecha_tentativa_entrega !== undefined) {
      pedido.fecha_tentativa_entrega = this.parseFechaDia(
        dto.fecha_tentativa_entrega,
        true,
      ) as Date;
    }

    const updated = await this.pedidoRepository.update(String(pedido._id), {
      entrega_en_tienda: pedido.entrega_en_tienda,
      store_id: pedido.store_id,
      store_name: pedido.store_name,
      store_address: pedido.store_address,
      ciudad: pedido.ciudad,
      direccion_o_punto: pedido.direccion_o_punto,
      notas_entrega: pedido.notas_entrega,
      fecha_tentativa_entrega: pedido.fecha_tentativa_entrega,
    });
    return this.toResponse(updated ?? pedido);
  }

  async cancel(id: string): Promise<{ success: boolean }> {
    const pedido = await this.requirePedido(id);
    if (pedido.status !== 'reservado') {
      throw new ConflictException('Solo se puede cancelar un pedido reservado');
    }
    const pedidoId = String(pedido._id);
    await this.attachOrphansToPedido(pedido.client_id, pedidoId);
    const reservas = await this.reservaRepository.findByPedidoId(pedidoId);
    for (const reserva of reservas) {
      const stock = await this.stockRepository.findById(reserva.stock_id);
      const reservaId = String((reserva as { _id?: unknown })._id ?? '');
      if (stock && isQuantityKind((stock as { product_kind?: string }).product_kind)) {
        const held = reservaQty(reserva.quantity);
        await this.stockRepository.incrementQuantityAtomic(
          reserva.stock_id,
          held,
        );
        if (reservaId) {
          await this.reservaRepository.deleteById(reservaId);
        } else {
          await this.reservaRepository.deleteByStockId(reserva.stock_id);
        }
        continue;
      }
      await this.reservaRepository.deleteByStockId(reserva.stock_id);
      await this.stockRepository.updateCardState(
        reserva.stock_id,
        ESTADO_DISPONIBLE,
      );
    }
    await this.pedidoRepository.deleteById(String(pedido._id));
    await this.pedidoAbonoRepository.deleteByPedidoId(pedidoId);
    return { success: true };
  }

  async pagar(id: string): Promise<PedidoResponseDto> {
    const pedido = await this.requirePedido(id);
    if (pedido.status !== 'reservado') {
      throw new ConflictException('Solo se puede pagar un pedido reservado');
    }
    const pedidoId = String(pedido._id);
    await this.attachOrphansToPedido(pedido.client_id, pedidoId);
    const reservas = await this.reservaRepository.findByPedidoId(pedidoId);
    if (!reservas.length) {
      throw new BadRequestException('El pedido no tiene líneas');
    }

    const snapshot: PedidoLineSnapshot[] = [];
    for (const reserva of reservas) {
      const stock = await this.stockRepository.findById(reserva.stock_id);
      if (!stock) {
        throw new NotFoundException(
          `Stock no encontrado: ${reserva.stock_id}`,
        );
      }
      const amountCop = precioToCop(reserva.precio, reserva.currency ?? 'COP');
      const tagsMap = await this.cardStockTagRepository.findMapByCardIds([
        stock.card_id,
      ]);
      const isQty = isQuantityKind(
        (stock as { product_kind?: string }).product_kind,
      );
      const units = isQty ? reservaQty(reserva.quantity) : 1;
      for (let i = 0; i < units; i++) {
        await this.saleRepository.create(
          enrichSaleCreatePayload(
            {
              stock_id: reserva.stock_id,
              card_id: stock.card_id,
              type: 'venta',
              amount_cop: amountCop,
              client_id: pedido.client_id,
              notes: `Venta finalizada desde pedido ${String(pedido._id)} (cliente ${pedido.client_id}). Precio original: ${reserva.precio} ${reserva.currency ?? 'COP'}.`,
            },
            stock,
            {
              tags_snapshot: tagsMap.get(String(stock.card_id).trim()) ?? [],
            },
          ),
        );
      }
      if (!isQty) {
        await this.stockRepository.updateCardState(
          reserva.stock_id,
          ESTADO_VENDIDA,
        );
      }
      const reservaId = String((reserva as { _id?: unknown })._id ?? '');
      if (reservaId) {
        await this.reservaRepository.deleteById(reservaId);
      } else {
        await this.reservaRepository.deleteByStockId(reserva.stock_id);
      }
      snapshot.push(this.lineFromReserva(reserva, stock));
    }

    const updated = await this.pedidoRepository.update(String(pedido._id), {
      status: 'pagado',
      paid_at: new Date(),
      lines_snapshot: snapshot,
    });
    return this.toResponse(updated ?? pedido, snapshot);
  }

  async entregar(id: string): Promise<PedidoResponseDto> {
    const pedido = await this.requirePedido(id);
    if (pedido.status !== 'pagado') {
      throw new ConflictException('Solo se puede entregar un pedido pagado');
    }
    const updated = await this.pedidoRepository.update(String(pedido._id), {
      status: 'entregado',
      delivered_at: new Date(),
    });
    return this.toResponse(updated ?? pedido);
  }

  async requireReservadoPedido(
    clientId: string,
    pedidoId?: string,
  ): Promise<PedidoDocument> {
    const cid = this.requireObjectId(clientId, 'client_id');
    if (pedidoId) {
      const pedido = await this.requirePedido(pedidoId);
      if (pedido.client_id !== cid) {
        throw new BadRequestException(
          'El pedido no pertenece a este cliente',
        );
      }
      if (pedido.status !== 'reservado') {
        throw new ConflictException(
          'Crea o reabre un pedido reservado',
        );
      }
      await this.attachOrphansToPedido(cid, String(pedido._id));
      return pedido;
    }
    const open = await this.pedidoRepository.findReservadoByClientId(cid);
    if (!open) {
      throw new ConflictException('Crea o reabre un pedido reservado');
    }
    await this.attachOrphansToPedido(cid, String(open._id));
    return open;
  }

  private async attachOrphansToPedido(
    clientId: string,
    pedidoId: string,
  ): Promise<void> {
    await this.reservaRepository.attachOrphansToPedido(clientId, pedidoId);
  }

  async assertReservaLineMutable(reserva: Reserva & { pedido_id?: string }) {
    if (!reserva.pedido_id) return;
    const pedido = await this.pedidoRepository.findById(reserva.pedido_id);
    if (!pedido) return;
    if (pedido.status !== 'reservado') {
      throw new ConflictException(
        'Solo se pueden editar líneas de un pedido reservado',
      );
    }
  }

  async pagarReservadoDeCliente(clientId: string): Promise<{
    success: boolean;
    vendidas?: number;
    error?: string;
  }> {
    if (!isValidObjectId(clientId)) {
      return { success: false, error: 'client_id inválido' };
    }
    const open = await this.pedidoRepository.findReservadoByClientId(clientId);
    if (!open) {
      return {
        success: false,
        error: 'No hay un pedido reservado para finalizar',
      };
    }
    try {
      const paid = await this.pagar(String(open._id));
      return {
        success: true,
        vendidas: paid.lines.reduce(
          (n, l) => n + (typeof l.quantity === 'number' && l.quantity >= 1 ? l.quantity : 1),
          0,
        ),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error al pagar el pedido';
      return { success: false, error: message };
    }
  }

  private hasEntregaPatch(dto: PedidoPatchDto): boolean {
    return (
      dto.store_id !== undefined ||
      dto.ciudad !== undefined ||
      dto.direccion_o_punto !== undefined ||
      dto.notas_entrega !== undefined
    );
  }

  private validateEntrega(
    dto: Pick<
      PedidoCreateDto,
      | 'entrega_en_tienda'
      | 'store_id'
      | 'ciudad'
      | 'direccion_o_punto'
      | 'notas_entrega'
    >,
  ): EntregaFields {
    if (typeof dto.entrega_en_tienda !== 'boolean') {
      throw new BadRequestException('entrega_en_tienda es requerido');
    }
    if (dto.entrega_en_tienda) {
      const storeId = dto.store_id?.trim();
      if (!storeId || !isTiendaEntregaId(storeId)) {
        throw new BadRequestException('store_id de tienda desconocido');
      }
      const tienda = getTiendaEntrega(storeId);
      if (!tienda) {
        throw new BadRequestException('store_id de tienda desconocido');
      }
      return {
        entrega_en_tienda: true,
        store_id: tienda.id,
        store_name: tienda.name,
        store_address: tienda.address,
        ciudad: undefined,
        direccion_o_punto: undefined,
        notas_entrega: dto.notas_entrega?.trim() || undefined,
      };
    }
    const ciudad = dto.ciudad?.trim() ?? '';
    const punto = dto.direccion_o_punto?.trim() ?? '';
    if (!ciudad || !punto) {
      throw new BadRequestException(
        'ciudad y direccion_o_punto son requeridos',
      );
    }
    return {
      entrega_en_tienda: false,
      store_id: undefined,
      store_name: undefined,
      store_address: undefined,
      ciudad,
      direccion_o_punto: punto,
      notas_entrega: dto.notas_entrega?.trim() || undefined,
    };
  }

  private parseFechaDia(
    value: string | undefined,
    required: boolean,
  ): Date | undefined {
    const raw = value?.trim() ?? '';
    if (!raw) {
      if (required) {
        throw new BadRequestException('fecha_tentativa_entrega inválida');
      }
      return undefined;
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    const isoDay = m ? raw : raw.slice(0, 10);
    const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
    if (!parsed) {
      throw new BadRequestException('fecha_tentativa_entrega inválida');
    }
    const year = Number(parsed[1]);
    const month = Number(parsed[2]);
    const day = Number(parsed[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('fecha_tentativa_entrega inválida');
    }
    return date;
  }

  private requireObjectId(id: string, field: string): string {
    const trimmed = id?.trim();
    if (!trimmed || !isValidObjectId(trimmed)) {
      throw new BadRequestException(`${field} inválido`);
    }
    return trimmed;
  }

  private async requirePedido(id: string): Promise<PedidoDocument> {
    const pedidoId = this.requireObjectId(id, 'id');
    const pedido = await this.pedidoRepository.findById(pedidoId);
    if (!pedido) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return pedido;
  }

  private async toResponse(
    pedido: PedidoDocument,
    snapshotOverride?: PedidoLineSnapshot[],
  ): Promise<PedidoResponseDto> {
    const id = String(pedido._id);
    const lines =
      pedido.status === 'reservado'
        ? await this.resolveLiveLines(id)
        : await this.resolveClosedLines(pedido, snapshotOverride);

    return {
      id,
      _id: id,
      client_id: pedido.client_id,
      status: pedido.status,
      entrega_en_tienda: pedido.entrega_en_tienda,
      store_id: pedido.store_id,
      store_name: pedido.store_name,
      store_address: pedido.store_address,
      ciudad: pedido.ciudad,
      direccion_o_punto: pedido.direccion_o_punto,
      notas_entrega: pedido.notas_entrega,
      fecha_tentativa_entrega: this.formatFechaDia(
        pedido.fecha_tentativa_entrega,
      ),
      paid_at: pedido.paid_at ? pedido.paid_at.toISOString() : null,
      delivered_at: pedido.delivered_at
        ? pedido.delivered_at.toISOString()
        : null,
      lines,
      created_at: (pedido.created_at ?? new Date()).toISOString(),
      updated_at: (pedido.updated_at ?? new Date()).toISOString(),
    };
  }

  private mapSnapshotLines(
    snapshot: PedidoLineSnapshot[],
  ): PedidoLineDto[] {
    return snapshot.map((l) => ({
      stock_id: l.stock_id,
      card_id: l.card_id,
      card_name: l.card_name,
      precio: l.precio,
      currency: l.currency ?? 'COP',
      image_url: l.image_url,
      quantity: l.quantity,
    }));
  }

  private async resolveClosedLines(
    pedido: PedidoDocument,
    snapshotOverride?: PedidoLineSnapshot[],
  ): Promise<PedidoLineDto[]> {
    const fromSnapshot = this.mapSnapshotLines(
      snapshotOverride ?? pedido.lines_snapshot ?? [],
    );
    if (fromSnapshot.length > 0) {
      return fromSnapshot;
    }
    return this.resolveLinesFromSales(pedido);
  }

  /** Pedidos pagados/entregados sin snapshot: reconstruye líneas desde ventas enlazadas. */
  private async resolveLinesFromSales(
    pedido: PedidoDocument,
  ): Promise<PedidoLineDto[]> {
    const pedidoIdStr = String(pedido._id);
    const sales = await this.saleRepository.findVentasByClientId(
      pedido.client_id,
      { limit: 200 },
    );
    const linked = sales.filter((sale) =>
      (sale.notes ?? '').includes(pedidoIdStr),
    );
    if (!linked.length) {
      return [];
    }
    const stockIds = [...new Set(linked.map((s) => s.stock_id))];
    const stocks = await this.stockRepository.findByIds(stockIds);
    const stockById = new Map(
      stocks.map((s) => [String((s as Stock & { _id?: unknown })._id), s]),
    );
    return linked.map((sale) => {
      const stock =
        stockById.get(sale.stock_id) ??
        ({ card_id: sale.card_id ?? '', card_name: '', image_url: '' } as Stock);
      return {
        stock_id: sale.stock_id,
        card_id: sale.card_id ?? stock.card_id ?? '',
        card_name: stock.card_name,
        precio: sale.amount_cop,
        currency: 'COP',
        image_url: stock.image_url,
      };
    });
  }

  private async resolveLiveLines(pedidoId: string): Promise<PedidoLineDto[]> {
    const reservas = await this.reservaRepository.findByPedidoId(pedidoId);
    const stockIds = reservas.map((r) => r.stock_id);
    const stocks = await this.stockRepository.findByIds(stockIds);
    const stockById = new Map(
      stocks.map((s) => [String((s as Stock & { _id?: unknown })._id), s]),
    );
    return reservas.map((reserva) => {
      const stock =
        stockById.get(reserva.stock_id) ??
        ({ card_id: '', card_name: '', image_url: '' } as Stock);
      return this.lineFromReserva(reserva, stock);
    });
  }

  private lineFromReserva(reserva: Reserva, stock: Stock): PedidoLineDto {
    const qty = reservaQty(reserva.quantity);
    return {
      stock_id: reserva.stock_id,
      card_id: stock.card_id ?? '',
      card_name: stock.card_name,
      precio: reserva.precio,
      currency: reserva.currency ?? 'COP',
      image_url: stock.image_url,
      ...(qty !== 1 ||
      isQuantityKind((stock as { product_kind?: string }).product_kind)
        ? { quantity: qty }
        : {}),
    };
  }

  private mapaFromPedido(pedido: PedidoDocument): PedidoMapaDto {
    if (pedido.entrega_en_tienda) {
      const tienda = getTiendaEntrega(pedido.store_id);
      if (
        tienda &&
        Number.isFinite(tienda.lat) &&
        Number.isFinite(tienda.lng)
      ) {
        return {
          kind: 'tienda',
          store_id: tienda.id,
          lat: tienda.lat,
          lng: tienda.lng,
        };
      }
    }
    const direccion = pedido.direccion_o_punto?.trim() ?? '';
    if (isCiudadBogota(pedido.ciudad) && direccion.length > 0) {
      return { kind: 'domicilio_bogota' };
    }
    if (!direccion) {
      return { kind: 'omitido', reason: 'sin_direccion' };
    }
    return { kind: 'omitido', reason: 'fuera_bogota' };
  }

  /** Día civil YYYY-MM-DD en America/Bogota (en-CA = ISO date). */
  private todayBogotaYmd(now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }

  private isOverdue(fechaYmd: string, todayYmd: string): boolean {
    return Boolean(fechaYmd) && fechaYmd < todayYmd;
  }

  private formatFechaDia(value?: Date): string | null {
    if (!value) return null;
    return new Date(value).toISOString().slice(0, 10);
  }
}
