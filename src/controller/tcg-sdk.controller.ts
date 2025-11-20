import { Controller, Get, Param } from '@nestjs/common';
import { TCGSdkService } from '../service/tcg-sdk.service';
import { Card, Set } from 'pokemon-tcg-sdk-typescript/dist/sdk';

@Controller('tcg-sdk')
export class TcgSdkController {
  constructor(private readonly tcgSdkService: TCGSdkService) {}

  @Get('set')
  async getSets(): Promise<Set[] | null> {
    return await this.tcgSdkService.getSets();
  }

  @Get('set/:id/cards')
  async getCardsSets(@Param() params: any): Promise<Card[] | null> {
    return await this.tcgSdkService.getSetCards(params.id);
  }

  @Get('card/:id')
  async getCard(@Param() params: any): Promise<Card | null> {
    return await this.tcgSdkService.getCard(params.id);
  }

  @Get('card/find/:id')
  async findCardByName(@Param() params: any): Promise<Card[] | null> {
    return await this.tcgSdkService.findCardByName(params.id);
  }

  @Get('card/alter/:id')
  async test(@Param() params: any): Promise<any> {
    //let setName = await this.tcgDexService.getCardSet(params.id);
    const setName = params.id
      ?.replace('sv0', 'sv')
      .replace('.5', 'pt5')
      .replace('001', '1')
      .replace('002', '2')
      .replace('003', '3')
      .replace('004', '4')
      .replace('005', '5')
      .replace('006', '6')
      .replace('007', '7')
      .replace('008', '8')
      .replace('009', '9')
      .replace('01', '1')
      .replace('02', '2')
      .replace('03', '3')
      .replace('04', '4')
      .replace('05', '5')
      .replace('06', '6')
      .replace('07', '7')
      .replace('08', '8')
      .replace('09', '9')
      ;
    return this.tcgSdkService.getCard(setName);
  }
}
