import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { CardDto } from 'src/service/tcgdex/dto/card.dto';
import { CardResumeDto } from 'src/service/tcgdex/dto/card.resume.dto';
import { SetResumeDto } from 'src/service/tcgdex/dto/set.resume.dto';
import {
  TCGDEX_SUPPORTED_LOCALES,
  TCGDexService,
} from 'src/service/tcgdex/tcgdex.service';

@Controller('tcg-dex')
export class TcgDexController {
  constructor(private readonly tcgDexService: TCGDexService) {}

  private resolveLocale(locale?: string): string | undefined {
    if (!locale || locale.trim() === '') {
      return undefined;
    }
    if (!this.tcgDexService.isSupportedLocale(locale)) {
      throw new BadRequestException(
        `locale inválido. Soportados: ${TCGDEX_SUPPORTED_LOCALES.join(', ')}`,
      );
    }
    return locale.trim().toLowerCase();
  }

  @Get('set')
  async listSets(
    @Query('locale') locale?: string,
  ): Promise<SetResumeDto[] | null> {
    return await this.tcgDexService.getSets(this.resolveLocale(locale));
  }

  @Get('set/:id/cards')
  async getCardsSets(
    @Param() params: any,
    @Query('locale') locale?: string,
  ): Promise<CardResumeDto[] | undefined> {
    return await this.tcgDexService.getSetCards(
      params.id,
      this.resolveLocale(locale),
    );
  }

  @Get('card/search/:id')
  async findCardByName(
    @Param() params: any,
    @Query('locale') locale?: string,
  ): Promise<CardResumeDto[] | undefined> {
    return await this.tcgDexService.findCardByName(
      params.id,
      this.resolveLocale(locale),
    );
  }

  @Get('card/find/:id')
  async findCardById(
    @Param() params: any,
    @Query('locale') locale?: string,
  ): Promise<CardDto | undefined> {
    return await this.tcgDexService.getCard(
      params.id,
      this.resolveLocale(locale),
    );
  }

  /**
   * Obtiene una carta por ID desde TCGdex (incluye precios). Misma fuente que card/find.
   */
  @Get('card/alter/:id')
  async getCardAlter(
    @Param() params: any,
    @Query('locale') locale?: string,
  ): Promise<CardDto | null> {
    const cardId = params.id as string;
    const card = await this.tcgDexService.getCard(
      cardId,
      this.resolveLocale(locale),
    );
    if (!card) {
      console.error('[tcg-dex] getCardAlter: carta no encontrada', { cardId });
    }
    return card ?? null;
  }
}
