import { BadRequestException } from '@nestjs/common';
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

const stockScanMock = {
  listBarcodeExportRows: jest.fn(),
  listQrExportRows: jest.fn(),
  getScanView: jest.fn(),
};

describe('StockController language validation', () => {
  async function setup() {
    const stockRepository = {
      create: jest.fn().mockImplementation(async (payload) => payload),
      update: jest.fn().mockImplementation(async (payload) => payload),
    };
    const cardStockTagRepository = {
      setTagsForCardId: jest.fn().mockResolvedValue(undefined),
      findMapByCardIds: jest.fn().mockResolvedValue(new Map()),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [StockController],
      providers: [
        { provide: StockRepository, useValue: stockRepository },
        { provide: CardStockTagRepository, useValue: cardStockTagRepository },
        { provide: PvpRepository, useValue: {} },
        { provide: StoreInventoryService, useValue: {} },
        { provide: OpenedSealedStockService, useValue: {} },
        { provide: ReservaRepository, useValue: {} },
        { provide: SaleRepository, useValue: {} },
        { provide: StockScanService, useValue: stockScanMock },
        { provide: StockReviewService, useValue: { listPerdidas: jest.fn() } },
        { provide: BulkProductService, useValue: { ensureBulk: jest.fn() } },
      ],
    }).compile();

    return {
      controller: moduleRef.get(StockController),
      stockRepository,
    };
  }

  it('normaliza zh-cn y persiste language en saveStock', async () => {
    const { controller, stockRepository } = await setup();
    await controller.saveStock({
      card_id: 'sv1-1',
      card_name: 'Test',
      shipment: 10,
      unity_cost: 5,
      cards_in_shipmet: 1,
      image_url: '',
      currency: 'EUR',
      language: 'ZH-CN',
    });
    expect(stockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'zh-cn' }),
    );
  });

  it('rechaza language inválido', async () => {
    const { controller, stockRepository } = await setup();
    await expect(
      controller.saveStock({
        card_id: 'sv1-1',
        card_name: 'Test',
        shipment: 10,
        unity_cost: 5,
        cards_in_shipmet: 1,
        image_url: '',
        currency: 'EUR',
        language: 'jp',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(stockRepository.create).not.toHaveBeenCalled();
  });
});
