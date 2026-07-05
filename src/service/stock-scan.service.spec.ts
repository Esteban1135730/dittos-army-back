import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StockScanService } from './stock-scan.service';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';

const validId = '507f1f77bcf86cd799439011';
const otherId = '507f1f77bcf86cd799439012';

describe('StockScanService', () => {
  const tcgDexMock = {
    resolveEnglishExpansionName: jest.fn(
      async (cardId: string, _language?: string) => {
        if (cardId === 'swsh3-136') return "Champion's Path";
        return '';
      },
    ),
  };

  it('exporta solo filas vendibles con PVP y metadatos', async () => {
    const stockRepository = {
      findAll: jest.fn().mockResolvedValue([
        {
          _id: validId,
          card_id: 'swsh3-136',
          card_name: 'Pikachu',
          card_state: 'disponible',
          language: 'en',
          rareza: 'holofoil',
        },
        {
          _id: otherId,
          card_id: 'swsh3-137',
          card_name: 'Sin PVP',
          card_state: 'disponible',
        },
      ]),
    };
    const pvpRepository = {
      findByCardIds: jest.fn().mockResolvedValue([
        {
          card_id: 'swsh3-136',
          rareza: 'holofoil',
          pvp: 50000,
          currency: 'COP',
        },
      ]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StockScanService,
        { provide: StockRepository, useValue: stockRepository },
        { provide: PvpRepository, useValue: pvpRepository },
        { provide: CardStockTagRepository, useValue: {} },
        { provide: TCGDexService, useValue: tcgDexMock },
      ],
    }).compile();
    const service = moduleRef.get(StockScanService);
    const rows = await service.listQrExportRows();
    expect(rows).toEqual([
      {
        stock_id: validId,
        qr_value: `DA-STOCK:${validId}`,
        card_name: 'Pikachu',
        expansion: "Champion's Path",
        rareza: 'Holofoil',
        language: 'EN',
        price_cop: 50000,
      },
    ]);
  });

  it('devuelve vista de escaneo con ganancia y metadatos', async () => {
    const stockRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: validId,
        card_id: 'swsh3-136',
        card_name: 'Charizard',
        image_url: 'https://img.example/c.jpg',
        card_state: 'en_stock_colombia',
        language: 'ja',
        shipment: 0,
        cards_in_shipmet: 1,
        unity_cost: 10000,
        currency: 'COP',
        rareza: null,
      }),
    };
    const pvpRepository = {
      findByCardIds: jest
        .fn()
        .mockResolvedValue([
          { card_id: 'swsh3-136', rareza: null, pvp: 50000, currency: 'COP' },
        ]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StockScanService,
        { provide: StockRepository, useValue: stockRepository },
        { provide: PvpRepository, useValue: pvpRepository },
        { provide: CardStockTagRepository, useValue: {} },
        { provide: TCGDexService, useValue: tcgDexMock },
      ],
    }).compile();
    const service = moduleRef.get(StockScanService);
    const view = await service.getScanView(validId);
    expect(view.card_name).toBe('Charizard');
    expect(view.price_cop).toBe(50000);
    expect(view.card_cost_cop).toBe(10000);
    expect(view.profit_cop).toBe(40000);
    expect(view.expansion).toBe("Champion's Path");
    expect(view.language).toBe('JA');
    expect(view.sellable).toBe(true);
  });

  it('marca no sellable sin PVP', async () => {
    const stockRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: validId,
        card_id: 'swsh3-136',
        card_name: 'Charizard',
        card_state: 'disponible',
        shipment: 0,
        cards_in_shipmet: 1,
        unity_cost: 1000,
        currency: 'COP',
        rareza: null,
      }),
    };
    const pvpRepository = {
      findByCardIds: jest.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StockScanService,
        { provide: StockRepository, useValue: stockRepository },
        { provide: PvpRepository, useValue: pvpRepository },
        { provide: CardStockTagRepository, useValue: {} },
        { provide: TCGDexService, useValue: tcgDexMock },
      ],
    }).compile();
    const service = moduleRef.get(StockScanService);
    const view = await service.getScanView(validId);
    expect(view.sellable).toBe(false);
    expect(view.reject_reason).toBe('sin_pvp');
  });

  it('lanza NotFound si el id no existe', async () => {
    const stockRepository = {
      findById: jest.fn().mockResolvedValue(null),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StockScanService,
        { provide: StockRepository, useValue: stockRepository },
        { provide: PvpRepository, useValue: {} },
        { provide: CardStockTagRepository, useValue: {} },
        { provide: TCGDexService, useValue: tcgDexMock },
      ],
    }).compile();
    const service = moduleRef.get(StockScanService);
    await expect(service.getScanView(validId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
