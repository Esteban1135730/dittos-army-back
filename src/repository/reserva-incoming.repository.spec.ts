import { ReservaIncomingRepository } from './reserva-incoming.repository';

describe('ReservaIncomingRepository.restoreFifoSlot', () => {
  it('incrementa la fila del cliente o la recrea con su created_at original', async () => {
    const exec = jest.fn().mockResolvedValue({ acknowledged: true });
    const mockModel = { updateOne: jest.fn().mockReturnValue({ exec }) } as any;
    const ownerModels = { getModel: jest.fn().mockReturnValue(mockModel) };
    const repo = new ReservaIncomingRepository(ownerModels as any);
    const createdAt = new Date('2026-01-01T00:00:00Z');

    await repo.restoreFifoSlot({
      batch_item_id: 'l1',
      client_id: 'c1',
      precio_cop: 5000,
      created_at: createdAt,
    });

    expect(mockModel.updateOne).toHaveBeenCalledWith(
      { client_id: 'c1', batch_item_id: 'l1' },
      {
        $inc: { quantity: 1 },
        $set: { updated_at: expect.any(Date) },
        $setOnInsert: { precio_cop: 5000, created_at: createdAt },
      },
      { upsert: true },
    );
    expect(exec).toHaveBeenCalled();
  });
});
