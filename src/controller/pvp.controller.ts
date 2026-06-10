import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { Pvp } from 'src/schema/pvp.schema';
import { PvpRepository } from 'src/repository/pvp.repository';
import { PvpCardRowDto, PvpDto } from 'src/Dto/pvp.dto';
import {
  isValidOperationalRareza,
  normalizeOperationalRareza,
} from 'src/constants/item-rareza';
import { PvpCardRowsService } from 'src/service/pvp-card-rows.service';

@Controller('pvp')
export class PvpController {
  constructor(
    private readonly pvpRepository: PvpRepository,
    private readonly pvpCardRowsService: PvpCardRowsService,
  ) {}

  @Post()
  async createOrUpdatePvp(@Body() pvpDto: PvpDto): Promise<Pvp | null> {
    const rz = normalizeOperationalRareza(pvpDto.rareza);
    if (!isValidOperationalRareza(rz)) {
      throw new BadRequestException('rareza inválida');
    }
    if (!pvpDto.card_id || pvpDto.pvp == null || !pvpDto.currency) {
      throw new BadRequestException('card_id, pvp y currency son requeridos');
    }
    if (typeof pvpDto.pvp === 'number' && pvpDto.pvp <= 0) {
      throw new BadRequestException('pvp debe ser mayor a cero');
    }
    return await this.pvpRepository.update({ ...pvpDto, rareza: rz });
  }

  @Get()
  async getAllPvp(): Promise<Pvp[]> {
    return await this.pvpRepository.findAll();
  }

  @Get(':card_id')
  async getPvpByCardId(
    @Param() params: { card_id: string },
  ): Promise<PvpCardRowDto[]> {
    return await this.pvpCardRowsService.buildRowsForCard(params.card_id);
  }

  @Delete()
  async clearAllPvp(): Promise<{ deletedCount: number }> {
    return await this.pvpRepository.deleteAll();
  }
}
