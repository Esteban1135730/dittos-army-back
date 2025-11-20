import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CardResume } from '@tcgdex/sdk';
import { TCGSdkService } from 'src/service/tcg-sdk.service';
import { CardDto } from 'src/service/tcgdex/dto/card.dto';
import { CardResumeDto } from 'src/service/tcgdex/dto/card.resume.dto';
import { SetResumeDto } from 'src/service/tcgdex/dto/set.resume.dto';
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';

@Controller('tcg-dex')
export class TcgDexController {
  constructor(
    private readonly tcgDexService: TCGDexService,
    private readonly tcgSdkService: TCGSdkService,
  ) {}

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
}
