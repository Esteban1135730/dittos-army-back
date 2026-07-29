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

  it('exporta también líneas en reserva si tienen PVP', async () => {
    const reservedId = '507f1f77bcf86cd799439013';
    const stockRepository = {
      findAll: jest.fn().mockResolvedValue([
        {
          _id: reservedId,
          card_id: 'swsh3-136',
          card_name: 'Pikachu reservado',
          card_state: 'reserva',
          language: 'en',
          rareza: null,
        },
        {
          _id: otherId,
          card_id: 'swsh3-137',
          card_name: 'Vendida',
          card_state: 'vendida',
          language: 'en',
          rareza: null,
        },
      ]),
    };
    const pvpRepository = {
      findByCardIds: jest.fn().mockResolvedValue([
        {
          card_id: 'swsh3-136',
          rareza: null,
          pvp: 12000,
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
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      stock_id: reservedId,
      card_name: 'Pikachu reservado',
      price_cop: 12000,
    });
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

  describe('escaneo de línea en reserva (delta 2026-07)', () => {
    const reservedId = '507f1f77bcf86cd799439021';
    const equivalentId = '507f1f77bcf86cd799439022';

    const reservedLine = {
      _id: reservedId,
      card_id: 'swsh3-136',
      card_name: 'Charizard reservado',
      card_state: 'reserva',
      language: 'en',
      shipment: 0,
      cards_in_shipmet: 1,
      unity_cost: 10000,
      currency: 'COP',
      rareza: 'holofoil',
    };
    const equivalentLine = {
      _id: equivalentId,
      card_id: 'swsh3-136',
      card_name: 'Charizard disponible',
      card_state: 'disponible',
      language: 'en',
      shipment: 0,
      cards_in_shipmet: 1,
      unity_cost: 12000,
      currency: 'COP',
      rareza: 'holofoil',
    };
    const pvpHolofoil = [
      { card_id: 'swsh3-136', rareza: 'holofoil', pvp: 50000, currency: 'COP' },
    ];

    async function setupService(overrides: {
      candidates?: unknown[];
      pvps?: unknown[];
    }) {
      const stockRepository = {
        findById: jest.fn().mockResolvedValue(reservedLine),
        findByCardIdsInStates: jest
          .fn()
          .mockResolvedValue(overrides.candidates ?? []),
      };
      const pvpRepository = {
        findByCardIds: jest
          .fn()
          .mockResolvedValue(overrides.pvps ?? pvpHolofoil),
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
      return {
        service: moduleRef.get(StockScanService),
        stockRepository,
      };
    }

    it('sustituye por copia equivalente disponible', async () => {
      const { service, stockRepository } = await setupService({
        candidates: [equivalentLine],
      });
      const view = await service.getScanView(reservedId);
      expect(view.stock_id).toBe(equivalentId);
      expect(view.card_state).toBe('disponible');
      expect(view.sellable).toBe(true);
      expect(view.substituted).toBe(true);
      expect(view.scanned_stock_id).toBe(reservedId);
      expect(view.reserved_fallback).toBeUndefined();
      expect(stockRepository.findByCardIdsInStates).toHaveBeenCalledWith(
        ['swsh3-136'],
        ['disponible', 'en_stock_colombia'],
      );
    });

    it('elige determinista por _id ascendente si hay varias equivalentes', async () => {
      const otherEquivalentId = '507f1f77bcf86cd799439023';
      const { service } = await setupService({
        candidates: [
          { ...equivalentLine, _id: otherEquivalentId },
          equivalentLine,
        ],
      });
      const view = await service.getScanView(reservedId);
      expect(view.stock_id).toBe(equivalentId);
    });

    it('no sustituye por copias de otro idioma u otra rareza operativa', async () => {
      const { service } = await setupService({
        candidates: [
          { ...equivalentLine, language: 'ja' },
          { ...equivalentLine, _id: '507f1f77bcf86cd799439024', rareza: null },
        ],
      });
      const view = await service.getScanView(reservedId);
      expect(view.stock_id).toBe(reservedId);
      expect(view.reserved_fallback).toBe(true);
    });

    it('respeta exclude: única equivalente excluida → fallback reservada', async () => {
      const { service } = await setupService({
        candidates: [equivalentLine],
      });
      const view = await service.getScanView(reservedId, [equivalentId]);
      expect(view.stock_id).toBe(reservedId);
      expect(view.card_state).toBe('reserva');
      expect(view.sellable).toBe(true);
      expect(view.reserved_fallback).toBe(true);
      expect(view.substituted).toBeUndefined();
    });

    it('sin equivalente: devuelve la reservada vendible con reserved_fallback', async () => {
      const { service } = await setupService({ candidates: [] });
      const view = await service.getScanView(reservedId);
      expect(view.stock_id).toBe(reservedId);
      expect(view.card_state).toBe('reserva');
      expect(view.sellable).toBe(true);
      expect(view.reserved_fallback).toBe(true);
      expect(view.reject_reason).toBeUndefined();
      expect(view.price_cop).toBe(50000);
    });

    it('reservada sin PVP y sin equivalente → sin_pvp', async () => {
      const { service } = await setupService({ candidates: [], pvps: [] });
      const view = await service.getScanView(reservedId);
      expect(view.sellable).toBe(false);
      expect(view.reject_reason).toBe('sin_pvp');
      expect(view.reserved_fallback).toBeUndefined();
    });
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
