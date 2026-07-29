import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StockController } from './stock.controller';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { StoreInventoryService } from 'src/service/store-inventory.service';
import { OpenedSealedStockService } from 'src/service/opened-sealed-stock.service';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { SaleRepository } from 'src/repository/sale.repository';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';
import { StockScanService } from 'src/service/stock-scan.service';
import { StockReviewService } from 'src/service/stock-review.service';

describe('StockController.deleteStock', () => {
  const validId = '507f1f77bcf86cd799439011';

  async function setupController(overrides: {
    findById?: unknown;
    findByStockId?: unknown;
    findOneByStockId?: unknown;
    deleteById?: boolean;
  }) {
    const stockRepository = {
      findById: jest
        .fn()
        .mockResolvedValue(
          overrides.findById !== undefined
            ? overrides.findById
            : { _id: validId },
        ),
      deleteById: jest
        .fn()
        .mockResolvedValue(
          overrides.deleteById !== undefined ? overrides.deleteById : true,
        ),
    };
    const reservaRepository = {
      findByStockId: jest
        .fn()
        .mockResolvedValue(
          overrides.findByStockId !== undefined
            ? overrides.findByStockId
            : null,
        ),
    };
    const saleRepository = {
      findOneByStockId: jest
        .fn()
        .mockResolvedValue(
          overrides.findOneByStockId !== undefined
            ? overrides.findOneByStockId
            : null,
        ),
    };
    const cardStockTagRepository = {
      findMapByCardIds: jest.fn().mockResolvedValue(new Map()),
      setTagsForCardId: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [StockController],
      providers: [
        { provide: StockRepository, useValue: stockRepository },
        { provide: CardStockTagRepository, useValue: cardStockTagRepository },
        { provide: PvpRepository, useValue: {} },
        { provide: StoreInventoryService, useValue: {} },
        { provide: OpenedSealedStockService, useValue: {} },
        { provide: ReservaRepository, useValue: reservaRepository },
        { provide: SaleRepository, useValue: saleRepository },
        {
          provide: StockScanService,
          useValue: {
            listBarcodeExportRows: jest.fn(),
            listQrExportRows: jest.fn(),
            getScanView: jest.fn(),
          },
        },
        { provide: StockReviewService, useValue: { listPerdidas: jest.fn() } },
      ],
    }).compile();

    const controller = moduleRef.get(StockController);
    return {
      controller,
      stockRepository,
      reservaRepository,
      saleRepository,
    };
  }

  it('elimina cuando no hay reserva ni venta', async () => {
    const { controller, stockRepository } = await setupController({});
    await expect(controller.deleteStock(validId)).resolves.toBeUndefined();
    expect(stockRepository.deleteById).toHaveBeenCalledWith(validId);
  });

  it('rechaza id inválido', async () => {
    const { controller, stockRepository } = await setupController({});
    await expect(
      controller.deleteStock('no-es-objectid'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(stockRepository.findById).not.toHaveBeenCalled();
  });

  it('404 si no existe stock', async () => {
    const { controller, stockRepository } = await setupController({
      findById: null,
    });
    await expect(controller.deleteStock(validId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(stockRepository.deleteById).not.toHaveBeenCalled();
  });

  it('409 si hay reserva', async () => {
    const { controller, stockRepository } = await setupController({
      findByStockId: { _id: 'reserva1' },
    });
    await expect(controller.deleteStock(validId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(stockRepository.deleteById).not.toHaveBeenCalled();
  });

  it('409 si hay venta', async () => {
    const { controller, stockRepository } = await setupController({
      findOneByStockId: { _id: 'sale1' },
    });
    await expect(controller.deleteStock(validId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(stockRepository.deleteById).not.toHaveBeenCalled();
  });

  it('404 si deleteById no borró (carrera)', async () => {
    const { controller } = await setupController({ deleteById: false });
    await expect(controller.deleteStock(validId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('StockController.scanStockLine', () => {
  async function setupScanController() {
    const stockScanService = {
      listBarcodeExportRows: jest.fn(),
      listQrExportRows: jest.fn(),
      getScanView: jest.fn().mockResolvedValue({ stock_id: 'x' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [StockController],
      providers: [
        { provide: StockRepository, useValue: {} },
        {
          provide: CardStockTagRepository,
          useValue: {
            findMapByCardIds: jest.fn(),
            setTagsForCardId: jest.fn(),
          },
        },
        { provide: PvpRepository, useValue: {} },
        { provide: StoreInventoryService, useValue: {} },
        { provide: OpenedSealedStockService, useValue: {} },
        { provide: ReservaRepository, useValue: {} },
        { provide: SaleRepository, useValue: {} },
        { provide: StockScanService, useValue: stockScanService },
        { provide: StockReviewService, useValue: { listPerdidas: jest.fn() } },
      ],
    }).compile();
    return {
      controller: moduleRef.get(StockController),
      stockScanService,
    };
  }

  it('pasa exclude parseado al servicio', async () => {
    const { controller, stockScanService } = await setupScanController();
    await controller.scanStockLine('abc', ' id1 ,id2,, id3');
    expect(stockScanService.getScanView).toHaveBeenCalledWith('abc', [
      'id1',
      'id2',
      'id3',
    ]);
  });

  it('sin exclude pasa lista vacía', async () => {
    const { controller, stockScanService } = await setupScanController();
    await controller.scanStockLine('abc');
    expect(stockScanService.getScanView).toHaveBeenCalledWith('abc', []);
  });
});

describe('StockController.listStockByCardId', () => {
  async function setupGroupController(stocks: unknown[]) {
    const stockRepository = {
      findByCardId: jest.fn().mockResolvedValue(stocks),
      findById: jest.fn(),
      deleteById: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [StockController],
      providers: [
        { provide: StockRepository, useValue: stockRepository },
        {
          provide: CardStockTagRepository,
          useValue: {
            findMapByCardIds: jest.fn(),
            setTagsForCardId: jest.fn(),
          },
        },
        { provide: PvpRepository, useValue: {} },
        { provide: StoreInventoryService, useValue: {} },
        { provide: OpenedSealedStockService, useValue: {} },
        { provide: ReservaRepository, useValue: {} },
        { provide: SaleRepository, useValue: {} },
        {
          provide: StockScanService,
          useValue: {
            listBarcodeExportRows: jest.fn(),
            listQrExportRows: jest.fn(),
            getScanView: jest.fn(),
          },
        },
        { provide: StockReviewService, useValue: { listPerdidas: jest.fn() } },
      ],
    }).compile();

    return {
      controller: moduleRef.get(StockController),
      stockRepository,
    };
  }

  it('promedia costo y cantidad solo sobre stock disponible/vendible', async () => {
    const { controller, stockRepository } = await setupGroupController([
      {
        card_state: 'disponible',
        currency: 'COP',
        unity_cost: 1000,
        shipment: 0,
        cards_in_shipmet: 1,
      },
      {
        card_state: 'en_stock_colombia',
        currency: 'COP',
        unity_cost: 3000,
        shipment: 0,
        cards_in_shipmet: 1,
      },
      {
        card_state: 'reserva',
        currency: 'COP',
        unity_cost: 99999,
        shipment: 0,
        cards_in_shipmet: 1,
      },
      {
        card_state: 'vendida',
        currency: 'COP',
        unity_cost: 1,
        shipment: 0,
        cards_in_shipmet: 1,
      },
      {
        card_state: 'propiedad',
        currency: 'COP',
        unity_cost: 2,
        shipment: 0,
        cards_in_shipmet: 1,
      },
    ]);

    const result = await controller.listStockByCardId({ card_id: 'sv1-1' });

    expect(stockRepository.findByCardId).toHaveBeenCalledWith('sv1-1');
    expect(result).toEqual({
      quantity: 2,
      card_value_EUR: 0,
      card_value_COP: 2000,
      primary_currency: 'COP',
    });
  });

  it('devuelve ceros si no hay unidades disponibles', async () => {
    const { controller } = await setupGroupController([
      {
        card_state: 'reserva',
        currency: 'EUR',
        unity_cost: 5,
        shipment: 0,
        cards_in_shipmet: 1,
      },
    ]);

    await expect(
      controller.listStockByCardId({ card_id: 'sv1-2' }),
    ).resolves.toEqual({
      quantity: 0,
      card_value_EUR: 0,
      card_value_COP: 0,
      primary_currency: 'EUR',
    });
  });
});
