import { SaleRepository } from './sale.repository';

describe('SaleRepository.finalizeCycleForSale', () => {
  const saleId = '507f1f77bcf86cd799439011';

  function setupRepo(
    saleDoc: {
      type: string;
      cycle_closed_at?: Date | null;
    } | null,
  ) {
    const findByIdExec = jest.fn().mockResolvedValue(saleDoc);
    const updateOneExec = jest.fn().mockResolvedValue({ acknowledged: true });
    const mockModel = {
      findById: jest.fn().mockReturnValue({ exec: findByIdExec }),
      updateOne: jest.fn().mockReturnValue({ exec: updateOneExec }),
    } as any;
    const ownerModels = {
      getModel: jest.fn().mockReturnValue(mockModel),
    };
    const repo = new SaleRepository(ownerModels as any);
    return { repo, mockModel, findByIdExec, updateOneExec };
  }

  it('devuelve not_found si no existe la venta', async () => {
    const { repo, mockModel } = setupRepo(null);
    await expect(repo.finalizeCycleForSale(saleId)).resolves.toBe('not_found');
    expect(mockModel.findById).toHaveBeenCalledWith(saleId);
    expect(mockModel.updateOne).not.toHaveBeenCalled();
  });

  it('devuelve wrong_type si type no es venta', async () => {
    const { repo, mockModel } = setupRepo({
      type: 'reserva',
      cycle_closed_at: null,
    });
    await expect(repo.finalizeCycleForSale(saleId)).resolves.toBe('wrong_type');
    expect(mockModel.updateOne).not.toHaveBeenCalled();
  });

  it('devuelve already_closed si ya tiene cycle_closed_at', async () => {
    const { repo, mockModel } = setupRepo({
      type: 'venta',
      cycle_closed_at: new Date('2025-01-01'),
    });
    await expect(repo.finalizeCycleForSale(saleId)).resolves.toBe(
      'already_closed',
    );
    expect(mockModel.updateOne).not.toHaveBeenCalled();
  });

  it('actualiza y devuelve updated para venta activa', async () => {
    const { repo, mockModel } = setupRepo({
      type: 'venta',
      cycle_closed_at: undefined,
    });
    await expect(repo.finalizeCycleForSale(saleId)).resolves.toBe('updated');
    expect(mockModel.updateOne).toHaveBeenCalledWith(
      { _id: saleId, type: 'venta' },
      { $set: { cycle_closed_at: expect.any(Date) } },
    );
  });
});
