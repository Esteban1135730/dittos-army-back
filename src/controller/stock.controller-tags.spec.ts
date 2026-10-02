import { Test } from '@nestjs/testing';
import { StockController } from './stock.controller';
import { StockRepository } from 'src/repository/stock.repository';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { StoreInventoryService } from 'src/service/store-inventory.service';
import { OpenedSealedStockService } from 'src/service/opened-sealed-stock.service';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { SaleRepository } from 'src/repository/sale.repository';
import { StockScanService } from 'src/service/stock-scan.service';
import { StockReviewService } from 'src/service/stock-review.service';
import { BulkProductService } from 'src/service/bulk-product.service';
import { StockPhotoService } from 'src/service/stock-photo.service';
import { LocalCardImagesService } from 'src/pokemon';

const stockScanMock = {
  listBarcodeExportRows: jest.fn(),
  listQrExportRows: jest.fn(),
  getScanView: jest.fn(),
};

describe('StockController.listStock (tags por card_id)', () => {
  it('prioriza tags de card_stock_tags sobre tags legacy en el documento', async () => {
    const stockRow = {
      _id: '507f1f77bcf86cd799439011',
      __v: 0,
      card_id: 'sv1-1',
      card_name: 'Test',
      shipment: 0,
      cards_in_shipmet: 1,
      unity_cost: 100,
      currency: 'EUR',
      tags: ['bulk'],
    };

    const stockRepository = {
      findAllLean: jest.fn().mockResolvedValue([stockRow]),
    };
    const cardStockTagRepository = {
      findMapByCardIds: jest
        .fn()
        .mockResolvedValue(new Map<string, string[]>([['sv1-1', ['vintage']]])),
      setTagsForCardId: jest.fn(),
    };
    const pvpRepository = {
      findByCardIdsLean: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [StockController],
      providers: [
        { provide: StockRepository, useValue: stockRepository },
        { provide: CardStockTagRepository, useValue: cardStockTagRepository },
        { provide: PvpRepository, useValue: pvpRepository },
        { provide: StoreInventoryService, useValue: {} },
        { provide: OpenedSealedStockService, useValue: {} },
        { provide: ReservaRepository, useValue: {} },
        { provide: SaleRepository, useValue: {} },
        { provide: StockScanService, useValue: stockScanMock },
        { provide: StockReviewService, useValue: { listPerdidas: jest.fn() } },
        { provide: BulkProductService, useValue: { ensureBulk: jest.fn() } },
        { provide: StockPhotoService, useValue: {} },
        { provide: LocalCardImagesService, useValue: { resolve: jest.fn() } },
      ],
    }).compile();

    const controller = moduleRef.get(StockController);
    const rows = await controller.listStock();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows![0].tags).toEqual(['vintage']);
    expect(cardStockTagRepository.findMapByCardIds).toHaveBeenCalledWith([
      'sv1-1',
    ]);
    expect(rows![0]).toEqual({
      _id: '507f1f77bcf86cd799439011',
      __v: 0,
      card_id: 'sv1-1',
      card_name: 'Test',
      image_url: '',
      shipment: 0,
      cards_in_shipmet: 1,
      unity_cost: 100,
      currency: 'EUR',
      tags: ['vintage'],
      card_cost: 100,
      pvp: undefined,
      pvp_currency: undefined,
      product_kind: 'unit',
      quantity: null,
    });
  });

  it('si no hay fila en card_stock_tags, usa tags del documento stock', async () => {
    const stockRow = {
      _id: '507f1f77bcf86cd799439012',
      card_id: 'sv1-2',
      card_name: 'Legacy',
      shipment: 0,
      cards_in_shipmet: 1,
      unity_cost: 50,
      currency: 'EUR',
      tags: ['jugable'],
    };

    const stockRepository = {
      findAllLean: jest.fn().mockResolvedValue([stockRow]),
    };
    const cardStockTagRepository = {
      findMapByCardIds: jest
        .fn()
        .mockResolvedValue(new Map<string, string[]>()),
      setTagsForCardId: jest.fn(),
    };
    const pvpRepository = {
      findByCardIdsLean: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [StockController],
      providers: [
        { provide: StockRepository, useValue: stockRepository },
        { provide: CardStockTagRepository, useValue: cardStockTagRepository },
        { provide: PvpRepository, useValue: pvpRepository },
        { provide: StoreInventoryService, useValue: {} },
        { provide: OpenedSealedStockService, useValue: {} },
        { provide: ReservaRepository, useValue: {} },
        { provide: SaleRepository, useValue: {} },
        { provide: StockScanService, useValue: stockScanMock },
        { provide: StockReviewService, useValue: { listPerdidas: jest.fn() } },
        { provide: BulkProductService, useValue: { ensureBulk: jest.fn() } },
        { provide: StockPhotoService, useValue: {} },
        { provide: LocalCardImagesService, useValue: { resolve: jest.fn() } },
      ],
    }).compile();

    const controller = moduleRef.get(StockController);
    const rows = await controller.listStock();
    expect(rows![0].tags).toEqual(['jugable']);
  });
});
