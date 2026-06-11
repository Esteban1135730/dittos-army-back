import { ConflictException, NotFoundException } from '@nestjs/common';
import { CardStockTagRepository } from '../repository/card-stock-tag.repository';
import { PvpRepository } from '../repository/pvp.repository';
import { SaleRepository } from '../repository/sale.repository';
import { StockRepository } from '../repository/stock.repository';
import { StockReviewSessionRepository } from '../repository/stock-review-session.repository';
import { StockReviewService } from './stock-review.service';

describe('StockReviewService', () => {
  let service: StockReviewService;
  let sessionRepository: jest.Mocked<StockReviewSessionRepository>;
  let stockRepository: jest.Mocked<StockRepository>;
  let cardStockTagRepository: jest.Mocked<CardStockTagRepository>;
  let saleRepository: jest.Mocked<SaleRepository>;
  let pvpRepository: jest.Mocked<PvpRepository>;

  const sessionId = '507f1f77bcf86cd799439011';
  const stockId = '507f1f77bcf86cd799439012';

  beforeEach(() => {
    sessionRepository = {
      findActive: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(async (doc) => doc),
      markCancelled: jest.fn(),
    } as unknown as jest.Mocked<StockReviewSessionRepository>;

    stockRepository = {
      findByCardIdsInStates: jest.fn(),
      findById: jest.fn(),
      updateCardState: jest.fn(),
      findByCardState: jest.fn(),
    } as unknown as jest.Mocked<StockRepository>;

    cardStockTagRepository = {
      findCardIdsByTag: jest.fn(),
    } as unknown as jest.Mocked<CardStockTagRepository>;

    saleRepository = {
      create: jest.fn(),
    } as unknown as jest.Mocked<SaleRepository>;

    pvpRepository = {
      findAllByCardId: jest.fn(),
    } as unknown as jest.Mocked<PvpRepository>;

    service = new StockReviewService(
      sessionRepository,
      stockRepository,
      cardStockTagRepository,
      saleRepository,
      pvpRepository,
    );
  });

  it('crea snapshot filtrando por tag y estados elegibles', async () => {
    sessionRepository.findActive.mockResolvedValue(null);
    cardStockTagRepository.findCardIdsByTag.mockResolvedValue(['sv1-1']);
    stockRepository.findByCardIdsInStates.mockResolvedValue([
      {
        _id: stockId,
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        card_state: 'disponible',
        language: 'ja',
        rareza: 'holofoil',
      } as any,
    ]);
    sessionRepository.create.mockImplementation(async (data) => ({
      _id: sessionId,
      ...data,
      created_at: new Date(),
      updated_at: new Date(),
      save: jest.fn(),
    }) as any);

    const view = await service.createSession('vintage');

    expect(cardStockTagRepository.findCardIdsByTag).toHaveBeenCalledWith(
      'vintage',
    );
    expect(stockRepository.findByCardIdsInStates).toHaveBeenCalledWith(
      ['sv1-1'],
      ['disponible', 'en_stock_colombia', 'reserva'],
    );
    expect(view.tag).toBe('vintage');
    expect(view.items).toHaveLength(1);
    expect(view.items[0].language).toBe('ja');
    expect(view.items[0].rareza).toBe('holofoil');
    expect(view.status).toBe('en_verificacion');
  });

  it('reanuda sesión activa del mismo tag', async () => {
    sessionRepository.findActive.mockResolvedValue({
      _id: sessionId,
      tag: 'bulk',
      status: 'en_verificacion',
      items: [],
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    const view = await service.createSession('bulk');

    expect(sessionRepository.create).not.toHaveBeenCalled();
    expect(view.tag).toBe('bulk');
  });

  it('409 si hay sesión activa de otro tag', async () => {
    sessionRepository.findActive.mockResolvedValue({
      tag: 'jugable',
    } as any);

    await expect(service.createSession('vintage')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('verify no muta stock', async () => {
    const doc = {
      _id: sessionId,
      status: 'en_verificacion',
      items: [
        {
          stock_id: stockId,
          card_id: 'sv1-1',
          card_name: 'Pikachu',
          card_state_snapshot: 'disponible',
          verified: false,
        },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    } as any;
    sessionRepository.findById.mockResolvedValue(doc);

    const view = await service.verifyItem(sessionId, stockId);

    expect(stockRepository.updateCardState).not.toHaveBeenCalled();
    expect(view.items[0].verified).toBe(true);
  });

  it('finalize con todas verificadas → completada', async () => {
    const doc = {
      _id: sessionId,
      status: 'en_verificacion',
      items: [
        {
          stock_id: stockId,
          verified: true,
          obsolete: false,
        },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    } as any;
    sessionRepository.findById.mockResolvedValue(doc);

    const view = await service.finalizeVerification(sessionId);

    expect(view.status).toBe('completada');
    expect(doc.completed_at).toBeInstanceOf(Date);
  });

  it('finalize con pendientes → pendiente_resolucion', async () => {
    const doc = {
      _id: sessionId,
      status: 'en_verificacion',
      items: [
        {
          stock_id: stockId,
          verified: false,
          obsolete: false,
        },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    } as any;
    sessionRepository.findById.mockResolvedValue(doc);

    const view = await service.finalizeVerification(sessionId);

    expect(view.status).toBe('pendiente_resolucion');
  });

  it('resolve en_stock no altera stock ni ventas', async () => {
    const doc = {
      _id: sessionId,
      status: 'pendiente_resolucion',
      items: [
        {
          stock_id: stockId,
          card_id: 'sv1-1',
          verified: false,
          obsolete: false,
        },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    } as any;
    sessionRepository.findById.mockResolvedValue(doc);
    stockRepository.findById.mockResolvedValue({
      card_id: 'sv1-1',
      card_state: 'disponible',
    } as any);

    const view = await service.resolveItem(sessionId, stockId, 'en_stock');

    expect(stockRepository.updateCardState).not.toHaveBeenCalled();
    expect(saleRepository.create).not.toHaveBeenCalled();
    expect(view.items[0].outcome).toBe('en_stock');
    expect(view.status).toBe('completada');
  });

  it('resolve perdida actualiza stock', async () => {
    const doc = {
      _id: sessionId,
      status: 'pendiente_resolucion',
      items: [
        {
          stock_id: stockId,
          card_id: 'sv1-1',
          verified: false,
          obsolete: false,
        },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    } as any;
    sessionRepository.findById.mockResolvedValue(doc);
    stockRepository.findById.mockResolvedValue({
      card_id: 'sv1-1',
      card_state: 'disponible',
    } as any);

    await service.resolveItem(sessionId, stockId, 'perdida');

    expect(stockRepository.updateCardState).toHaveBeenCalledWith(
      stockId,
      'perdida',
    );
    expect(doc.status).toBe('completada');
  });

  it('resolve vendida usa PVP cuando existe', async () => {
    const doc = {
      _id: sessionId,
      status: 'pendiente_resolucion',
      items: [
        {
          stock_id: stockId,
          card_id: 'sv1-1',
          verified: false,
        },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    } as any;
    sessionRepository.findById.mockResolvedValue(doc);
    stockRepository.findById.mockResolvedValue({
      card_id: 'sv1-1',
    } as any);
    pvpRepository.findAllByCardId.mockResolvedValue([
      { card_id: 'sv1-1', pvp: 10000, currency: 'COP', rareza: null },
    ] as any);

    await service.resolveItem(sessionId, stockId, 'vendida');

    expect(saleRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        stock_id: stockId,
        type: 'venta',
        amount_cop: 10000,
      }),
    );
    expect(stockRepository.updateCardState).toHaveBeenCalledWith(
      stockId,
      'vendida',
    );
  });

  it('listPerdidas devuelve filas', async () => {
    stockRepository.findByCardState.mockResolvedValue([
      {
        _id: stockId,
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        card_state: 'perdida',
      } as any,
    ]);

    const rows = await service.listPerdidas();

    expect(rows).toHaveLength(1);
    expect(rows[0].stock_id).toBe(stockId);
  });

  it('getSession lanza NotFound si no existe', async () => {
    sessionRepository.findById.mockResolvedValue(null);
    await expect(service.getSession(sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
