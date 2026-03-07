import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CardDto } from 'src/service/tcgdex/dto/card.dto';
import { CardResumeDto } from 'src/service/tcgdex/dto/card.resume.dto';
import { SetResumeDto } from 'src/service/tcgdex/dto/set.resume.dto';
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';

@Controller('tcg-dex')
export class TcgDexController {
  constructor(private readonly tcgDexService: TCGDexService) {}

  @Get('set')
  async listSets(): Promise<SetResumeDto[] | null> {
    return await this.tcgDexService.getSets();
  }

  @Get('set/:id/cards')
  async getCardsSets(
    @Param() params: any,
  ): Promise<CardResumeDto[] | undefined> {
    return await this.tcgDexService.getSetCards(params.id);
  }

  @Get('card/search/:id')
  async findCardByName(
    @Param() params: any,
  ): Promise<CardResumeDto[] | undefined> {
    return await this.tcgDexService.findCardByName(params.id);
  }

  @Get('card/find/:id')
  async findCardById(@Param() params: any): Promise<CardDto | undefined> {
    return await this.tcgDexService.getCard(params.id);
  }

  /**
   * Obtiene una carta por ID desde TCGdex (incluye precios). Misma fuente que card/find.
   */
  @Get('card/alter/:id')
  async getCardAlter(@Param() params: any): Promise<CardDto | null> {
    const cardId = params.id as string;
    const card = await this.tcgDexService.getCard(cardId);
    if (!card) {
      console.error('[tcg-dex] getCardAlter: carta no encontrada', { cardId });
    }
    return card ?? null;
  }
}
