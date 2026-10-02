import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CardTraderController } from './cardtrader.controller';
import { CardTraderService } from 'src/service/cardtrader/cardtrader.service';
import { CardTraderTcgdexResolveService } from 'src/service/cardtrader/cardtrader-tcgdex-resolve.service';
import { CardTraderQuoteResolveService } from 'src/service/cardtrader/cardtrader-quote-resolve.service';
import { CardTraderQuoteSessionService } from 'src/service/cardtrader/cardtrader-quote-session.service';
import { CardTraderCatalogSearchService } from 'src/service/cardtrader/cardtrader-catalog-search.service';

describe('CardTraderController quote-lines/resolve', () => {
  async function setup() {
    const quoteResolve = {
      resolveLines: jest.fn().mockResolvedValue({
        results: [{ index: 0, status: 'matched', blueprint_id: 99 }],
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CardTraderController],
      providers: [
        { provide: CardTraderService, useValue: {} },
        { provide: CardTraderTcgdexResolveService, useValue: {} },
        { provide: CardTraderQuoteResolveService, useValue: quoteResolve },
        { provide: CardTraderQuoteSessionService, useValue: {} },
        { provide: CardTraderCatalogSearchService, useValue: {} },
      ],
    }).compile();

    return {
      controller: moduleRef.get(CardTraderController),
      quoteResolve,
    };
  }

  it('400 si lines falta o está vacío', async () => {
    const { controller, quoteResolve } = await setup();
    await expect(controller.resolveQuoteLines({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      controller.resolveQuoteLines({ lines: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(quoteResolve.resolveLines).not.toHaveBeenCalled();
  });

  it('400 si hay más de 100 líneas', async () => {
    const { controller } = await setup();
    const lines = Array.from({ length: 101 }, () => ({
      name: 'Pikachu',
      expansion: 'Base Set',
      collector_number: '25',
    }));
    await expect(
      controller.resolveQuoteLines({ lines }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400 si falta name/expansion/collector_number en una línea', async () => {
    const { controller } = await setup();
    await expect(
      controller.resolveQuoteLines({
        lines: [{ name: 'Pikachu', expansion: 'Base Set' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delega al servicio con líneas recortadas', async () => {
    const { controller, quoteResolve } = await setup();
    const out = await controller.resolveQuoteLines({
      lines: [
        {
          name: '  Shroomish  ',
          expansion: ' Generations ',
          collector_number: ' RC2 ',
          language_label: ' Inglés ',
          condition_label: ' Perfecto ',
        },
      ],
    });
    expect(quoteResolve.resolveLines).toHaveBeenCalledWith([
      {
        name: 'Shroomish',
        expansion: 'Generations',
        collector_number: 'RC2',
        language_label: 'Inglés',
        condition_label: 'Perfecto',
      },
    ]);
    expect(out.results[0]).toMatchObject({
      status: 'matched',
      blueprint_id: 99,
    });
  });
});

describe('CardTraderController blueprints/search', () => {
  async function setup() {
    const quoteResolve = {
      resolveLines: jest.fn(),
      searchBlueprintsByName: jest.fn().mockResolvedValue({
        items: [{ blueprint_id: 1, expansion_id: 2, name: 'Pikachu' }],
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CardTraderController],
      providers: [
        { provide: CardTraderService, useValue: {} },
        { provide: CardTraderTcgdexResolveService, useValue: {} },
        { provide: CardTraderQuoteResolveService, useValue: quoteResolve },
        { provide: CardTraderQuoteSessionService, useValue: {} },
        { provide: CardTraderCatalogSearchService, useValue: {} },
      ],
    }).compile();
    return {
      controller: moduleRef.get(CardTraderController),
      quoteResolve,
    };
  }

  it('400 si q tiene menos de 2 caracteres', async () => {
    const { controller, quoteResolve } = await setup();
    await expect(controller.searchBlueprints('a')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(quoteResolve.searchBlueprintsByName).not.toHaveBeenCalled();
  });

  it('400 si game_id no es un TCG soportado', async () => {
    const { controller } = await setup();
    await expect(
      controller.searchBlueprints('Pikachu', '2'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delega al servicio con q recortado', async () => {
    const { controller, quoteResolve } = await setup();
    const out = await controller.searchBlueprints('  Pikachu  ', '5');
    expect(quoteResolve.searchBlueprintsByName).toHaveBeenCalledWith('Pikachu');
    expect(out).toEqual({
      items: [{ blueprint_id: 1, expansion_id: 2, name: 'Pikachu' }],
    });
  });

  it('Yu-Gi-Oh usa búsqueda YGOPRODeck + CardTrader', async () => {
    const quoteResolve = {
      searchBlueprintsByName: jest.fn(),
    };
    const yugiohSearch = {
      searchBlueprintsByName: jest.fn().mockResolvedValue({
        items: [{ blueprint_id: 9, expansion_id: 8, name: 'Dark Magician' }],
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CardTraderController],
      providers: [
        { provide: CardTraderService, useValue: {} },
        { provide: CardTraderTcgdexResolveService, useValue: {} },
        { provide: CardTraderQuoteResolveService, useValue: quoteResolve },
        { provide: CardTraderQuoteSessionService, useValue: {} },
        { provide: CardTraderCatalogSearchService, useValue: yugiohSearch },
      ],
    }).compile();
    const controller = moduleRef.get(CardTraderController);
    const out = await controller.searchBlueprints('Dark Magician', '4');
    expect(yugiohSearch.searchBlueprintsByName).toHaveBeenCalledWith(
      'Dark Magician',
      'yugioh',
    );
    expect(quoteResolve.searchBlueprintsByName).not.toHaveBeenCalled();
    expect(out).toEqual({
      items: [{ blueprint_id: 9, expansion_id: 8, name: 'Dark Magician' }],
    });
  });

  it.each([
    ['1', 'magic'],
    ['15', 'onepiece'],
  ])('game_id %s delega al catálogo %s', async (gameId, tcg) => {
    const catalogSearch = {
      searchBlueprintsByName: jest.fn().mockResolvedValue({ items: [] }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CardTraderController],
      providers: [
        { provide: CardTraderService, useValue: {} },
        { provide: CardTraderTcgdexResolveService, useValue: {} },
        { provide: CardTraderQuoteResolveService, useValue: {} },
        { provide: CardTraderQuoteSessionService, useValue: {} },
        { provide: CardTraderCatalogSearchService, useValue: catalogSearch },
      ],
    }).compile();
    const controller = moduleRef.get(CardTraderController);
    await controller.searchBlueprints('Luffy', gameId);
    expect(catalogSearch.searchBlueprintsByName).toHaveBeenCalledWith(
      'Luffy',
      tcg,
    );
  });

  it('rechaza game_id no soportado', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CardTraderController],
      providers: [
        { provide: CardTraderService, useValue: {} },
        { provide: CardTraderTcgdexResolveService, useValue: {} },
        { provide: CardTraderQuoteResolveService, useValue: {} },
        { provide: CardTraderQuoteSessionService, useValue: {} },
        { provide: CardTraderCatalogSearchService, useValue: {} },
      ],
    }).compile();
    const controller = moduleRef.get(CardTraderController);
    await expect(controller.searchBlueprints('X', '99')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('CardTraderController quote-sessions', () => {
  it('POST delega create al servicio de sesión', async () => {
    const quoteSessions = {
      create: jest.fn().mockResolvedValue({ id: 'abc', status: 'in_progress' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CardTraderController],
      providers: [
        { provide: CardTraderService, useValue: {} },
        { provide: CardTraderTcgdexResolveService, useValue: {} },
        { provide: CardTraderQuoteResolveService, useValue: {} },
        { provide: CardTraderQuoteSessionService, useValue: quoteSessions },
        { provide: CardTraderCatalogSearchService, useValue: {} },
      ],
    }).compile();
    const controller = moduleRef.get(CardTraderController);
    const body = {
      source: 'whatsapp',
      raw_paste: 'Hola',
      lines: [
        {
          name: 'Shroomish',
          expansion: 'Generations',
          collector_number: 'RC2',
          resolve: { status: 'matched', blueprint_id: 99, expansion_id: 1 },
        },
      ],
    };
    await expect(controller.createQuoteSession(body)).resolves.toEqual({
      id: 'abc',
      status: 'in_progress',
    });
    expect(quoteSessions.create).toHaveBeenCalledWith(body);
  });
});
