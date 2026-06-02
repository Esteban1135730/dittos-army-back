import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TcgDexController } from './tcg-dex.controller';
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';

describe('TcgDexController locale support', () => {
  async function setup() {
    const tcgDexService = {
      getSets: jest.fn().mockResolvedValue([]),
      getSetCards: jest.fn().mockResolvedValue([]),
      findCardByName: jest.fn().mockResolvedValue([]),
      getCard: jest.fn().mockResolvedValue(undefined),
      isSupportedLocale: jest
        .fn()
        .mockImplementation((locale?: string) =>
          ['ja', 'ko', 'zh-cn', 'en', 'es', 'fr', 'de', 'it', 'pt'].includes(
            (locale ?? '').toLowerCase(),
          ),
        ),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TcgDexController],
      providers: [{ provide: TCGDexService, useValue: tcgDexService }],
    }).compile();

    return {
      controller: moduleRef.get(TcgDexController),
      tcgDexService,
    };
  }

  it('propaga locale válido a listSets', async () => {
    const { controller, tcgDexService } = await setup();
    await controller.listSets('ja');
    expect(tcgDexService.getSets).toHaveBeenCalledWith('ja');
  });

  it('rechaza locale inválido', async () => {
    const { controller, tcgDexService } = await setup();
    await expect(controller.listSets('xx')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tcgDexService.getSets).not.toHaveBeenCalled();
  });

  it('lista cartas por set con locale', async () => {
    const { controller, tcgDexService } = await setup();
    await controller.getCardsSets({ id: 'sv8' }, 'zh-cn');
    expect(tcgDexService.getSetCards).toHaveBeenCalledWith('sv8', 'zh-cn');
  });
});

