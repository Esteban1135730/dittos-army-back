import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StockController } from './stock.controller';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { StoreInventoryService } from 'src/service/store-inventory.service';
import { OpenedSealedStockService } from 'src/service/opened-sealed-stock.service';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { SaleRepository } from 'src/repository/sale.repository';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';

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
          overrides.findById !== undefined ? overrides.findById : { _id: validId },
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
          overrides.findByStockId !== undefined ? overrides.findByStockId : null,
        ),
    };
    const saleRepository = {
      findOneByStockId: jest
        .fn()
        .mockResolvedValue(
          overrides.findOneByStockId !== undefined ? overrides.findOneByStockId : null,
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
    await expect(controller.deleteStock('no-es-objectid')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(stockRepository.findById).not.toHaveBeenCalled();
  });

  it('404 si no existe stock', async () => {
    const { controller, stockRepository } = await setupController({ findById: null });
    await expect(controller.deleteStock(validId)).rejects.toBeInstanceOf(NotFoundException);
    expect(stockRepository.deleteById).not.toHaveBeenCalled();
  });

  it('409 si hay reserva', async () => {
    const { controller, stockRepository } = await setupController({
      findByStockId: { _id: 'reserva1' },
    });
    await expect(controller.deleteStock(validId)).rejects.toBeInstanceOf(ConflictException);
    expect(stockRepository.deleteById).not.toHaveBeenCalled();
  });

  it('409 si hay venta', async () => {
    const { controller, stockRepository } = await setupController({
      findOneByStockId: { _id: 'sale1' },
    });
    await expect(controller.deleteStock(validId)).rejects.toBeInstanceOf(ConflictException);
    expect(stockRepository.deleteById).not.toHaveBeenCalled();
  });

  it('404 si deleteById no borró (carrera)', async () => {
    const { controller } = await setupController({ deleteById: false });
    await expect(controller.deleteStock(validId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
