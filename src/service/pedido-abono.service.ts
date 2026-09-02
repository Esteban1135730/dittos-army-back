import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { PedidoAbonoRepository } from '../repository/pedido-abono.repository';
import { PedidoRepository } from '../repository/pedido.repository';
import { ReservaRepository } from '../repository/reserva.repository';
import type { PedidoDocument, PedidoLineSnapshot } from '../schema/pedido.schema';
import type { PedidoAbonoDocument } from '../schema/pedido-abono.schema';
import { precioToCop } from '../utils/precio-to-cop';

export type PedidoAbonoItemDto = {
  id: string;
  amount_cop: number;
  created_at: string;
};

export type PedidoAbonosResponseDto = {
  pedido_id: string;
  total_pvp_cop: number;
  abonado_cop: number;
  saldo_cop: number;
  abonos: PedidoAbonoItemDto[];
};

const MSG_NO_RESERVADO_ADD = 'Solo se puede abonar un pedido reservado';
const MSG_NO_RESERVADO_DEL = 'Solo se puede eliminar un abono en un pedido reservado';

function lineQty(quantity: number | undefined): number {
  if (typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= 1) {
    return quantity;
  }
  return 1;
}

export function totalPvpFromPedidoLines(
  lines: Array<{ precio: number; currency?: string; quantity?: number }>,
): number {
  let total = 0;
  for (const line of lines) {
    const precio = line.precio;
    if (typeof precio !== 'number' || !Number.isFinite(precio)) continue;
    total += precioToCop(precio, line.currency ?? 'COP') * lineQty(line.quantity);
  }
  return total;
}

function toIso(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return value;
  }
  return new Date().toISOString();
}

function mapAbono(doc: PedidoAbonoDocument): PedidoAbonoItemDto {
  return {
    id: String(doc._id),
    amount_cop: doc.amount_cop,
    created_at: toIso(doc.created_at),
  };
}

@Injectable()
export class PedidoAbonoService {
  constructor(
    private readonly pedidoRepository: PedidoRepository,
    private readonly reservaRepository: ReservaRepository,
    private readonly abonoRepo: PedidoAbonoRepository,
  ) {}

  async listAbonos(pedidoId: string): Promise<PedidoAbonosResponseDto> {
    const pedido = await this.requirePedido(pedidoId);
    return this.buildSummary(pedido);
  }

  async addAbono(
    pedidoId: string,
    amountCop: unknown,
  ): Promise<PedidoAbonosResponseDto> {
    const amount = this.parseAmountCop(amountCop);
    const pedido = await this.requirePedido(pedidoId);
    if (pedido.status !== 'reservado') {
      throw new ConflictException(MSG_NO_RESERVADO_ADD);
    }
    const summary = await this.buildSummary(pedido);
    if (summary.saldo_cop <= 0) {
      throw new BadRequestException('No hay saldo para abonar');
    }
    if (amount > summary.saldo_cop) {
      throw new BadRequestException('El abono supera el saldo');
    }
    await this.abonoRepo.create(String(pedido._id), amount);
    return this.buildSummary(pedido);
  }

  async deleteAbono(
    pedidoId: string,
    abonoId: string,
  ): Promise<{ success: true }> {
    if (!abonoId?.trim() || !isValidObjectId(abonoId.trim())) {
      throw new BadRequestException('abonoId inválido');
    }
    const pedido = await this.requirePedido(pedidoId);
    if (pedido.status !== 'reservado') {
      throw new ConflictException(MSG_NO_RESERVADO_DEL);
    }
    const id = String(pedido._id);
    const doc = await this.abonoRepo.findById(abonoId.trim());
    if (!doc || doc.pedido_id !== id) {
      throw new NotFoundException('Abono no encontrado');
    }
    await this.abonoRepo.deleteById(abonoId.trim());
    return { success: true };
  }

  async deleteAllForPedido(pedidoId: string): Promise<void> {
    await this.abonoRepo.deleteByPedidoId(pedidoId);
  }

  private parseAmountCop(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(n) || n < 1) {
      throw new BadRequestException(
        'amount_cop debe ser un entero mayor o igual a 1',
      );
    }
    return n;
  }

  private async requirePedido(pedidoId: string): Promise<PedidoDocument> {
    const id = pedidoId?.trim();
    if (!id || !isValidObjectId(id)) {
      throw new BadRequestException('id inválido');
    }
    const pedido = await this.pedidoRepository.findById(id);
    if (!pedido) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return pedido;
  }

  private async resolveLines(
    pedido: PedidoDocument,
  ): Promise<Array<{ precio: number; currency?: string; quantity?: number }>> {
    const id = String(pedido._id);
    if (pedido.status === 'reservado') {
      const reservas = await this.reservaRepository.findByPedidoId(id);
      return reservas.map((r) => ({
        precio: r.precio,
        currency: r.currency,
        quantity: r.quantity,
      }));
    }
    const snapshot: PedidoLineSnapshot[] = pedido.lines_snapshot ?? [];
    return snapshot.map((l) => ({
      precio: l.precio,
      currency: l.currency,
      quantity: l.quantity,
    }));
  }

  private async buildSummary(
    pedido: PedidoDocument,
  ): Promise<PedidoAbonosResponseDto> {
    const pedidoId = String(pedido._id);
    const [lines, abonos] = await Promise.all([
      this.resolveLines(pedido),
      this.abonoRepo.findByPedidoId(pedidoId),
    ]);
    const total_pvp_cop = totalPvpFromPedidoLines(lines);
    const abonado_cop = abonos.reduce((sum, a) => sum + (a.amount_cop ?? 0), 0);
    return {
      pedido_id: pedidoId,
      total_pvp_cop,
      abonado_cop,
      saldo_cop: total_pvp_cop - abonado_cop,
      abonos: abonos.map(mapAbono),
    };
  }
}
