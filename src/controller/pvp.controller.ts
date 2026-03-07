import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Pvp } from 'src/schema/pvp.schema';
import { PvpRepository } from 'src/repository/pvp.repository';
import { PvpDto } from 'src/Dto/pvp.dto';

@Controller('pvp')
export class PvpController {
  constructor(private readonly pvpRepository: PvpRepository) {}

  @Post()
  async createOrUpdatePvp(@Body() pvpDto: PvpDto): Promise<Pvp | null> {
    try {
      // Validar que los campos requeridos estén presentes
      if (!pvpDto.card_id || !pvpDto.pvp || !pvpDto.currency) {
        throw new Error('card_id, pvp y currency son requeridos');
      }
      
      // Si ya existe un PVP para esta carta, lo actualiza; si no, lo crea
      return await this.pvpRepository.update(pvpDto);
    } catch (error) {
      throw error;
    }
  }

  @Get(':card_id')
  async getPvpByCardId(@Param() params: any): Promise<Pvp | null> {
    return await this.pvpRepository.findByCardId(params.card_id);
  }

  @Get()
  async getAllPvp(): Promise<Pvp[]> {
    return await this.pvpRepository.findAll();
  }

  @Delete()
  async clearAllPvp(): Promise<{ deletedCount: number }> {
    return await this.pvpRepository.deleteAll();
  }
}

