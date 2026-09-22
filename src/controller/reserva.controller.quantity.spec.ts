import { Test } from '@nestjs/testing';
import { ReservaController } from './reserva.controller';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { IncomingReservationService } from 'src/service/incoming-reservation.service';
import { IncomingReservationAbonoService } from 'src/service/incoming-reservation-abono.service';
import { StoreWhatsAppReservationImportService } from 'src/service/store-whatsapp-reservation-import.service';
import { StoreWhatsAppIncomingImportService } from 'src/service/store-whatsapp-incoming-import.service';
import { PedidoService } from 'src/service/pedido.service';

const stockId = '507f1f77bcf86cd799439011';
const clientId = '69ffb0da7b2101b0d20fdc6b';
const pedidoId = '507f1f77bcf86cd799439012';

describe('ReservaController quantity products', () => {
  let controller: ReservaController;
  let reservaRepository: {
    create: jest.Mock;
    findByStockId: jest.Mock;
    findByClientAndStockId: jest.Mock;
    findAllByStockId: jest.Mock;
    findAllByClientAndStockId: jest.Mock;
    updateById: jest.Mock;
    addQuantity: jest.Mock;
    setPedidoId: jest.Mock;
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
  let pedidoService: {
    requireReservadoPedido: jest.Mock;
    assertReservaLineMutable: jest.Mock;
    pagarReservadoDeCliente: jest.Mock;
  };

  beforeEach(async () => {
    reservaRepository = {
      create: jest.fn(),
      findByStockId: jest.fn(),
      findByClientAndStockId: jest.fn().mockResolvedValue(null),
      findAllByStockId: jest.fn().mockResolvedValue([]),
      findAllByClientAndStockId: jest.fn().mockResolvedValue([]),
      updateById: jest.fn(),
      addQuantity: jest.fn(),
      setPedidoId: jest.fn(),
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
    pedidoService = {
      requireReservadoPedido: jest.fn().mockResolvedValue({ _id: pedidoId }),
      assertReservaLineMutable: jest.fn().mockResolvedValue(undefined),
      pagarReservadoDeCliente: jest.fn().mockResolvedValue({
        success: true,
        vendidas: 3,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ReservaController],
      providers: [
        { provide: ReservaRepository, useValue: reservaRepository },
        { provide: StockRepository, useValue: stockRepository },
        { provide: IncomingReservationService, useValue: {} },
        { provide: IncomingReservationAbonoService, useValue: {} },
        { provide: StoreWhatsAppReservationImportService, useValue: {} },
        { provide: StoreWhatsAppIncomingImportService, useValue: {} },
        { provide: PedidoService, useValue: pedidoService },
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
      pedido_id: pedidoId,
    });

    const res = await controller.create({
      client_id: clientId,
      stock_id: stockId,
      precio: 2000,
      currency: 'COP',
      quantity: 3,
    });

    expect((res as { error?: string }).error).toBeUndefined();
    expect(pedidoService.requireReservadoPedido).toHaveBeenCalledWith(
      clientId,
      undefined,
    );
    expect(stockRepository.decrementQuantityAtomic).toHaveBeenCalledWith(
      stockId,
      3,
    );
    expect(stockRepository.updateCardState).not.toHaveBeenCalledWith(
      stockId,
      'reserva',
    );
    expect(reservaRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 3,
        stock_id: stockId,
        pedido_id: pedidoId,
        stock_owner: 'pablo',
      }),
    );
  });

  it('si el cliente ya tiene bulk del mismo pedido, suma quantity y no crea otra reserva', async () => {
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
      pedido_id: pedidoId,
    });
    reservaRepository.findAllByClientAndStockId.mockResolvedValue([
      {
        _id: 'res1',
        client_id: clientId,
        stock_id: stockId,
        quantity: 2,
        pedido_id: pedidoId,
      },
    ]);
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

  it('si hay reserva bulk huérfana del mismo cliente, la liga al pedido y suma', async () => {
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
      _id: 'res-orphan',
      client_id: clientId,
      stock_id: stockId,
      quantity: 2,
    });
    reservaRepository.findAllByClientAndStockId.mockResolvedValue([
      {
        _id: 'res-orphan',
        client_id: clientId,
        stock_id: stockId,
        quantity: 2,
      },
    ]);
    reservaRepository.setPedidoId.mockResolvedValue({
      _id: 'res-orphan',
      pedido_id: pedidoId,
    });
    reservaRepository.addQuantity.mockResolvedValue({
      _id: 'res-orphan',
      quantity: 4,
      pedido_id: pedidoId,
    });

    const res = await controller.create({
      client_id: clientId,
      stock_id: stockId,
      precio: 2000,
      quantity: 2,
    });

    expect(reservaRepository.setPedidoId).toHaveBeenCalledWith(
      'res-orphan',
      pedidoId,
    );
    expect(reservaRepository.create).not.toHaveBeenCalled();
    expect((res as { quantity?: number }).quantity).toBe(4);
  });

  it('cancela bulk devolviendo quantity al stock y sin tocar card_state', async () => {
    reservaRepository.findByClientAndStockId.mockResolvedValue({
      _id: 'res1',
      stock_id: stockId,
      quantity: 4,
    });
    reservaRepository.findAllByClientAndStockId.mockResolvedValue([
      {
        _id: 'res1',
        stock_id: stockId,
        quantity: 4,
      },
    ]);
    stockRepository.findById.mockResolvedValue({
      product_kind: 'quantity',
      card_state: 'disponible',
    });

    const res = await controller.cancelByStockId(stockId, clientId);

    expect(pedidoService.assertReservaLineMutable).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(stockRepository.incrementQuantityAtomic).toHaveBeenCalledWith(
      stockId,
      4,
    );
    expect(reservaRepository.deleteById).toHaveBeenCalledWith('res1');
    expect(stockRepository.updateCardState).not.toHaveBeenCalled();
  });

  it('finalizar venta de bulk delega en PedidoService', async () => {
    const res = await controller.finalizarVenta(clientId);

    expect(pedidoService.pagarReservadoDeCliente).toHaveBeenCalledWith(
      clientId,
    );
    expect(res.success).toBe(true);
    expect(res.vendidas).toBe(3);
  });
});
