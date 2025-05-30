import { Controller, Get, Param } from '@nestjs/common';
import { TCGDexService } from '../service/tcgdex/tcgdex.service';
import { Card, Set } from 'pokemon-tcg-sdk-typescript/dist/sdk';

@Controller()
export class CardController {
  constructor(private readonly tcgService: TCGDexService) {}

  @Get('set')
  async getSets(): Promise<Set[] | null> {
    return await this.tcgService.getSets();
  }

  @Get('set/:id/cards')
  async getCardsSets(@Param() params: any): Promise<Card[] | null> {
    return await this.tcgService.getSetCards(params.id);
  }

  @Get('card/:id')
  async getCard(@Param() params: any): Promise<Card | null> {
    return await this.tcgService.getCard(params.id);
  }
}
