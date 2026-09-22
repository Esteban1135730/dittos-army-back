import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MobilePendingSaleService } from './mobile-pending-sale.service';
import { runWithOwnerAsync } from 'src/owner/owner-context';

const stockId = '507f1f77bcf86cd799439011';
const pendingId = '507f1f77bcf86cd799439099';
const saleId = '507f1f77bcf86cd799439088';

function pendingDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: pendingId,
    stock_id: stockId,
    stock_owner: 'pablo' as const,
    amount_cop: 50000,
    notes: 'feria',
    client_sale_id: 'local-1',
    card_name: 'Pikachu',
    image_url: 'https://img.example/p.png',
    card_id: 'sv1-025',
    status: 'pending',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    conflict_reason: undefined as string | undefined,
    sale_id: undefined as string | undefined,
    ...overrides,
  };
}

describe('MobilePendingSaleService', () => {
  let service: MobilePendingSaleService;
  let pendingRepository: {
    create: jest.Mock;
    findById: jest.Mock;
    findByClientSaleId: jest.Mock;
    findOpenPendingByStockId: jest.Mock;
    list: jest.Mock;
    save: jest.Mock;
  };
  let stockRepository: {
    findById: jest.Mock;
    updateCardState: jest.Mock;
    decrementQuantityAtomic: jest.Mock;
  };
  let saleBatchService: { sellOneItem: jest.Mock };

  beforeEach(() => {
    pendingRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByClientSaleId: jest.fn().mockResolvedValue(null),
      findOpenPendingByStockId: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (doc) => doc),
    };
    stockRepository = {
      findById: jest.fn().mockResolvedValue({
        card_id: 'sv1-025',
        card_name: 'Pikachu',
        image_url: 'https://img.example/p.png',
        card_state: 'disponible',
      }),
      updateCardState: jest.fn(),
      decrementQuantityAtomic: jest.fn(),
    };
    saleBatchService = {
      sellOneItem: jest.fn(),
    };
    service = new MobilePendingSaleService(
      pendingRepository as never,
      stockRepository as never,
      saleBatchService as never,
    );
  });

  it('alta OK no llama sell ni muta stock', async () => {
    pendingRepository.create.mockResolvedValue(pendingDoc());
    const view = await service.create({
      stock_id: stockId,
      amount_cop: 50000,
      client_sale_id: 'local-1',
      notes: 'feria',
    });
    expect(view.status).toBe('pending');
    expect(view.stock_id).toBe(stockId);
    expect(saleBatchService.sellOneItem).not.toHaveBeenCalled();
    expect(stockRepository.updateCardState).not.toHaveBeenCalled();
    expect(stockRepository.decrementQuantityAtomic).not.toHaveBeenCalled();
    expect(pendingRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        stock_id: stockId,
        stock_owner: 'pablo',
        amount_cop: 50000,
        client_sale_id: 'local-1',
      }),
    );
  });

  it('alta 409 si stock ausente', async () => {
    stockRepository.findById.mockResolvedValue(null);
    await expect(
      service.create({
        stock_id: stockId,
        amount_cop: 50000,
        client_sale_id: 'local-2',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(pendingRepository.create).not.toHaveBeenCalled();
  });

  it('alta 409 si ya hay pending para el stock', async () => {
    pendingRepository.findOpenPendingByStockId.mockResolvedValue(pendingDoc());
    await expect(
      service.create({
        stock_id: stockId,
        amount_cop: 50000,
        client_sale_id: 'local-3',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(pendingRepository.create).not.toHaveBeenCalled();
  });

  it('idempotencia: mismo client_sale_id no duplica', async () => {
    pendingRepository.findByClientSaleId.mockResolvedValue(pendingDoc());
    const view = await service.create({
      stock_id: stockId,
      amount_cop: 99999,
      client_sale_id: 'local-1',
    });
    expect(view._id).toBe(pendingId);
    expect(pendingRepository.create).not.toHaveBeenCalled();
  });

  it('accept OK crea Sale vía sell-batch unitario', async () => {
    const doc = pendingDoc();
    pendingRepository.findById.mockResolvedValue(doc);
    saleBatchService.sellOneItem.mockResolvedValue({
      stock_id: stockId,
      success: true,
      owner: 'pablo',
      card_id: 'sv1-025',
      sale_id: saleId,
    });
    const res = await service.accept(pendingId);
    expect(res.pending.status).toBe('accepted');
    expect(res.pending.sale_id).toBe(saleId);
    expect(res.sale?.sale_id).toBe(saleId);
    expect(saleBatchService.sellOneItem).toHaveBeenCalledTimes(1);
    expect(pendingRepository.save).toHaveBeenCalled();
  });

  it('accept con stock vendido → conflict sin Sale', async () => {
    const doc = pendingDoc();
    pendingRepository.findById.mockResolvedValue(doc);
    saleBatchService.sellOneItem.mockResolvedValue({
      stock_id: stockId,
      success: false,
      message: 'La carta ya está vendida',
      owner: 'pablo',
    });
    await expect(service.accept(pendingId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(doc.status).toBe('conflict');
    expect(doc.conflict_reason).toContain('vendida');
    expect(doc.sale_id).toBeUndefined();
  });

  it('segundo accept no duplica Sale', async () => {
    pendingRepository.findById.mockResolvedValue(
      pendingDoc({ status: 'accepted', sale_id: saleId }),
    );
    const res = await service.accept(pendingId);
    expect(res.pending.status).toBe('accepted');
    expect(res.sale?.sale_id).toBe(saleId);
    expect(saleBatchService.sellOneItem).not.toHaveBeenCalled();
  });

  it('reject no toca stock', async () => {
    const doc = pendingDoc();
    pendingRepository.findById.mockResolvedValue(doc);
    const view = await service.reject(pendingId);
    expect(view.status).toBe('rejected');
    expect(saleBatchService.sellOneItem).not.toHaveBeenCalled();
    expect(stockRepository.updateCardState).not.toHaveBeenCalled();
  });

  it('accept de otro owner → 404', async () => {
    pendingRepository.findById.mockResolvedValue(
      pendingDoc({ stock_owner: 'esteban' }),
    );
    await expect(service.accept(pendingId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('body inválido → 400', async () => {
    await expect(
      service.create({
        stock_id: 'nope',
        amount_cop: 50000,
        client_sale_id: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('list filtra pending+conflict del owner actual', async () => {
    pendingRepository.list.mockResolvedValue([
      pendingDoc(),
      pendingDoc({ _id: '507f1f77bcf86cd799439077', status: 'conflict' }),
    ]);
    const rows = await runWithOwnerAsync('pablo', () =>
      service.list({ status: 'pending,conflict' }),
    );
    expect(rows).toHaveLength(2);
    expect(pendingRepository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        statuses: ['pending', 'conflict'],
      }),
    );
  });
});
