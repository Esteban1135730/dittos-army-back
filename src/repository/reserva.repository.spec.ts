import { ReservaRepository } from './reserva.repository';

describe('ReservaRepository.createMany', () => {
  function setupRepo() {
    const mockModel = {
      insertMany: jest.fn(async (docs: unknown[]) => docs),
      deleteMany: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 2 }),
      }),
    } as any;
    const ownerModels = { getModel: jest.fn().mockReturnValue(mockModel) };
    return { repo: new ReservaRepository(ownerModels as any), mockModel };
  }

  afterEach(() => jest.restoreAllMocks());

  it('asigna created_at distintos y crecientes en el orden de entrada', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const { repo, mockModel } = setupRepo();

    await repo.createMany([
      { client_id: 'c1', stock_id: 's1', precio: 1 },
      { client_id: 'c2', stock_id: 's2', precio: 2, currency: 'EUR' },
      { client_id: 'c1', stock_id: 's3', precio: 3 },
    ] as any);

    const [docs, opts] = mockModel.insertMany.mock.calls[0];
    expect(opts).toEqual({ ordered: true });
    expect(docs.map((d: any) => d.created_at.getTime())).toEqual([
      1_700_000_000_000, 1_700_000_000_001, 1_700_000_000_002,
    ]);
    expect(docs.map((d: any) => d.updated_at.getTime())).toEqual(
      docs.map((d: any) => d.created_at.getTime()),
    );
    expect(docs.map((d: any) => d.currency)).toEqual(['COP', 'EUR', 'COP']);
  });

  it('lista vacía no llama a insertMany', async () => {
    const { repo, mockModel } = setupRepo();
    await expect(repo.createMany([])).resolves.toEqual([]);
    expect(mockModel.insertMany).not.toHaveBeenCalled();
  });

  it('deleteManyByStockIds borra por $in e ignora ids vacíos', async () => {
    const { repo, mockModel } = setupRepo();
    await expect(repo.deleteManyByStockIds(['s1', '', 's2'])).resolves.toBe(2);
    expect(mockModel.deleteMany).toHaveBeenCalledWith({
      stock_id: { $in: ['s1', 's2'] },
    });
    await expect(repo.deleteManyByStockIds([''])).resolves.toBe(0);
    expect(mockModel.deleteMany).toHaveBeenCalledTimes(1);
  });
});
