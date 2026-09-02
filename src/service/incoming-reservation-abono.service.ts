import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReservaIncomingRepository } from '../repository/reserva-incoming.repository';
import { ReservaIncomingAbonoRepository } from '../repository/reserva-incoming-abono.repository';
import type { ReservaIncomingDocument } from '../schema/reserva-incoming.schema';
import type { ReservaIncomingAbonoDocument } from '../schema/reserva-incoming-abono.schema';

export type ReservaIncomingAbonoItemDto = {
  id: string;
  amount_cop: number;
  created_at: string;
};

export type ReservaIncomingAbonosResponseDto = {
  client_id: string;
  total_pvp_cop: number;
  abonado_cop: number;
  saldo_cop: number;
  abonos: ReservaIncomingAbonoItemDto[];
};

const SIN_RESERVA_CAMINO = 'El cliente no tiene reserva en camino';

export function incomingLineQuantity(quantity: unknown): number {
  if (
    typeof quantity === 'number' &&
    Number.isInteger(quantity) &&
    quantity >= 1
  ) {
    return quantity;
  }
  return 1;
}

/** Suma precio_cop × quantity solo en líneas con PVP numérico > 0. */
export function totalPvpFromIncomingLines(
  lines: Array<{ precio_cop?: number | null; quantity?: number }>,
): number {
  let total = 0;
  for (const line of lines) {
    const precio = line.precio_cop;
    if (typeof precio !== 'number' || !Number.isFinite(precio) || precio <= 0) {
      continue;
    }
    total += precio * incomingLineQuantity(line.quantity);
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

function mapAbono(
  doc: ReservaIncomingAbonoDocument,
): ReservaIncomingAbonoItemDto {
  return {
    id: String(doc._id),
    amount_cop: doc.amount_cop,
    created_at: toIso(doc.created_at),
  };
}

@Injectable()
export class IncomingReservationAbonoService {
  constructor(
    private readonly reservaIncomingRepo: ReservaIncomingRepository,
    private readonly abonoRepo: ReservaIncomingAbonoRepository,
  ) {}

  async listAbonos(
    clientId: string,
  ): Promise<ReservaIncomingAbonosResponseDto> {
    const lines = await this.requireIncomingLines(clientId);
    return this.buildSummary(clientId, lines);
  }

  async addAbono(
    clientId: string,
    amountCop: unknown,
  ): Promise<ReservaIncomingAbonosResponseDto> {
    const amount = this.parseAmountCop(amountCop);
    const lines = await this.requireIncomingLines(clientId);
    const summary = await this.buildSummary(clientId, lines);
    if (summary.saldo_cop <= 0) {
      throw new BadRequestException('No hay saldo para abonar');
    }
    if (amount > summary.saldo_cop) {
      throw new BadRequestException('El abono supera el saldo');
    }
    await this.abonoRepo.create(clientId, amount);
    return this.buildSummary(clientId, lines);
  }

  async deleteAbono(
    clientId: string,
    abonoId: string,
  ): Promise<{ success: true }> {
    const doc = await this.abonoRepo.findById(abonoId);
    if (!doc || doc.client_id !== clientId) {
      throw new NotFoundException('Abono no encontrado');
    }
    await this.abonoRepo.deleteById(abonoId);
    return { success: true };
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

  private async requireIncomingLines(
    clientId: string,
  ): Promise<ReservaIncomingDocument[]> {
    const lines = await this.reservaIncomingRepo.findAll(clientId);
    if (!lines.length) {
      throw new ConflictException(SIN_RESERVA_CAMINO);
    }
    return lines;
  }

  private async buildSummary(
    clientId: string,
    lines: Array<{ precio_cop?: number | null; quantity?: number }>,
  ): Promise<ReservaIncomingAbonosResponseDto> {
    const abonos = await this.abonoRepo.findByClientId(clientId);
    const total_pvp_cop = totalPvpFromIncomingLines(lines);
    const abonado_cop = abonos.reduce((sum, a) => sum + (a.amount_cop ?? 0), 0);
    return {
      client_id: clientId,
      total_pvp_cop,
      abonado_cop,
      saldo_cop: total_pvp_cop - abonado_cop,
      abonos: abonos.map(mapAbono),
    };
  }
}
