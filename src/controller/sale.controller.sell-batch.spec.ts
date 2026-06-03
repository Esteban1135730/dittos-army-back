import { Test } from '@nestjs/testing';
import { SaleController } from './sale.controller';
import { SaleRepository } from 'src/repository/sale.repository';
import { ClientRepository } from 'src/repository/client.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';

const stockId = '507f1f77bcf86cd799439011';

describe('SaleController sell-batch', () => {
  let controller: SaleController;
  let saleRepository: { create: jest.Mock };
  let stockRepository: {
    findById: jest.Mock;
    updateCardState: jest.Mock;
  };

  beforeEach(async () => {
    saleRepository = { create: jest.fn().mockResolvedValue({}) };
    stockRepository = {
      findById: jest.fn().mockResolvedValue({
        card_id: 'swsh3-136',
        card_state: 'disponible',
      }),
      updateCardState: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SaleController],
      providers: [
        { provide: SaleRepository, useValue: saleRepository },
        { provide: ClientRepository, useValue: {} },
        { provide: StockRepository, useValue: stockRepository },
        { provide: PvpRepository, useValue: {} },
        { provide: TCGDexService, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(SaleController);
  });

  it('vende items válidos en lote', async () => {
    const res = await controller.sellBatch({
      items: [{ stock_id: stockId, amount_cop: 50000 }],
    });
    expect(res.sold_count).toBe(1);
    expect(res.results[0].success).toBe(true);
    expect(saleRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        stock_id: stockId,
        type: 'venta',
        amount_cop: 50000,
      }),
    );
    expect(stockRepository.updateCardState).toHaveBeenCalledWith(
      stockId,
      'vendida',
    );
  });

  it('reporta fallo si ya está vendida', async () => {
    stockRepository.findById.mockResolvedValue({
      card_id: 'swsh3-136',
      card_state: 'vendida',
    });
    const res = await controller.sellBatch({
      items: [{ stock_id: stockId, amount_cop: 50000 }],
    });
    expect(res.sold_count).toBe(0);
    expect(res.results[0].message).toContain('vendida');
    expect(saleRepository.create).not.toHaveBeenCalled();
  });
});
