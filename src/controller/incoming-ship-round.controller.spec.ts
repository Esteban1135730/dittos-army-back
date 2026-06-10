import { IncomingShipRoundController } from './incoming-ship-round.controller';

describe('IncomingShipRoundController.syncMissingShipRoundItems', () => {
  const roundId = 'round1';

  function makeController(deps: {
    round: { _id: { toString: () => string }; status: string } | null;
    roundItems: Array<{ batch_item_id: string }>;
    inRoute: Array<{ _id: { toString: () => string } }>;
  }) {
    const shipRoundRepository = {
      findById: jest.fn().mockResolvedValue(deps.round),
    };
    const shipRoundItemRepository = {
      findByRoundId: jest.fn().mockResolvedValue(deps.roundItems),
      createMany: jest.fn().mockResolvedValue([]),
    };
    const incomingBatchItemRepository = {
      findByRemainingQuantityGreaterThanZero: jest
        .fn()
        .mockResolvedValue(deps.inRoute),
    };

    const ctrl = new IncomingShipRoundController(
      shipRoundRepository as any,
      shipRoundItemRepository as any,
      incomingBatchItemRepository as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { ctrl, shipRoundItemRepository, incomingBatchItemRepository };
  }

  it('inserta solo batch_item en camino que no estaban en el round', async () => {
    const { ctrl, shipRoundItemRepository } = makeController({
      round: { _id: { toString: () => roundId }, status: 'reviewing' },
      roundItems: [{ batch_item_id: 'a' }],
      inRoute: [
        { _id: { toString: () => 'a' } },
        { _id: { toString: () => 'b' } },
      ],
    });

    const res = await ctrl.syncMissingShipRoundItems(roundId);

    expect(res.added).toBe(1);
    expect(res.round_id).toBe(roundId);
    expect(shipRoundItemRepository.createMany).toHaveBeenCalledWith([
      expect.objectContaining({
        ship_round_id: roundId,
        batch_item_id: 'b',
        arrived_quantity: 0,
        novedad_quantity: 0,
        novedad_notes: '',
      }),
    ]);
  });

  it('devuelve added 0 si no hay líneas nuevas', async () => {
    const { ctrl, shipRoundItemRepository } = makeController({
      round: { _id: { toString: () => roundId }, status: 'reviewing' },
      roundItems: [{ batch_item_id: 'a' }],
      inRoute: [{ _id: { toString: () => 'a' } }],
    });

    const res = await ctrl.syncMissingShipRoundItems(roundId);

    expect(res.added).toBe(0);
    expect(shipRoundItemRepository.createMany).not.toHaveBeenCalled();
  });

  it('lanza si el round no está en reviewing', async () => {
    const { ctrl } = makeController({
      round: { _id: { toString: () => roundId }, status: 'finalized' },
      roundItems: [],
      inRoute: [{ _id: { toString: () => 'x' } }],
    });

    await expect(ctrl.syncMissingShipRoundItems(roundId)).rejects.toThrow(
      'Solo se pueden incorporar líneas en tandas en revisión',
    );
  });

  it('lanza si el round no existe', async () => {
    const { ctrl } = makeController({
      round: null,
      roundItems: [],
      inRoute: [],
    });

    await expect(ctrl.syncMissingShipRoundItems(roundId)).rejects.toThrow(
      'Ship round no encontrada',
    );
  });
});
