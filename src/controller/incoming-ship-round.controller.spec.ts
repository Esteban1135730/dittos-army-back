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
      {} as any, // shipRoundCardUnitRepository
      incomingBatchItemRepository as any,
      {} as any, // incomingBatchRepository
      {} as any, // stockRepository
      {} as any, // incomingReservationService
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

describe('IncomingShipRoundController.finalizeShipRound', () => {
  const roundId = 'round1';

  it('actualiza remaining en un bulkWrite y cierra solo los batch sin pendientes', async () => {
    const shipRoundRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: { toString: () => roundId },
        status: 'reviewing',
        shipping_total_cop: 1000,
      }),
      setFinalized: jest.fn().mockResolvedValue({}),
    };
    const shipRoundItemRepository = {
      findByRoundId: jest.fn().mockResolvedValue([
        { batch_item_id: 'bi1', arrived_quantity: 2, novedad_quantity: 0 },
        { batch_item_id: 'bi2', arrived_quantity: 1, novedad_quantity: 0 },
      ]),
    };
    const shipRoundCardUnitRepository = {
      findByRoundId: jest.fn().mockResolvedValue([]),
    };
    const batchItem = (id: string, batchId: string, remaining: number) => ({
      _id: { toString: () => id },
      batch_id: batchId,
      card_id: `card-${id}`,
      card_name: id,
      language: 'EN',
      unit_cost_cop: 500,
      remaining_quantity: remaining,
    });
    const incomingBatchItemRepository = {
      findByIds: jest
        .fn()
        .mockResolvedValue([
          batchItem('bi1', 'b1', 2),
          batchItem('bi2', 'b2', 3),
        ]),
      updateRemainingQuantity: jest.fn(),
      updateRemainingQuantities: jest.fn().mockResolvedValue(2),
      findByBatchId: jest.fn(),
      findByBatchIdsLean: jest.fn().mockResolvedValue([
        { batch_id: 'b1', remaining_quantity: 0 },
        { batch_id: 'b2', remaining_quantity: 2 },
      ]),
    };
    const incomingBatchRepository = {
      setStatus: jest.fn().mockResolvedValue({}),
    };
    const stockRepository = {
      createMany: jest
        .fn()
        .mockImplementation(async (dtos: unknown[]) =>
          dtos.map((_, i) => ({ _id: `s${i}` })),
        ),
    };
    const incomingReservationService = {
      materializeForNewStockLines: jest.fn().mockResolvedValue(undefined),
    };

    const ctrl = new IncomingShipRoundController(
      shipRoundRepository as any,
      shipRoundItemRepository as any,
      shipRoundCardUnitRepository as any,
      incomingBatchItemRepository as any,
      incomingBatchRepository as any,
      stockRepository as any,
      incomingReservationService as any,
    );

    const res = await ctrl.finalizeShipRound(roundId);

    expect(res).toEqual({
      success: true,
      createdStockCount: 3,
      arrivedTotalQuantity: 3,
    });
    expect(
      incomingReservationService.materializeForNewStockLines,
    ).toHaveBeenCalledWith(expect.any(Array), ['bi1', 'bi1', 'bi2']);
    expect(
      incomingBatchItemRepository.updateRemainingQuantity,
    ).not.toHaveBeenCalled();
    expect(
      incomingBatchItemRepository.updateRemainingQuantities,
    ).toHaveBeenCalledWith([
      { batchItemId: 'bi1', remainingQuantity: 0 },
      { batchItemId: 'bi2', remainingQuantity: 2 },
    ]);
    expect(incomingBatchItemRepository.findByBatchId).not.toHaveBeenCalled();
    expect(
      incomingBatchItemRepository.findByBatchIdsLean,
    ).toHaveBeenCalledTimes(1);
    expect(incomingBatchRepository.setStatus).toHaveBeenCalledTimes(1);
    expect(incomingBatchRepository.setStatus).toHaveBeenCalledWith(
      'b1',
      'completed',
    );
    expect(shipRoundRepository.setFinalized).toHaveBeenCalledWith(roundId);
  });
});
