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
    };
    const reservaRepository = {
      create: jest.fn().mockResolvedValue({}),
    };
    const stockRepository = {
      updateCardState: jest.fn().mockResolvedValue({}),
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
    return { svc, reservaRepository, pedidoRepository };
  }

  it('liga la reserva materializada al pedido reservado del cliente', async () => {
    const { svc, reservaRepository } = makeMaterializeService({
      pedidoId: 'p-open',
    });
    await svc.materializeForNewStockLines(
      [{ _id: 's1', card_id: 'sv1-1' }] as any,
      ['line1'],
    );
    expect(reservaRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'c1',
        stock_id: 's1',
        pedido_id: 'p-open',
      }),
    );
  });

  it('deja la reserva sin pedido_id si el cliente no tiene pedido reservado', async () => {
    const { svc, reservaRepository } = makeMaterializeService({
      pedidoId: null,
    });
    await svc.materializeForNewStockLines(
      [{ _id: 's1', card_id: 'sv1-1' }] as any,
      ['line1'],
    );
    const arg = reservaRepository.create.mock.calls[0][0];
    expect(arg.client_id).toBe('c1');
    expect(arg.pedido_id).toBeUndefined();
  });
});

describe('IncomingReservationService.listIncoming', () => {
  it('incluye unit_cost_cop de la línea de tránsito', async () => {
    const reservaIncomingRepo = {
      findAll: jest.fn().mockResolvedValue([
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
      findByIds: jest.fn().mockResolvedValue([
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
