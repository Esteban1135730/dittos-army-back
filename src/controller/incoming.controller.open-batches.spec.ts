import { IncomingController } from './incoming.controller';

describe('IncomingController GET batch/open', () => {
  const incomingBatchRepository = { findOpenBatches: jest.fn() };
  const incomingBatchItemRepository = {
    findByBatchId: jest.fn(),
    findByBatchIdsLean: jest.fn(),
  };

  function makeController() {
    return new IncomingController(
      incomingBatchRepository as any,
      incomingBatchItemRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  beforeEach(() => jest.clearAllMocks());

  it('[] sin lotes abiertos (sin consultar ítems)', async () => {
    incomingBatchRepository.findOpenBatches.mockResolvedValue([]);
    await expect(makeController().listOpenBatches()).resolves.toEqual([]);
    expect(
      incomingBatchItemRepository.findByBatchIdsLean,
    ).not.toHaveBeenCalled();
  });

  it('suma remaining por lote con una sola query $in y mantiene el orden', async () => {
    const purchase = new Date('2026-01-01T00:00:00Z');
    const created = new Date('2026-01-02T00:00:00Z');
    incomingBatchRepository.findOpenBatches.mockResolvedValue([
      {
        _id: { toString: () => 'b2' },
        status: 'open',
        purchase_date: purchase,
        created_at: created,
        total_eur_cards_cost: 10,
        total_cop_cards_cost: 50000,
        cards_cost_currency: 'EUR',
      },
      {
        _id: { toString: () => 'b1' },
        status: 'open',
        purchase_date: purchase,
        created_at: created,
        total_eur_cards_cost: 5,
        total_cop_cards_cost: 25000,
      },
    ]);
    incomingBatchItemRepository.findByBatchIdsLean.mockResolvedValue([
      { batch_id: 'b1', remaining_quantity: 1 },
      { batch_id: 'b2', remaining_quantity: 2 },
      { batch_id: 'b2', remaining_quantity: 4 },
    ]);

    const rows = await makeController().listOpenBatches();

    expect(
      incomingBatchItemRepository.findByBatchIdsLean,
    ).toHaveBeenCalledTimes(1);
    expect(incomingBatchItemRepository.findByBatchId).not.toHaveBeenCalled();
    expect(rows).toEqual([
      {
        batch_id: 'b2',
        status: 'open',
        purchase_date: purchase,
        created_at: created,
        total_eur_cards_cost: 10,
        total_cop_cards_cost: 50000,
        cards_cost_currency: 'EUR',
        remaining_total_quantity: 6,
      },
      expect.objectContaining({ batch_id: 'b1', remaining_total_quantity: 1 }),
    ]);
  });
});
