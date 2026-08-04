import { Test } from '@nestjs/testing';
import { SaleController } from './sale.controller';
import { SaleRepository } from 'src/repository/sale.repository';
import { ClientRepository } from 'src/repository/client.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';

const stockId = '507f1f77bcf86cd799439011';

describe('SaleController quantity products', () => {
  let controller: SaleController;
  let saleRepository: { create: jest.Mock };
  let stockRepository: {
    findById: jest.Mock;
    updateCardState: jest.Mock;
    decrementQuantityAtomic: jest.Mock;
  };

  beforeEach(async () => {
    saleRepository = { create: jest.fn().mockResolvedValue({}) };
    stockRepository = {
      findById: jest.fn(),
      updateCardState: jest.fn().mockResolvedValue(undefined),
      decrementQuantityAtomic: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SaleController],
      providers: [
        { provide: SaleRepository, useValue: saleRepository },
        { provide: ClientRepository, useValue: {} },
        { provide: StockRepository, useValue: stockRepository },
        { provide: PvpRepository, useValue: {} },
        { provide: ReservaRepository, useValue: { deleteByStockId: jest.fn() } },
        { provide: TCGDexService, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(SaleController);
  });

  it('sell quantity=3 crea 3 Sales, decrementa y no marca vendida', async () => {
    stockRepository.findById.mockResolvedValue({
      card_id: 'da-bulk',
      card_state: 'disponible',
      product_kind: 'quantity',
      quantity: 10,
    });
    stockRepository.decrementQuantityAtomic.mockResolvedValue({
      quantity: 7,
      product_kind: 'quantity',
    });

    const res = await controller.sellCard({
      stock_id: stockId,
      card_id: 'da-bulk',
      amount_cop: 2000,
      quantity: 3,
    });

    expect(res.success).toBe(true);
    expect(saleRepository.create).toHaveBeenCalledTimes(3);
    expect(stockRepository.decrementQuantityAtomic).toHaveBeenCalledWith(
      stockId,
      3,
    );
    expect(stockRepository.updateCardState).not.toHaveBeenCalled();
  });

  it('sell con qty insuficiente no crea Sales', async () => {
    stockRepository.findById.mockResolvedValue({
      card_id: 'da-bulk',
      card_state: 'disponible',
      product_kind: 'quantity',
      quantity: 2,
    });

    const res = await controller.sellCard({
      stock_id: stockId,
      card_id: 'da-bulk',
      amount_cop: 2000,
      quantity: 5,
    });

    expect(res.success).toBe(false);
    expect(saleRepository.create).not.toHaveBeenCalled();
    expect(stockRepository.decrementQuantityAtomic).not.toHaveBeenCalled();
  });

  it('sell-batch 5× mismo stock_id con qty 3 → 3 OK + 2 fail', async () => {
    let remaining = 3;
    stockRepository.findById.mockResolvedValue({
      card_id: 'da-bulk',
      card_state: 'disponible',
      product_kind: 'quantity',
      quantity: 3,
    });
    stockRepository.decrementQuantityAtomic.mockImplementation(async () => {
      if (remaining < 1) return null;
      remaining -= 1;
      return { quantity: remaining, product_kind: 'quantity' };
    });

    const items = Array.from({ length: 5 }, () => ({
      stock_id: stockId,
      amount_cop: 2000,
    }));
    const res = await controller.sellBatch({ items });

    expect(res.sold_count).toBe(3);
    const ok = res.results.filter((r) => r.success === true);
    const fail = res.results.filter((r) => r.success === false);
    expect(ok).toHaveLength(3);
    expect(fail).toHaveLength(2);
    expect(stockRepository.updateCardState).not.toHaveBeenCalled();
  });

  it('sell unit legacy marca vendida', async () => {
    stockRepository.findById.mockResolvedValue({
      card_id: 'swsh3-136',
      card_state: 'disponible',
    });

    const res = await controller.sellCard({
      stock_id: stockId,
      card_id: 'swsh3-136',
      amount_cop: 50000,
    });

    expect(res.success).toBe(true);
    expect(saleRepository.create).toHaveBeenCalledTimes(1);
    expect(stockRepository.updateCardState).toHaveBeenCalledWith(
      stockId,
      'vendida',
    );
  });
});
