import { ConflictException } from '@nestjs/common';
import { IncomingReservationService } from './incoming-reservation.service';
import { ReservaIncomingRepository } from '../repository/reserva-incoming.repository';
import { CardtraderTransitLineRepository } from '../repository/cardtrader-transit-line.repository';

describe('IncomingReservationService.addQuantity (cupo)', () => {
  function makeService(deps: {
    sumPending: number;
    remaining: number;
    existingQty: number;
  }) {
    const reservaIncomingRepo = {
      sumQuantityForBatchItem: jest.fn().mockResolvedValue(deps.sumPending),
      findByClientAndBatchItem: jest.fn().mockResolvedValue(
        deps.existingQty > 0
          ? {
              quantity: deps.existingQty,
              _id: 'rid',
              client_id: 'c1',
              batch_item_id: 'b1',
            }
          : null,
      ),
      upsertQuantity: jest
        .fn()
        .mockResolvedValue({ toObject: () => ({ ok: true }) }),
    } as unknown as ReservaIncomingRepository;

    const transitLineRepo = {
      findById: jest.fn().mockResolvedValue({
        _id: 'b1',
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        language: 'en',
        remaining_quantity: deps.remaining,
      }),
    } as unknown as CardtraderTransitLineRepository;

    return new IncomingReservationService(
      reservaIncomingRepo,
      transitLineRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { findReservadoByClientId: jest.fn().mockResolvedValue(null) } as any,
    );
  }

  it('permite reserva cuando hay cupo', async () => {
    const svc = makeService({ sumPending: 2, remaining: 10, existingQty: 2 });
    await expect(svc.addQuantity('c1', 'b1', 3)).resolves.toBeDefined();
  });

  it('lanza ConflictException cuando se supera remaining_quantity', async () => {
    const svc = makeService({ sumPending: 2, remaining: 5, existingQty: 2 });
    await expect(svc.addQuantity('c1', 'b1', 10)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('IncomingReservationService.materializeForNewStockLines', () => {
  function makeMaterializeService(opts: { pedidoId: string | null }) {
    const reservaIncomingRepo = {
      consumeOneFifo: jest
        .fn()
        .mockResolvedValue({ client_id: 'c1', precio_cop: 5000 }),
      restoreFifoSlot: jest.fn().mockResolvedValue(undefined),
    };
    const reservaRepository = {
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue([]),
      deleteManyByStockIds: jest.fn().mockResolvedValue(0),
    };
    const stockRepository = {
      updateCardState: jest.fn().mockResolvedValue({}),
      updateCardStateMany: jest.fn().mockResolvedValue(0),
    };
    const pvpRepository = {
      findByCardIds: jest.fn().mockResolvedValue([]),
    };
    const pedidoRepository = {
      findReservadoByClientId: jest
        .fn()
        .mockResolvedValue(opts.pedidoId ? { _id: opts.pedidoId } : null),
    };
    const svc = new IncomingReservationService(
      reservaIncomingRepo as any,
      {} as any,
      {} as any,
      reservaRepository as any,
      stockRepository as any,
      pvpRepository as any,
      pedidoRepository as any,
    );
    return {
      svc,
      reservaRepository,
      pedidoRepository,
      reservaIncomingRepo,
      stockRepository,
    };
  }

  it('liga la reserva materializada al pedido reservado del cliente', async () => {
    const { svc, reservaRepository } = makeMaterializeService({
      pedidoId: 'p-open',
    });
    await svc.materializeForNewStockLines(
      [{ _id: 's1', card_id: 'sv1-1' }] as any,
      ['line1'],
    );
    expect(reservaRepository.createMany).toHaveBeenCalledWith([
      expect.objectContaining({
        client_id: 'c1',
        stock_id: 's1',
        pedido_id: 'p-open',
      }),
    ]);
  });

  it('deja la reserva sin pedido_id si el cliente no tiene pedido reservado', async () => {
    const { svc, reservaRepository } = makeMaterializeService({
      pedidoId: null,
    });
    await svc.materializeForNewStockLines(
      [{ _id: 's1', card_id: 'sv1-1' }] as any,
      ['line1'],
    );
    const arg = reservaRepository.createMany.mock.calls[0][0][0];
    expect(arg.client_id).toBe('c1');
    expect(arg.pedido_id).toBeUndefined();
  });

  it('consume cupos FIFO en orden y escribe reservas/estados en bloque', async () => {
    const {
      svc,
      reservaRepository,
      reservaIncomingRepo,
      stockRepository,
      pedidoRepository,
    } = makeMaterializeService({ pedidoId: 'p-open' });
    reservaIncomingRepo.consumeOneFifo
      .mockReset()
      .mockResolvedValueOnce({ client_id: 'c1', precio_cop: 5000 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ client_id: 'c2', precio_cop: 7000 })
      .mockResolvedValueOnce({ client_id: 'c1', precio_cop: 0 });

    await svc.materializeForNewStockLines(
      [
        { _id: 's1', card_id: 'sv1-1' },
        { _id: 's2', card_id: 'sv1-1' },
        { _id: 's3', card_id: 'sv1-2' },
        { _id: 's4', card_id: 'sv1-1' },
      ] as any,
      ['l1', 'l1', 'l2', 'l1'],
    );

    expect(
      reservaIncomingRepo.consumeOneFifo.mock.calls.map((c) => c[0] as string),
    ).toEqual(['l1', 'l1', 'l2', 'l1']);
    expect(reservaRepository.create).not.toHaveBeenCalled();
    expect(reservaRepository.createMany).toHaveBeenCalledTimes(1);
    expect(reservaRepository.createMany).toHaveBeenCalledWith([
      {
        client_id: 'c1',
        stock_id: 's1',
        precio: 5000,
        currency: 'COP',
        pedido_id: 'p-open',
      },
      {
        client_id: 'c2',
        stock_id: 's3',
        precio: 7000,
        currency: 'COP',
        pedido_id: 'p-open',
      },
      {
        client_id: 'c1',
        stock_id: 's4',
        precio: 0,
        currency: 'COP',
        pedido_id: 'p-open',
      },
    ]);
    expect(stockRepository.updateCardState).not.toHaveBeenCalled();
    expect(stockRepository.updateCardStateMany).toHaveBeenCalledWith(
      ['s1', 's3', 's4'],
      'reserva',
    );
    expect(pedidoRepository.findReservadoByClientId).toHaveBeenCalledTimes(2);
  });

  it('sin cupos no escribe nada', async () => {
    const { svc, reservaRepository, reservaIncomingRepo, stockRepository } =
      makeMaterializeService({ pedidoId: null });
    reservaIncomingRepo.consumeOneFifo.mockReset().mockResolvedValue(null);

    await svc.materializeForNewStockLines(
      [{ _id: 's1', card_id: 'sv1-1' }] as any,
      ['l1'],
    );

    expect(reservaRepository.createMany).not.toHaveBeenCalled();
    expect(stockRepository.updateCardStateMany).not.toHaveBeenCalled();
  });

  describe('compensación si falla la escritura en bloque', () => {
    const t1 = new Date('2026-01-01T00:00:00Z');
    const t2 = new Date('2026-01-02T00:00:00Z');
    const stocks = [
      { _id: 's1', card_id: 'sv1-1', card_state: 'disponible' },
      { _id: 's2', card_id: 'sv1-1', card_state: 'disponible' },
      { _id: 's3', card_id: 'sv1-2', card_state: 'disponible' },
    ] as any;

    function setup() {
      const ctx = makeMaterializeService({ pedidoId: null });
      ctx.reservaIncomingRepo.consumeOneFifo
        .mockReset()
        .mockResolvedValueOnce({
          client_id: 'c1',
          precio_cop: 5000,
          created_at: t1,
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          client_id: 'c2',
          precio_cop: null,
          created_at: t2,
        });
      jest
        .spyOn((ctx.svc as any).logger, 'error')
        .mockImplementation(() => undefined);
      return ctx;
    }

    it('insertMany falla → borra reservas parciales, devuelve cupos y relanza', async () => {
      const { svc, reservaRepository, reservaIncomingRepo, stockRepository } =
        setup();
      reservaRepository.createMany.mockRejectedValueOnce(new Error('E11000'));

      await expect(
        svc.materializeForNewStockLines(stocks, ['l1', 'l1', 'l2']),
      ).rejects.toThrow('E11000');

      expect(reservaRepository.deleteManyByStockIds).toHaveBeenCalledWith([
        's1',
        's3',
      ]);
      expect(reservaIncomingRepo.restoreFifoSlot.mock.calls).toEqual([
        [
          {
            client_id: 'c2',
            precio_cop: null,
            created_at: t2,
            batch_item_id: 'l2',
          },
        ],
        [
          {
            client_id: 'c1',
            precio_cop: 5000,
            created_at: t1,
            batch_item_id: 'l1',
          },
        ],
      ]);
      expect(stockRepository.updateCardStateMany).not.toHaveBeenCalled();
    });

    it('updateMany de estado falla → revierte estado, borra reservas y devuelve cupos', async () => {
      const { svc, reservaRepository, reservaIncomingRepo, stockRepository } =
        setup();
      stockRepository.updateCardStateMany
        .mockRejectedValueOnce(new Error('net'))
        .mockResolvedValue(2);

      await expect(
        svc.materializeForNewStockLines(stocks, ['l1', 'l1', 'l2']),
      ).rejects.toThrow('net');

      expect(stockRepository.updateCardStateMany).toHaveBeenNthCalledWith(
        2,
        ['s1', 's3'],
        'disponible',
      );
      expect(reservaRepository.deleteManyByStockIds).toHaveBeenCalledWith([
        's1',
        's3',
      ]);
      expect(reservaIncomingRepo.restoreFifoSlot).toHaveBeenCalledTimes(2);
    });

    it('fallo al consumir un cupo devuelve los ya consumidos sin tocar reservas', async () => {
      const { svc, reservaRepository, reservaIncomingRepo } = setup();
      reservaIncomingRepo.consumeOneFifo
        .mockReset()
        .mockResolvedValueOnce({
          client_id: 'c1',
          precio_cop: 5000,
          created_at: t1,
        })
        .mockRejectedValueOnce(new Error('reintentos'));

      await expect(
        svc.materializeForNewStockLines(stocks, ['l1', 'l1', 'l2']),
      ).rejects.toThrow('reintentos');

      expect(reservaRepository.createMany).not.toHaveBeenCalled();
      expect(reservaRepository.deleteManyByStockIds).not.toHaveBeenCalled();
      expect(reservaIncomingRepo.restoreFifoSlot).toHaveBeenCalledTimes(1);
    });

    it('si no se pueden borrar las reservas no devuelve cupos (evita duplicar) y relanza el error original', async () => {
      const { svc, reservaRepository, reservaIncomingRepo } = setup();
      reservaRepository.createMany.mockRejectedValueOnce(new Error('E11000'));
      reservaRepository.deleteManyByStockIds.mockRejectedValueOnce(
        new Error('db down'),
      );

      await expect(
        svc.materializeForNewStockLines(stocks, ['l1', 'l1', 'l2']),
      ).rejects.toThrow('E11000');
      expect(reservaIncomingRepo.restoreFifoSlot).not.toHaveBeenCalled();
    });
  });
});

describe('IncomingReservationService.listIncoming', () => {
  it('incluye unit_cost_cop de la línea de tránsito', async () => {
    const reservaIncomingRepo = {
      findAllLean: jest.fn().mockResolvedValue([
        {
          _id: { toString: () => 'r1' },
          client_id: 'c1',
          batch_item_id: 'b1',
          quantity: 2,
          precio_cop: 9000,
        },
      ]),
    };
    const transitLineRepo = {
      findByIdsLean: jest.fn().mockResolvedValue([
        {
          _id: { toString: () => 'b1' },
          card_name: 'Pikachu',
          card_id: 'sv1-1',
          unit_cost_cop: 3500,
        },
      ]),
    };
    const svc = new IncomingReservationService(
      reservaIncomingRepo as any,
      transitLineRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const rows = await svc.listIncoming('c1');
    expect(rows).toHaveLength(1);
    expect(rows[0].unit_cost_cop).toBe(3500);
    expect(rows[0].precio_cop).toBe(9000);
    expect(rows[0].card_name).toBe('Pikachu');
  });
});
