import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
      updateStatusFields: jest.fn(async (id, patch) => ({
        _id: id,
        scope: 'all',
        tag: null,
        items: [],
        created_at: new Date(),
        updated_at: new Date(),
        ...patch,
      })),
      markCancelled: jest.fn(),
    } as unknown as jest.Mocked<StockReviewSessionRepository>;

    stockRepository = {
      findByCardIdsInStates: jest.fn(),
      findByCardStates: jest.fn(),
      findById: jest.fn(),
      findByIds: jest.fn(),
      updateCardState: jest.fn(),
      markAsLost: jest.fn(),
      findByCardState: jest.fn(),
    } as unknown as jest.Mocked<StockRepository>;

    cardStockTagRepository = {
      findCardIdsByTag: jest.fn(),
      findMapByCardIds: jest.fn().mockResolvedValue(new Map()),
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
    sessionRepository.create.mockImplementation(
      async (data) =>
        ({
          _id: sessionId,
          ...data,
          created_at: new Date(),
          updated_at: new Date(),
          save: jest.fn(),
        }) as any,
    );

    const view = await service.createSession({
      scope: 'tag',
      tag: 'vintage',
    });

    expect(cardStockTagRepository.findCardIdsByTag).toHaveBeenCalledWith(
      'vintage',
    );
    expect(stockRepository.findByCardIdsInStates).toHaveBeenCalledWith(
      ['sv1-1'],
      ['disponible', 'en_stock_colombia', 'reserva'],
    );
    expect(view.scope).toBe('tag');
    expect(view.tag).toBe('vintage');
    expect(view.items).toHaveLength(1);
    expect(view.items[0].language).toBe('ja');
    expect(view.items[0].rareza).toBe('holofoil');
    expect(view.status).toBe('en_verificacion');
  });

  it('crea sesión scope all con todas las líneas elegibles', async () => {
    sessionRepository.findActive.mockResolvedValue(null);
    stockRepository.findByCardStates.mockResolvedValue([
      {
        _id: stockId,
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        card_state: 'reserva',
      } as any,
    ]);
    sessionRepository.create.mockImplementation(
      async (data) =>
        ({
          _id: sessionId,
          ...data,
          created_at: new Date(),
          updated_at: new Date(),
          save: jest.fn(),
        }) as any,
    );

    const view = await service.createSession({ scope: 'all' });

    expect(stockRepository.findByCardStates).toHaveBeenCalledWith([
      'disponible',
      'en_stock_colombia',
      'reserva',
    ]);
    expect(cardStockTagRepository.findCardIdsByTag).not.toHaveBeenCalled();
    expect(view.scope).toBe('all');
    expect(view.tag).toBeNull();
    expect(view.items).toHaveLength(1);
  });

  it('crea sesión por tag brillo', async () => {
    sessionRepository.findActive.mockResolvedValue(null);
    cardStockTagRepository.findCardIdsByTag.mockResolvedValue(['sv1-2']);
    stockRepository.findByCardIdsInStates.mockResolvedValue([]);
    sessionRepository.create.mockImplementation(
      async (data) =>
        ({
          _id: sessionId,
          ...data,
          created_at: new Date(),
          updated_at: new Date(),
          save: jest.fn(),
        }) as any,
    );

    const view = await service.createSession({ scope: 'tag', tag: 'brillo' });

    expect(cardStockTagRepository.findCardIdsByTag).toHaveBeenCalledWith(
      'brillo',
    );
    expect(view.tag).toBe('brillo');
  });

  it('reanuda sesión activa del mismo alcance tag', async () => {
    sessionRepository.findActive.mockResolvedValue({
      _id: sessionId,
      scope: 'tag',
      tag: 'bulk',
      status: 'en_verificacion',
      items: [],
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    const view = await service.createSession({ scope: 'tag', tag: 'bulk' });

    expect(sessionRepository.create).not.toHaveBeenCalled();
    expect(view.tag).toBe('bulk');
  });

  it('reanuda sesión legacy solo-tag como scope tag', async () => {
    sessionRepository.findActive.mockResolvedValue({
      _id: sessionId,
      tag: 'jugable',
      status: 'en_verificacion',
      items: [],
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    const view = await service.createSession({
      scope: 'tag',
      tag: 'jugable',
    });

    expect(sessionRepository.create).not.toHaveBeenCalled();
    expect(view.scope).toBe('tag');
    expect(view.tag).toBe('jugable');
  });

  it('409 si hay sesión activa de otro alcance', async () => {
    sessionRepository.findActive.mockResolvedValue({
      scope: 'all',
      tag: null,
    } as any);

    await expect(
      service.createSession({ scope: 'tag', tag: 'vintage' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('400 si scope all envía tag', async () => {
    await expect(
      service.createSession({ scope: 'all', tag: 'vintage' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400 si scope tag sin tag', async () => {
    await expect(
      service.createSession({ scope: 'tag' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verify no muta stock', async () => {
    const doc = {
      _id: sessionId,
      scope: 'tag',
      tag: 'vintage',
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
    expect(view.items[0].verified_at).toBeInstanceOf(Date);
    expect(doc.items[0].verified_at).toBeInstanceOf(Date);
  });

  describe('scanItem', () => {
    const soldStockId = '507f1f77bcf86cd799439099';

    function sessionWithItems(items: any[]) {
      return {
        _id: sessionId,
        scope: 'all',
        tag: null,
        status: 'en_verificacion',
        items,
        created_at: new Date(),
        updated_at: new Date(),
      } as any;
    }

    function item(overrides: Partial<Record<string, any>> = {}) {
      return {
        stock_id: overrides.stock_id ?? stockId,
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        card_state_snapshot: 'disponible',
        language: 'ja',
        verified: false,
        obsolete: false,
        ...overrides,
      };
    }

    it('etiqueta de una línea ya vendida verifica otra unidad pendiente del grupo', async () => {
      const doc = sessionWithItems([
        item({ stock_id: '507f1f77bcf86cd799439013' }),
      ]);
      sessionRepository.findById.mockResolvedValue(doc);
      // La línea de la etiqueta ya no está en la sesión: se lee de stock.
      stockRepository.findById.mockResolvedValue({
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        card_state: 'vendida',
        language: 'JA',
      } as any);

      const result = await service.scanItem(sessionId, soldStockId);

      expect(result.scan.verified_stock_id).toBe('507f1f77bcf86cd799439013');
      expect(result.scan.card_id).toBe('sv1-1');
      expect(result.scan.language).toBe('ja');
      expect(result.scan.group_pending_after).toBe(0);
      expect(doc.items[0].verified).toBe(true);
      expect(doc.items[0].verified_at).toBeInstanceOf(Date);
    });

    it('dos escaneos verifican dos unidades del mismo grupo', async () => {
      const doc = sessionWithItems([
        item({ stock_id: '507f1f77bcf86cd799439013' }),
        item({ stock_id: '507f1f77bcf86cd799439014' }),
      ]);
      sessionRepository.findById.mockResolvedValue(doc);

      const first = await service.scanItem(
        sessionId,
        '507f1f77bcf86cd799439013',
      );
      expect(first.scan.verified_stock_id).toBe('507f1f77bcf86cd799439013');
      expect(first.scan.group_pending_after).toBe(1);

      const second = await service.scanItem(
        sessionId,
        '507f1f77bcf86cd799439013',
      );
      expect(second.scan.verified_stock_id).toBe('507f1f77bcf86cd799439014');
      expect(second.scan.group_pending_after).toBe(0);
      expect(doc.items.every((i: any) => i.verified)).toBe(true);
    });

    it('409 cuando el grupo ya está completo', async () => {
      const doc = sessionWithItems([
        item({ stock_id: '507f1f77bcf86cd799439013', verified: true }),
      ]);
      sessionRepository.findById.mockResolvedValue(doc);

      await expect(
        service.scanItem(sessionId, '507f1f77bcf86cd799439013'),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.scanItem(sessionId, '507f1f77bcf86cd799439013'),
      ).rejects.toThrow(/ya están verificadas/);
    });

    it('nunca cruza idiomas e informa los idiomas pendientes', async () => {
      const doc = sessionWithItems([
        item({ stock_id: '507f1f77bcf86cd799439013', language: 'en' }),
      ]);
      sessionRepository.findById.mockResolvedValue(doc);
      stockRepository.findById.mockResolvedValue({
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        card_state: 'vendida',
        language: 'ja',
      } as any);

      await expect(
        service.scanItem(sessionId, soldStockId),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(service.scanItem(sessionId, soldStockId)).rejects.toThrow(
        /EN/,
      );
      expect(doc.items[0].verified).toBe(false);
    });

    it('409 distinguible si la carta no está en la sesión', async () => {
      const doc = sessionWithItems([
        item({ stock_id: '507f1f77bcf86cd799439013' }),
      ]);
      sessionRepository.findById.mockResolvedValue(doc);
      stockRepository.findById.mockResolvedValue({
        card_id: 'sv1-9',
        card_name: 'Charizard',
        card_state: 'disponible',
        language: 'ja',
      } as any);

      await expect(service.scanItem(sessionId, soldStockId)).rejects.toThrow(
        /no está en la sesión/,
      );
    });

    it('404 si el stock_id no existe ni en la sesión ni en stock', async () => {
      const doc = sessionWithItems([
        item({ stock_id: '507f1f77bcf86cd799439013' }),
      ]);
      sessionRepository.findById.mockResolvedValue(doc);
      stockRepository.findById.mockResolvedValue(null);

      await expect(
        service.scanItem(sessionId, soldStockId),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.scanItem(sessionId, 'no-es-objectid'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ignora obsoletas y líneas ya resueltas al elegir candidata', async () => {
      const doc = sessionWithItems([
        item({ stock_id: '507f1f77bcf86cd799439013', obsolete: true }),
        item({ stock_id: '507f1f77bcf86cd799439014', outcome: 'vendida' }),
        item({ stock_id: '507f1f77bcf86cd799439015' }),
      ]);
      sessionRepository.findById.mockResolvedValue(doc);

      const result = await service.scanItem(
        sessionId,
        '507f1f77bcf86cd799439013',
      );

      expect(result.scan.verified_stock_id).toBe('507f1f77bcf86cd799439015');
    });

    it('400 si la sesión no está en verificación', async () => {
      const doc = sessionWithItems([item()]);
      doc.status = 'pendiente_resolucion';
      sessionRepository.findById.mockResolvedValue(doc);

      await expect(service.scanItem(sessionId, stockId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  it('finalize con todas verificadas → completada', async () => {
    const doc = {
      _id: sessionId,
      scope: 'all',
      tag: null,
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
    sessionRepository.updateStatusFields.mockResolvedValue({
      ...doc,
      status: 'completada',
      completed_at: new Date(),
    });

    const view = await service.finalizeVerification(sessionId);

    expect(sessionRepository.updateStatusFields).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({ status: 'completada' }),
    );
    expect(sessionRepository.save).not.toHaveBeenCalled();
    expect(view.status).toBe('completada');
    expect(view.completed_at).toBeInstanceOf(Date);
  });

  it('finalize con pendientes → pendiente_resolucion', async () => {
    const doc = {
      _id: sessionId,
      scope: 'tag',
      tag: 'bulk',
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
    sessionRepository.updateStatusFields.mockResolvedValue({
      ...doc,
      status: 'pendiente_resolucion',
    });

    const view = await service.finalizeVerification(sessionId);

    expect(sessionRepository.updateStatusFields).toHaveBeenCalledWith(
      sessionId,
      { status: 'pendiente_resolucion' },
    );
    expect(sessionRepository.save).not.toHaveBeenCalled();
    expect(view.status).toBe('pendiente_resolucion');
  });

  it('getSession sincroniza obsoletos con una sola findByIds', async () => {
    const idA = '507f1f77bcf86cd7994390aa';
    const idB = '507f1f77bcf86cd7994390bb';
    const doc = {
      _id: sessionId,
      scope: 'all',
      tag: null,
      status: 'en_verificacion',
      items: [
        {
          stock_id: idA,
          card_id: 'a',
          card_name: 'A',
          card_state_snapshot: 'disponible',
          verified: false,
          obsolete: false,
        },
        {
          stock_id: idB,
          card_id: 'b',
          card_name: 'B',
          card_state_snapshot: 'disponible',
          verified: false,
          obsolete: false,
        },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    } as any;
    sessionRepository.findById.mockResolvedValue(doc);
    stockRepository.findByIds.mockResolvedValue([
      {
        _id: idA,
        card_id: 'a',
        card_state: 'disponible',
        language: 'en',
      } as any,
      // idB ausente → obsolete
    ]);

    const view = await service.getSession(sessionId);

    expect(stockRepository.findByIds).toHaveBeenCalledTimes(1);
    expect(stockRepository.findByIds).toHaveBeenCalledWith([idA, idB]);
    expect(stockRepository.findById).not.toHaveBeenCalled();
    expect(view.items.find((i) => i.stock_id === idB)?.obsolete).toBe(true);
    expect(sessionRepository.save).toHaveBeenCalled();
  });

  it('resolve en_stock no altera stock ni ventas', async () => {
    const doc = {
      _id: sessionId,
      scope: 'tag',
      tag: 'vintage',
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

  it('resolve perdida actualiza stock con lost_at y lost_cost_cop', async () => {
    const doc = {
      _id: sessionId,
      scope: 'tag',
      tag: 'vintage',
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
      shipment: 100,
      cards_in_shipmet: 10,
      unity_cost: 5,
      currency: 'COP',
    } as any);

    await service.resolveItem(sessionId, stockId, 'perdida');

    expect(stockRepository.markAsLost).toHaveBeenCalledWith(stockId, 15);
    expect(doc.status).toBe('completada');
  });

  it('resolve propiedad crea sale keep y actualiza estado', async () => {
    const doc = {
      _id: sessionId,
      scope: 'tag',
      tag: 'vintage',
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

    await service.resolveItem(sessionId, stockId, 'propiedad');

    expect(saleRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        stock_id: stockId,
        type: 'propiedad',
      }),
    );
    expect(stockRepository.updateCardState).toHaveBeenCalledWith(
      stockId,
      'propiedad',
    );
  });

  it('resolve vendida usa PVP cuando existe', async () => {
    const doc = {
      _id: sessionId,
      scope: 'tag',
      tag: 'vintage',
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
