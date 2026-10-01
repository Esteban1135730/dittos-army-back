import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StockScanService } from './stock-scan.service';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';
import { TCGDexService } from 'src/pokemon';

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

  describe('escaneo de línea vendida (fallback idioma)', () => {
    const soldId = '507f1f77bcf86cd799439031';
    const sameLangId = '507f1f77bcf86cd799439032';
    const otherLangId = '507f1f77bcf86cd799439033';

    const soldLine = {
      _id: soldId,
      card_id: 'swsh3-136',
      card_name: 'Charizard vendido',
      card_state: 'vendida',
      language: 'en',
      shipment: 0,
      cards_in_shipmet: 1,
      unity_cost: 10000,
      currency: 'COP',
      rareza: 'holofoil',
    };
    const sameLangAvailable = {
      _id: sameLangId,
      card_id: 'swsh3-136',
      card_name: 'Charizard EN',
      card_state: 'disponible',
      language: 'en',
      shipment: 0,
      cards_in_shipmet: 1,
      unity_cost: 12000,
      currency: 'COP',
      rareza: 'holofoil',
    };
    const otherLangAvailable = {
      _id: otherLangId,
      card_id: 'swsh3-136',
      card_name: 'Charizard JA',
      card_state: 'disponible',
      language: 'ja',
      shipment: 0,
      cards_in_shipmet: 1,
      unity_cost: 11000,
      currency: 'COP',
      rareza: 'holofoil',
    };
    const pvpHolofoil = [
      { card_id: 'swsh3-136', rareza: 'holofoil', pvp: 50000, currency: 'COP' },
    ];

    async function setupService(overrides: {
      candidates?: unknown[];
      pvps?: unknown[];
      sold?: unknown;
    }) {
      const stockRepository = {
        findById: jest.fn().mockResolvedValue(overrides.sold ?? soldLine),
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

    it('sustituye por copia mismo idioma cuando hay varias', async () => {
      const { service } = await setupService({
        candidates: [otherLangAvailable, sameLangAvailable],
      });
      const view = await service.getScanView(soldId);
      expect(view.stock_id).toBe(sameLangId);
      expect(view.language).toBe('EN');
      expect(view.sellable).toBe(true);
      expect(view.substituted).toBe(true);
      expect(view.sold_language_fallback).toBe(true);
      expect(view.scanned_stock_id).toBe(soldId);
      expect(view.reject_reason).toBeUndefined();
    });

    it('sustituye por otro idioma si no hay mismo idioma', async () => {
      const { service } = await setupService({
        candidates: [otherLangAvailable],
      });
      const view = await service.getScanView(soldId);
      expect(view.stock_id).toBe(otherLangId);
      expect(view.language).toBe('JA');
      expect(view.sellable).toBe(true);
      expect(view.substituted).toBe(true);
      expect(view.sold_language_fallback).toBe(true);
      expect(view.scanned_stock_id).toBe(soldId);
    });

    it('otra rareza operativa no sustituye → ya_vendida', async () => {
      const { service } = await setupService({
        candidates: [
          { ...sameLangAvailable, rareza: null },
          { ...otherLangAvailable, rareza: null },
        ],
      });
      const view = await service.getScanView(soldId);
      expect(view.stock_id).toBe(soldId);
      expect(view.sellable).toBe(false);
      expect(view.reject_reason).toBe('ya_vendida');
      expect(view.substituted).toBeUndefined();
      expect(view.sold_language_fallback).toBeUndefined();
    });

    it('sin candidatos → ya_vendida', async () => {
      const { service } = await setupService({ candidates: [] });
      const view = await service.getScanView(soldId);
      expect(view.stock_id).toBe(soldId);
      expect(view.sellable).toBe(false);
      expect(view.reject_reason).toBe('ya_vendida');
      expect(view.substituted).toBeUndefined();
      expect(view.sold_language_fallback).toBeUndefined();
    });

    it('vendida cuyo id está en exclude conserva sold_language_fallback', async () => {
      const { service } = await setupService({
        candidates: [sameLangAvailable],
      });
      const view = await service.getScanView(soldId, [soldId]);
      expect(view.stock_id).toBe(sameLangId);
      expect(view.sellable).toBe(true);
      expect(view.sold_language_fallback).toBe(true);
      expect(view.copy_fallback).toBeUndefined();
      expect(view.substituted).toBe(true);
    });

    it('reserva sigue sin elegir otro idioma', async () => {
      const reservedId = '507f1f77bcf86cd799439021';
      const { service } = await setupService({
        sold: {
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
        },
        candidates: [otherLangAvailable],
      });
      const view = await service.getScanView(reservedId);
      expect(view.stock_id).toBe(reservedId);
      expect(view.reserved_fallback).toBe(true);
      expect(view.substituted).toBeUndefined();
      expect(view.sold_language_fallback).toBeUndefined();
    });
  });

  describe('exclude del carrito y unidad agotada (copia equivalente)', () => {
    const scannedId = '507f1f77bcf86cd799439041';
    const sameLangId = '507f1f77bcf86cd799439042';
    const otherLangId = '507f1f77bcf86cd799439043';

    const scannedLine = {
      _id: scannedId,
      card_id: 'swsh3-136',
      card_name: 'Charizard escaneado',
      image_url: 'https://img.example/scanned.jpg',
      card_state: 'disponible',
      language: 'en',
      shipment: 0,
      cards_in_shipmet: 1,
      unity_cost: 10000,
      currency: 'COP',
      rareza: 'holofoil',
    };
    const sameLangCopy = {
      _id: sameLangId,
      card_id: 'swsh3-136',
      card_name: 'Charizard copia',
      image_url: 'https://img.example/copy.jpg',
      card_state: 'en_stock_colombia',
      language: 'en',
      shipment: 0,
      cards_in_shipmet: 1,
      unity_cost: 9000,
      currency: 'COP',
      rareza: 'holofoil',
    };
    const otherLangCopy = {
      _id: otherLangId,
      card_id: 'swsh3-136',
      card_name: 'Charizard JA',
      image_url: 'https://img.example/ja.jpg',
      card_state: 'disponible',
      language: 'ja',
      shipment: 0,
      cards_in_shipmet: 1,
      unity_cost: 8000,
      currency: 'COP',
      rareza: 'holofoil',
    };
    const pvpHolofoil = [
      { card_id: 'swsh3-136', rareza: 'holofoil', pvp: 50000, currency: 'COP' },
    ];

    async function setupService(overrides: {
      scanned?: unknown;
      candidates?: unknown[];
      pvps?: unknown[];
      tcg?: { resolveEnglishExpansionName: jest.Mock };
    }) {
      const tcg =
        overrides.tcg ??
        ({
          resolveEnglishExpansionName: jest
            .fn()
            .mockResolvedValue("Champion's Path"),
        } as { resolveEnglishExpansionName: jest.Mock });
      const stockRepository = {
        findById: jest.fn().mockResolvedValue(overrides.scanned ?? scannedLine),
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
          { provide: TCGDexService, useValue: tcg },
        ],
      }).compile();
      return {
        service: moduleRef.get(StockScanService),
        stockRepository,
        tcg,
      };
    }

    it('disponible fuera de exclude no busca equivalentes', async () => {
      const { service, stockRepository, tcg } = await setupService({
        candidates: [sameLangCopy],
      });
      const view = await service.getScanView(scannedId, [sameLangId]);
      expect(view.stock_id).toBe(scannedId);
      expect(view.sellable).toBe(true);
      expect(view.copy_fallback).toBeUndefined();
      expect(view.expansion).toBe("Champion's Path");
      expect(stockRepository.findByCardIdsInStates).not.toHaveBeenCalled();
      expect(tcg.resolveEnglishExpansionName).toHaveBeenCalled();
    });

    it('disponible en exclude devuelve otra copia del mismo idioma y copy_fallback', async () => {
      const { service, tcg } = await setupService({
        candidates: [scannedLine, otherLangCopy, sameLangCopy],
      });
      const view = await service.getScanView(scannedId, [scannedId]);
      expect(view.stock_id).toBe(sameLangId);
      expect(view.language).toBe('EN');
      expect(view.sellable).toBe(true);
      expect(view.copy_fallback).toBe(true);
      expect(view.scanned_stock_id).toBe(scannedId);
      expect(view.sold_language_fallback).toBeUndefined();
      expect(view.expansion).toBe('');
      expect(view.card_name).toBe('Charizard copia');
      expect(tcg.resolveEnglishExpansionName).not.toHaveBeenCalled();
    });

    it('si solo hay copia en otro idioma, devuelve esa', async () => {
      const { service, tcg } = await setupService({
        candidates: [otherLangCopy],
      });
      const view = await service.getScanView(scannedId, [scannedId]);
      expect(view.stock_id).toBe(otherLangId);
      expect(view.language).toBe('JA');
      expect(view.sellable).toBe(true);
      expect(view.copy_fallback).toBe(true);
      expect(view.expansion).toBe('');
      expect(tcg.resolveEnglishExpansionName).not.toHaveBeenCalled();
    });

    it('sin copia elegible no devuelve la línea excluida como vendible', async () => {
      const { service } = await setupService({
        candidates: [
          scannedLine,
          { ...sameLangCopy, rareza: null },
          { ...otherLangCopy, _id: sameLangId },
        ],
      });
      const view = await service.getScanView(scannedId, [
        scannedId,
        sameLangId,
      ]);
      expect(view.sellable).toBe(false);
      expect(view.stock_id).toBe(scannedId);
      expect(view.copy_fallback).toBeUndefined();
      expect(view.reject_reason).toBe('sin_stock');
    });

    it('quantity con su id en exclude sigue devolviendo esa misma línea', async () => {
      const bulkId = '507f1f77bcf86cd799439099';
      const stockRepository = {
        findById: jest.fn().mockResolvedValue({
          _id: bulkId,
          card_id: 'da-bulk',
          card_name: 'bulk',
          card_state: 'disponible',
          product_kind: 'quantity',
          quantity: 8,
          shipment: 0,
          cards_in_shipmet: 1,
          unity_cost: 0,
          currency: 'COP',
          image_url: '/bulk-dummy.svg',
        }),
      };
      const pvpRepository = {
        findByCardIds: jest
          .fn()
          .mockResolvedValue([
            { card_id: 'da-bulk', rareza: null, pvp: 2000, currency: 'COP' },
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
      const view = await service.getScanView(bulkId, [bulkId]);
      expect(view.stock_id).toBe(bulkId);
      expect(view.product_kind).toBe('quantity');
      expect(view.sellable).toBe(true);
      expect(view.copy_fallback).toBeUndefined();
      expect(view.quantity).toBe(8);
    });
  });

  it('incluye bulk quantity con PVP en qr-export y lo excluye si qty=0', async () => {
    const bulkId = '507f1f77bcf86cd799439099';
    const stockRepository = {
      findAll: jest.fn().mockResolvedValue([
        {
          _id: bulkId,
          card_id: 'da-bulk',
          card_name: 'bulk',
          card_state: 'disponible',
          product_kind: 'quantity',
          quantity: 5,
          language: 'es',
        },
      ]),
    };
    const pvpRepository = {
      findByCardIds: jest.fn().mockResolvedValue([
        {
          card_id: 'da-bulk',
          rareza: null,
          pvp: 2000,
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
    expect(rows[0].stock_id).toBe(bulkId);
    expect(rows[0].price_cop).toBe(2000);

    stockRepository.findAll.mockResolvedValue([
      {
        _id: bulkId,
        card_id: 'da-bulk',
        card_name: 'bulk',
        card_state: 'disponible',
        product_kind: 'quantity',
        quantity: 0,
        language: 'es',
      },
    ]);
    const empty = await service.listQrExportRows();
    expect(empty).toHaveLength(0);
  });

  it('scan de bulk incluye product_kind/quantity y sellable', async () => {
    const bulkId = '507f1f77bcf86cd799439099';
    const stockRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: bulkId,
        card_id: 'da-bulk',
        card_name: 'bulk',
        card_state: 'disponible',
        product_kind: 'quantity',
        quantity: 12,
        shipment: 0,
        cards_in_shipmet: 1,
        unity_cost: 0,
        currency: 'COP',
        image_url: '/bulk-dummy.svg',
      }),
    };
    const pvpRepository = {
      findByCardIds: jest.fn().mockResolvedValue([
        {
          card_id: 'da-bulk',
          rareza: null,
          pvp: 2000,
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
    const view = await service.getScanView(bulkId);
    expect(view.product_kind).toBe('quantity');
    expect(view.quantity).toBe(12);
    expect(view.sellable).toBe(true);
    expect(view.expansion).toBe('');
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
