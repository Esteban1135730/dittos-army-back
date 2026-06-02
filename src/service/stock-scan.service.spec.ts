import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StockScanService } from './stock-scan.service';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';

const validId = '507f1f77bcf86cd799439011';

describe('StockScanService', () => {
  it('exporta filas con barcode_value', async () => {
    const stockRepository = {
      findAll: jest.fn().mockResolvedValue([
        { _id: validId, card_name: 'Pikachu' },
      ]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StockScanService,
        { provide: StockRepository, useValue: stockRepository },
        { provide: PvpRepository, useValue: { findByCardIds: jest.fn() } },
        { provide: CardStockTagRepository, useValue: {} },
      ],
    }).compile();
    const service = moduleRef.get(StockScanService);
    const rows = await service.listBarcodeExportRows();
    expect(rows).toEqual([
      {
        stock_id: validId,
        barcode_value: `DA-STOCK:${validId}`,
        card_name: 'Pikachu',
      },
    ]);
  });

  it('devuelve vista de escaneo con PVP en COP', async () => {
    const stockRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: validId,
        card_id: 'swsh3-136',
        card_name: 'Charizard',
        image_url: 'https://img.example/c.jpg',
        shipment: 0,
        cards_in_shipmet: 1,
        unity_cost: 1000,
        currency: 'COP',
        rareza: null,
      }),
    };
    const pvpRepository = {
      findByCardIds: jest.fn().mockResolvedValue([
        { card_id: 'swsh3-136', rareza: null, pvp: 50000, currency: 'COP' },
      ]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StockScanService,
        { provide: StockRepository, useValue: stockRepository },
        { provide: PvpRepository, useValue: pvpRepository },
        { provide: CardStockTagRepository, useValue: {} },
      ],
    }).compile();
    const service = moduleRef.get(StockScanService);
    const view = await service.getScanView(validId);
    expect(view.card_name).toBe('Charizard');
    expect(view.price_cop).toBe(50000);
    expect(view.image_url).toContain('example');
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
      ],
    }).compile();
    const service = moduleRef.get(StockScanService);
    await expect(service.getScanView(validId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
