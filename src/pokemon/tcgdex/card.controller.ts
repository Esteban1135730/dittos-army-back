import { Controller, Get, Param } from '@nestjs/common';
import { TCGDexService } from './tcgdex.service';
import { SetResumeDto } from './dto/set.resume.dto';
import { CardResumeDto } from './dto/card.resume.dto';
import { CardDto } from './dto/card.dto';

@Controller()
export class CardController {
  constructor(private readonly tcgService: TCGDexService) {}

  @Get('set')
  async getSets(): Promise<SetResumeDto[] | null> {
    return await this.tcgService.getSets();
  }

  @Get('set/:id/cards')
  async getCardsSets(@Param() params: any): Promise<CardResumeDto[] | null> {
    const result = await this.tcgService.getSetCards(params.id);
    return result ?? null;
  }

  @Get('card/:id')
  async getCard(@Param() params: any): Promise<CardDto | null> {
    const result = await this.tcgService.getCard(params.id);
    return result ?? null;
  }
}
