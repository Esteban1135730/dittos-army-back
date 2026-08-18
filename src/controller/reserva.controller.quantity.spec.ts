import { Test } from '@nestjs/testing';
import { ReservaController } from './reserva.controller';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { SaleRepository } from 'src/repository/sale.repository';
import { IncomingReservationService } from 'src/service/incoming-reservation.service';
import { StoreWhatsAppReservationImportService } from 'src/service/store-whatsapp-reservation-import.service';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';

const stockId = '507f1f77bcf86cd799439011';
const clientId = '69ffb0da7b2101b0d20fdc6b';

describe('ReservaController quantity products', () => {
  let controller: ReservaController;
  let reservaRepository: {
    create: jest.Mock;
    findByStockId: jest.Mock;
    findByClientAndStockId: jest.Mock;
    addQuantity: jest.Mock;
    deleteById: jest.Mock;
    deleteByStockId: jest.Mock;
    findByClientId: jest.Mock;
  };
  let stockRepository: {
    findById: jest.Mock;
    updateCardState: jest.Mock;
    decrementQuantityAtomic: jest.Mock;
    incrementQuantityAtomic: jest.Mock;
  };
  let saleRepository: { create: jest.Mock };

  beforeEach(async () => {
    reservaRepository = {
      create: jest.fn(),
      findByStockId: jest.fn(),
      findByClientAndStockId: jest.fn().mockResolvedValue(null),
      addQuantity: jest.fn(),
      deleteById: jest.fn().mockResolvedValue(true),
      deleteByStockId: jest.fn().mockResolvedValue(true),
      findByClientId: jest.fn(),
    };
    stockRepository = {
      findById: jest.fn(),
      updateCardState: jest.fn().mockResolvedValue(undefined),
      decrementQuantityAtomic: jest.fn(),
      incrementQuantityAtomic: jest.fn(),
    };
    saleRepository = { create: jest.fn().mockResolvedValue({}) };

    const moduleRef = await Test.createTestingModule({
      controllers: [ReservaController],
      providers: [
        { provide: ReservaRepository, useValue: reservaRepository },
        { provide: StockRepository, useValue: stockRepository },
        { provide: SaleRepository, useValue: saleRepository },
        { provide: IncomingReservationService, useValue: {} },
        { provide: StoreWhatsAppReservationImportService, useValue: {} },
        {
          provide: CardStockTagRepository,
          useValue: {
            findMapByCardIds: jest.fn().mockResolvedValue(new Map()),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(ReservaController);
  });

  it('reserva bulk sin marcar la línea como reserva y decrementa cantidad', async () => {
    stockRepository.findById.mockResolvedValue({
      _id: stockId,
      card_id: 'da-bulk',
      card_state: 'disponible',
      product_kind: 'quantity',
      quantity: 20,
    });
    stockRepository.decrementQuantityAtomic.mockResolvedValue({
      quantity: 17,
      product_kind: 'quantity',
    });
    reservaRepository.create.mockResolvedValue({
      _id: 'res1',
      client_id: clientId,
      stock_id: stockId,
      precio: 2000,
      quantity: 3,
    });

    const res = await controller.create({
      client_id: clientId,
      stock_id: stockId,
      precio: 2000,
      currency: 'COP',
      quantity: 3,
    });

    expect((res as { error?: string }).error).toBeUndefined();
    expect(stockRepository.decrementQuantityAtomic).toHaveBeenCalledWith(
      stockId,
      3,
    );
    expect(stockRepository.updateCardState).not.toHaveBeenCalledWith(
      stockId,
      'reserva',
    );
    expect(reservaRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 3, stock_id: stockId }),
    );
  });

  it('si el cliente ya tiene bulk, suma quantity y no crea otra reserva', async () => {
    stockRepository.findById.mockResolvedValue({
      _id: stockId,
      card_id: 'da-bulk',
      card_state: 'disponible',
      product_kind: 'quantity',
      quantity: 10,
    });
    stockRepository.decrementQuantityAtomic.mockResolvedValue({
      quantity: 8,
      product_kind: 'quantity',
    });
    reservaRepository.findByClientAndStockId.mockResolvedValue({
      _id: 'res1',
      client_id: clientId,
      stock_id: stockId,
      quantity: 2,
    });
    reservaRepository.addQuantity.mockResolvedValue({
      _id: 'res1',
      quantity: 4,
    });

    const res = await controller.create({
      client_id: clientId,
      stock_id: stockId,
      precio: 2000,
      quantity: 2,
    });

    expect(reservaRepository.create).not.toHaveBeenCalled();
    expect(reservaRepository.addQuantity).toHaveBeenCalledWith('res1', 2);
    expect((res as { quantity?: number }).quantity).toBe(4);
  });

  it('cancela bulk devolviendo quantity al stock y sin tocar card_state', async () => {
    reservaRepository.findByClientAndStockId.mockResolvedValue({
      _id: 'res1',
      stock_id: stockId,
      quantity: 4,
    });
    stockRepository.findById.mockResolvedValue({
      product_kind: 'quantity',
      card_state: 'disponible',
    });

    const res = await controller.cancelByStockId(stockId, clientId);

    expect(res.success).toBe(true);
    expect(stockRepository.incrementQuantityAtomic).toHaveBeenCalledWith(
      stockId,
      4,
    );
    expect(reservaRepository.deleteById).toHaveBeenCalledWith('res1');
    expect(stockRepository.updateCardState).not.toHaveBeenCalled();
  });

  it('finalizar venta de bulk crea N sales y no marca vendida', async () => {
    reservaRepository.findByClientId.mockResolvedValue([
      {
        _id: 'res1',
        stock_id: stockId,
        precio: 2000,
        currency: 'COP',
        quantity: 3,
      },
    ]);
    stockRepository.findById.mockResolvedValue({
      card_id: 'da-bulk',
      product_kind: 'quantity',
      card_state: 'disponible',
    });

    const res = await controller.finalizarVenta(clientId);

    expect(res.success).toBe(true);
    expect(res.vendidas).toBe(3);
    expect(saleRepository.create).toHaveBeenCalledTimes(3);
    expect(stockRepository.updateCardState).not.toHaveBeenCalled();
    expect(reservaRepository.deleteById).toHaveBeenCalledWith('res1');
  });
});
