import { ConflictException } from '@nestjs/common';
import { IncomingReservationService } from './incoming-reservation.service';
import { ReservaIncomingRepository } from '../repository/reserva-incoming.repository';
import { IncomingBatchItemRepository } from '../repository/incoming-batch-item.repository';

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

    const batchItemRepo = {
      findById: jest.fn().mockResolvedValue({
        _id: 'b1',
        remaining_quantity: deps.remaining,
      }),
    } as unknown as IncomingBatchItemRepository;

    return new IncomingReservationService(
      reservaIncomingRepo,
      batchItemRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
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
