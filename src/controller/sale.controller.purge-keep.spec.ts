import { Test } from '@nestjs/testing';
import { SaleController } from './sale.controller';
import { SaleRepository } from 'src/repository/sale.repository';
import { ClientRepository } from 'src/repository/client.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';

const saleId = '507f1f77bcf86cd799439011';
const stockId = '507f1f77bcf86cd799439022';

describe('SaleController purgeKeep (DELETE /sales/keep/:id)', () => {
  let controller: SaleController;
  let saleRepository: {
    findById: jest.Mock;
    delete: jest.Mock;
    findByType: jest.Mock;
  };
  let stockRepository: {
    deleteById: jest.Mock;
    findById: jest.Mock;
  };
  let reservaRepository: { findByStockId: jest.Mock };

  beforeEach(async () => {
    saleRepository = {
      findById: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
      findByType: jest.fn().mockResolvedValue([]),
    };
    stockRepository = {
      deleteById: jest.fn().mockResolvedValue(true),
      findById: jest.fn(),
    };
    reservaRepository = {
      findByStockId: jest.fn().mockResolvedValue(null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SaleController],
      providers: [
        { provide: SaleRepository, useValue: saleRepository },
        { provide: ClientRepository, useValue: {} },
        { provide: StockRepository, useValue: stockRepository },
        { provide: PvpRepository, useValue: {} },
        { provide: ReservaRepository, useValue: reservaRepository },
        { provide: TCGDexService, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(SaleController);
  });

  it('borra sale propiedad y stock existente', async () => {
    saleRepository.findById.mockResolvedValue({
      _id: saleId,
      stock_id: stockId,
      type: 'propiedad',
    });

    const res = await controller.purgeKeep(saleId);

    expect(res).toEqual({ success: true });
    expect(saleRepository.delete).toHaveBeenCalledWith(saleId);
    expect(stockRepository.deleteById).toHaveBeenCalledWith(stockId);
  });

  it('rechaza sale que no es tipo propiedad', async () => {
    saleRepository.findById.mockResolvedValue({
      _id: saleId,
      stock_id: stockId,
      type: 'venta',
    });

    const res = await controller.purgeKeep(saleId);

    expect(res).toEqual({
      success: false,
      message: 'Solo se pueden eliminar registros de propiedad',
    });
    expect(saleRepository.delete).not.toHaveBeenCalled();
    expect(stockRepository.deleteById).not.toHaveBeenCalled();
  });

  it('responde error si el sale no existe', async () => {
    saleRepository.findById.mockResolvedValue(null);

    const res = await controller.purgeKeep(saleId);

    expect(res).toEqual({
      success: false,
      message: 'Venta no encontrada',
    });
    expect(saleRepository.delete).not.toHaveBeenCalled();
    expect(stockRepository.deleteById).not.toHaveBeenCalled();
  });

  it('éxito si el stock ya no existe tras borrar el sale', async () => {
    saleRepository.findById.mockResolvedValue({
      _id: saleId,
      stock_id: stockId,
      type: 'propiedad',
    });
    stockRepository.deleteById.mockResolvedValue(false);

    const res = await controller.purgeKeep(saleId);

    expect(res).toEqual({ success: true });
    expect(saleRepository.delete).toHaveBeenCalledWith(saleId);
    expect(stockRepository.deleteById).toHaveBeenCalledWith(stockId);
  });

  it('tras purge, listKeepedCards no incluye ese id (smoke)', async () => {
    saleRepository.findById.mockResolvedValue({
      _id: saleId,
      stock_id: stockId,
      type: 'propiedad',
    });
    saleRepository.findByType.mockResolvedValue([
      { _id: 'other-keep', type: 'propiedad' },
    ]);

    await controller.purgeKeep(saleId);
    const keepList = (await controller.listKeepedCards()) as Array<{
      _id: string;
    }>;

    expect(keepList.map((s) => String(s._id))).not.toContain(saleId);
  });
});
