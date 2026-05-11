import { BadRequestException, Injectable } from '@nestjs/common';
import { StockRepository } from '../repository/stock.repository';
import { StockDto } from '../Dto/stock.dto';
import { FromOpenedSealedBodyDto, FromOpenedSealedLineDto } from '../Dto/from-opened-sealed.dto';
import {
  isValidOperationalRareza,
  normalizeOperationalRareza,
} from '../constants/item-rareza';

/** Reparto entero en COP: las primeras `remainder` posiciones llevan base+1. */
export function allocateUnityCosts(assignableCop: number, n: number): number[] {
  if (n <= 0) {
    throw new BadRequestException('lines debe tener al menos un elemento');
  }
  if (assignableCop < 0) {
    throw new BadRequestException('assignableCop inválido');
  }
  const base = Math.floor(assignableCop / n);
  const remainder = assignableCop - base * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(base + (i < remainder ? 1 : 0));
  }
  return out;
}

export type FromOpenedSealedResult = {
  created_count: number;
  allocatable_total_cop: number;
  lines: { card_id: string; unity_cost_cop: number }[];
};

@Injectable()
export class OpenedSealedStockService {
  constructor(private readonly stockRepository: StockRepository) {}

  async createFromOpenedSealed(body: FromOpenedSealedBodyDto): Promise<FromOpenedSealedResult> {
    const nonStock = body.non_stock_fraction ?? 0.3;
    if (typeof nonStock !== 'number' || !Number.isFinite(nonStock) || nonStock < 0 || nonStock >= 1) {
      throw new BadRequestException('non_stock_fraction debe ser >= 0 y < 1');
    }

    const pc = body.product_cost_cop;
    if (typeof pc !== 'number' || !Number.isFinite(pc) || pc <= 0 || !Number.isInteger(pc)) {
      throw new BadRequestException('product_cost_cop debe ser un entero positivo (COP)');
    }

    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      throw new BadRequestException('lines debe incluir al menos una carta');
    }

    const assignable = Math.round(pc * (1 - nonStock));
    const unityCosts = allocateUnityCosts(assignable, body.lines.length);

    const notesPrefix = 'Apertura sellado';
    const label = body.source_label?.trim();
    const incoming_notes = label ? `${notesPrefix} — ${label}` : notesPrefix;

    const stockDtos: StockDto[] = body.lines.map((line, i) =>
      this.lineToStockDto(line, unityCosts[i], incoming_notes),
    );

    await this.stockRepository.createMany(stockDtos);
    return {
      created_count: stockDtos.length,
      allocatable_total_cop: assignable,
      lines: body.lines.map((line, i) => ({
        card_id: line.card_id,
        unity_cost_cop: unityCosts[i],
      })),
    };
  }

  private lineToStockDto(
    line: FromOpenedSealedLineDto,
    unity_cost: number,
    incoming_notes: string,
  ): StockDto {
    const card_id = String(line.card_id ?? '').trim();
    const card_name = String(line.card_name ?? '').trim();
    const language = String(line.language ?? '').trim();
    if (!card_id) {
      throw new BadRequestException('card_id es obligatorio');
    }
    if (!card_name) {
      throw new BadRequestException('card_name es obligatorio');
    }
    if (!language) {
      throw new BadRequestException('language es obligatorio por línea');
    }

    const rz = normalizeOperationalRareza(line.rareza);
    if (!isValidOperationalRareza(rz)) {
      throw new BadRequestException('rareza inválida');
    }

    const dto: StockDto = {
      card_id,
      card_name,
      shipment: 0,
      unity_cost,
      cards_in_shipmet: 1,
      image_url: line.image_url ?? '',
      card_state: 'disponible',
      language,
      currency: 'COP',
      incoming_notes,
      tags: [],
    };
    if (rz != null) {
      dto.rareza = rz;
    }
    const rzTrim = rz ?? '';
    dto.holofoil = rzTrim === 'holofoil' || Boolean(line.holofoil);
    dto.league_card = rzTrim === 'league card' || Boolean(line.league_card);
    return dto;
  }
}
