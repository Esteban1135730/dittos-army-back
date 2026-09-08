import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ReservaController } from './reserva.controller';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { IncomingReservationService } from 'src/service/incoming-reservation.service';
import { IncomingReservationAbonoService } from 'src/service/incoming-reservation-abono.service';
import { StoreWhatsAppReservationImportService } from 'src/service/store-whatsapp-reservation-import.service';
import { StoreWhatsAppIncomingImportService } from 'src/service/store-whatsapp-incoming-import.service';
import { PedidoService } from 'src/service/pedido.service';
import { runWithOwnerAsync } from 'src/owner/owner-context';

const pabloId = '507f1f77bcf86cd799439011';
const estebanId = '507f1f77bcf86cd799439022';
const clientId = '69ffb0da7b2101b0d20fdc6b';
const pedidoId = '507f1f77bcf86cd799439012';

describe('ReservaController multi-owner (044)', () => {
  let controller: ReservaController;
  let reservaRepository: {
    create: jest.Mock;
    findAllByStockId: jest.Mock;
    findAllByClientAndStockId: jest.Mock;
    deleteById: jest.Mock;
    deleteByStockId: jest.Mock;
  };
  let stockRepository: {
    findById: jest.Mock;
    updateCardState: jest.Mock;
    incrementQuantityAtomic: jest.Mock;
  };
  const updateOwners: string[] = [];
  const createOwners: string[] = [];

  beforeEach(async () => {
    updateOwners.length = 0;
    createOwners.length = 0;
    reservaRepository = {
      create: jest.fn().mockImplementation(async (dto) => {
        const { getCurrentOwner } = require('src/owner/owner-context');
        createOwners.push(getCurrentOwner());
        return { _id: 'res1', ...dto };
      }),
      findAllByStockId: jest.fn().mockResolvedValue([]),
      findAllByClientAndStockId: jest.fn().mockResolvedValue([]),
      deleteById: jest.fn().mockResolvedValue(true),
      deleteByStockId: jest.fn().mockResolvedValue(true),
    };
    stockRepository = {
      findById: jest.fn().mockImplementation(async (id: string) => {
        const { getCurrentOwner } = require('src/owner/owner-context');
        const owner = getCurrentOwner();
        if (owner === 'esteban' && id === estebanId) {
          return { _id: estebanId, card_id: 'sv1-1', card_state: 'disponible' };
        }
        if (owner === 'pablo' && id === pabloId) {
          return { _id: pabloId, card_id: 'sv1-2', card_state: 'disponible' };
        }
        return null;
      }),
      updateCardState: jest.fn().mockImplementation(async () => {
        const { getCurrentOwner } = require('src/owner/owner-context');
        updateOwners.push(getCurrentOwner());
        return {};
      }),
      incrementQuantityAtomic: jest.fn().mockResolvedValue({}),
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
        {
          provide: PedidoService,
          useValue: {
            requireReservadoPedido: jest.fn().mockResolvedValue({ _id: pedidoId }),
            assertReservaLineMutable: jest.fn().mockResolvedValue(undefined),
            pagarReservadoDeCliente: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(ReservaController);
  });

  it('POST stock_owner esteban no muta stock en contexto pablo', async () => {
    await runWithOwnerAsync('pablo', async () => {
      const res = await controller.create({
        client_id: clientId,
        stock_id: estebanId,
        precio: 5000,
        stock_owner: 'esteban',
      });
      expect((res as { error?: string }).error).toBeUndefined();
    });
    expect(createOwners).toEqual(['pablo']);
    expect(updateOwners).toEqual(['esteban']);
    expect(reservaRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        stock_id: estebanId,
        stock_owner: 'esteban',
        pedido_id: pedidoId,
      }),
    );
    expect(stockRepository.updateCardState).toHaveBeenCalledWith(
      estebanId,
      'reserva',
    );
  });

  it('POST stock_owner inválido → 400', async () => {
    await expect(
      controller.create({
        client_id: clientId,
        stock_id: pabloId,
        precio: 1000,
        stock_owner: 'otro' as 'pablo',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reservaRepository.create).not.toHaveBeenCalled();
  });

  it('DELETE restaura disponible en la DB del stock_owner', async () => {
    reservaRepository.findAllByClientAndStockId.mockResolvedValue([
      {
        _id: 'res-e',
        stock_id: estebanId,
        stock_owner: 'esteban',
      },
    ]);
    await runWithOwnerAsync('pablo', async () => {
      const res = await controller.cancelByStockId(
        estebanId,
        clientId,
        'esteban',
      );
      expect(res.success).toBe(true);
    });
    expect(updateOwners).toEqual(['esteban']);
    expect(stockRepository.updateCardState).toHaveBeenCalledWith(
      estebanId,
      'disponible',
    );
    expect(reservaRepository.deleteById).toHaveBeenCalledWith('res-e');
  });

  it('DELETE legado sin stock_owner = owner actual', async () => {
    reservaRepository.findAllByClientAndStockId.mockResolvedValue([
      {
        _id: 'res-legacy',
        stock_id: pabloId,
      },
    ]);
    await runWithOwnerAsync('pablo', async () => {
      const res = await controller.cancelByStockId(pabloId, clientId);
      expect(res.success).toBe(true);
    });
    expect(updateOwners).toEqual(['pablo']);
    expect(stockRepository.updateCardState).toHaveBeenCalledWith(
      pabloId,
      'disponible',
    );
  });
});
