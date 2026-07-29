import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CardtraderReceiptService } from './cardtrader-receipt.service';

const sessionRepo = {
  findActiveSession: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
};

const lineRepo = {
  createMany: jest.fn(),
  findBySessionId: jest.fn(),
  findById: jest.fn(),
  updateById: jest.fn(),
};

const transitLineRepo = {
  findByRemainingQuantityGreaterThanZero: jest.fn(),
  decrementRemainingQuantity: jest.fn(),
  incrementRemainingQuantity: jest.fn(),
};

const stockRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  deleteById: jest.fn(),
};

let service: CardtraderReceiptService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new CardtraderReceiptService(
    sessionRepo as any,
    lineRepo as any,
    transitLineRepo as any,
    stockRepo as any,
  );
});

// ─── createSession ───────────────────────────────────────────────────────────

describe('createSession', () => {
  it('lanza 409 si ya existe una sesión activa', async () => {
    sessionRepo.findActiveSession.mockResolvedValue({ _id: 'sess-1' });

    await expect(service.createSession()).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('lanza 400 si no hay líneas abiertas', async () => {
    sessionRepo.findActiveSession.mockResolvedValue(null);
    transitLineRepo.findByRemainingQuantityGreaterThanZero.mockResolvedValue(
      [],
    );

    await expect(service.createSession()).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('crea sesión y snapshot de líneas correctamente', async () => {
    sessionRepo.findActiveSession.mockResolvedValue(null);
    transitLineRepo.findByRemainingQuantityGreaterThanZero.mockResolvedValue([
      {
        _id: { toString: () => 'tl-1' },
        lot_id: 'lot-1',
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        image_url: '',
        language: 'en',
        rareza: null,
        collector_number: null,
        expansion: null,
        remaining_quantity: 2,
        fx_unit_price: 1.5,
        unit_cost_cop: 7500,
      },
    ]);
    sessionRepo.create.mockResolvedValue({
      _id: { toString: () => 'sess-new' },
      status: 'open',
    });
    lineRepo.createMany.mockResolvedValue([]);

    const result = await service.createSession();

    expect(result.session_id).toBe('sess-new');
    expect(result.lines_loaded).toBe(1);
    expect(result.lot_ids).toEqual(['lot-1']);
    expect(lineRepo.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          session_id: 'sess-new',
          transit_line_id: 'tl-1',
          quantity_expected: 2,
          unit_cost_cop: 7500,
          status: 'pending',
        }),
      ]),
    );
  });
});

// ─── receiveLine ─────────────────────────────────────────────────────────────

describe('receiveLine', () => {
  const openSession = {
    _id: { toString: () => 'sess-1' },
    status: 'open',
  };
  const pendingLine = {
    _id: { toString: () => 'line-1' },
    session_id: 'sess-1',
    card_name: 'Pikachu',
    status: 'pending',
    quantity_expected: 3,
  };

  it('marca línea como received con qty válida', async () => {
    sessionRepo.findById.mockResolvedValue(openSession);
    lineRepo.findById.mockResolvedValue(pendingLine);
    lineRepo.updateById.mockResolvedValue({});

    const result = await service.receiveLine('sess-1', 'line-1', {
      received_qty: 2,
    });

    expect(result.status).toBe('received');
    expect(result.received_qty).toBe(2);
    expect(lineRepo.updateById).toHaveBeenCalledWith(
      'line-1',
      expect.objectContaining({ status: 'received', received_qty: 2 }),
    );
  });

  it('lanza 400 si received_qty > quantity_expected', async () => {
    sessionRepo.findById.mockResolvedValue(openSession);
    lineRepo.findById.mockResolvedValue(pendingLine);

    await expect(
      service.receiveLine('sess-1', 'line-1', { received_qty: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lanza 400 si received_qty <= 0', async () => {
    sessionRepo.findById.mockResolvedValue(openSession);
    lineRepo.findById.mockResolvedValue(pendingLine);

    await expect(
      service.receiveLine('sess-1', 'line-1', { received_qty: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lanza 400 si sesión no está open', async () => {
    sessionRepo.findById.mockResolvedValue({
      ...openSession,
      status: 'finalized',
    });

    await expect(
      service.receiveLine('sess-1', 'line-1', { received_qty: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── markInconsistency ───────────────────────────────────────────────────────

describe('markInconsistency', () => {
  const openSession = { _id: { toString: () => 'sess-1' }, status: 'open' };
  const pendingLine = {
    _id: { toString: () => 'line-1' },
    session_id: 'sess-1',
    card_name: 'Pikachu',
    status: 'pending',
  };

  it('persiste tipo e inconsistencia sin modificar transit line', async () => {
    sessionRepo.findById.mockResolvedValue(openSession);
    lineRepo.findById.mockResolvedValue(pendingLine);
    lineRepo.updateById.mockResolvedValue({});

    const result = await service.markInconsistency('sess-1', 'line-1', {
      type: 'not_arrived',
      notes: 'No llegó el paquete',
    });

    expect(result.status).toBe('inconsistency');
    expect(result.inconsistency_type).toBe('not_arrived');
    expect(transitLineRepo.decrementRemainingQuantity).not.toHaveBeenCalled();
  });
});

// ─── undoLine ────────────────────────────────────────────────────────────────

describe('undoLine', () => {
  const openSession = { _id: { toString: () => 'sess-1' }, status: 'open' };

  it('revierte línea received a pending', async () => {
    sessionRepo.findById.mockResolvedValue(openSession);
    lineRepo.findById.mockResolvedValue({
      _id: { toString: () => 'line-1' },
      session_id: 'sess-1',
      status: 'received',
    });
    lineRepo.updateById.mockResolvedValue({});

    const result = await service.undoLine('sess-1', 'line-1');

    expect(result.status).toBe('pending');
    expect(lineRepo.updateById).toHaveBeenCalledWith(
      'line-1',
      expect.objectContaining({
        status: 'pending',
        received_qty: null,
        inconsistency_type: null,
        notes: '',
      }),
    );
  });

  it('revierte línea inconsistency a pending', async () => {
    sessionRepo.findById.mockResolvedValue(openSession);
    lineRepo.findById.mockResolvedValue({
      _id: { toString: () => 'line-1' },
      session_id: 'sess-1',
      status: 'inconsistency',
    });
    lineRepo.updateById.mockResolvedValue({});

    const result = await service.undoLine('sess-1', 'line-1');
    expect(result.status).toBe('pending');
  });
});

// ─── finalize ────────────────────────────────────────────────────────────────

describe('finalize', () => {
  const openSession = { _id: { toString: () => 'sess-1' }, status: 'open' };

  it('lanza 400 si hay líneas pending', async () => {
    sessionRepo.findById.mockResolvedValue(openSession);
    lineRepo.findBySessionId.mockResolvedValue([
      { status: 'pending' },
      { status: 'received', received_qty: 1 },
    ]);

    await expect(
      service.finalize('sess-1', { shipping_total_cop: 10000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lanza 400 si shipping_total_cop <= 0', async () => {
    sessionRepo.findById.mockResolvedValue(openSession);

    await expect(
      service.finalize('sess-1', { shipping_total_cop: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('crea stock por cada línea received y decrementa transit', async () => {
    sessionRepo.findById.mockResolvedValue(openSession);
    lineRepo.findBySessionId.mockResolvedValue([
      {
        _id: { toString: () => 'rl-1' },
        status: 'received',
        received_qty: 2,
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        image_url: '',
        language: 'en',
        rareza: null,
        unit_cost_cop: 7500,
        transit_line_id: 'tl-1',
      },
    ]);
    stockRepo.create.mockResolvedValue({ _id: { toString: () => 'stock-1' } });
    lineRepo.updateById.mockResolvedValue({});
    transitLineRepo.decrementRemainingQuantity.mockResolvedValue({});
    sessionRepo.updateStatus.mockResolvedValue({});

    const result = await service.finalize('sess-1', {
      shipping_total_cop: 20000,
    });

    expect(result.stock_created).toBe(1);
    expect(stockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        card_state: 'disponible',
        currency: 'COP',
        incoming_notes: '[recepción CT 028]',
        shipment: 10000, // 20000 / 2
      }),
    );
    expect(transitLineRepo.decrementRemainingQuantity).toHaveBeenCalledWith(
      'tl-1',
      2,
    );
  });

  it('distribuye shipping correctamente (Math.round)', async () => {
    sessionRepo.findById.mockResolvedValue(openSession);
    lineRepo.findBySessionId.mockResolvedValue([
      {
        _id: { toString: () => 'rl-1' },
        status: 'received',
        received_qty: 3,
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        image_url: '',
        language: 'en',
        rareza: null,
        unit_cost_cop: 7500,
        transit_line_id: 'tl-1',
      },
    ]);
    stockRepo.create.mockResolvedValue({ _id: { toString: () => 'stock-1' } });
    lineRepo.updateById.mockResolvedValue({});
    transitLineRepo.decrementRemainingQuantity.mockResolvedValue({});
    sessionRepo.updateStatus.mockResolvedValue({});

    await service.finalize('sess-1', { shipping_total_cop: 10000 });

    // 10000 / 3 = 3333.33... → round → 3333
    expect(stockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ shipment: 3333 }),
    );
  });
});

// ─── revertFinalization ───────────────────────────────────────────────────────

describe('revertFinalization', () => {
  const finalizedSession = {
    _id: { toString: () => 'sess-1' },
    status: 'finalized',
  };

  it('elimina stock, revierte decrementos y reactiva sesión', async () => {
    sessionRepo.findById.mockResolvedValue(finalizedSession);
    lineRepo.findBySessionId.mockResolvedValue([
      {
        _id: { toString: () => 'rl-1' },
        status: 'received',
        stock_id: 'stock-1',
        received_qty: 2,
        transit_line_id: 'tl-1',
        card_name: 'Pikachu',
      },
    ]);
    stockRepo.findById.mockResolvedValue({ card_state: 'disponible' });
    stockRepo.deleteById.mockResolvedValue(true);
    transitLineRepo.incrementRemainingQuantity.mockResolvedValue({});
    lineRepo.updateById.mockResolvedValue({});
    sessionRepo.updateStatus.mockResolvedValue({});

    const result = await service.revertFinalization('sess-1');

    expect(result.status).toBe('open');
    expect(result.stock_deleted).toBe(1);
    expect(stockRepo.deleteById).toHaveBeenCalledWith('stock-1');
    expect(transitLineRepo.incrementRemainingQuantity).toHaveBeenCalledWith(
      'tl-1',
      2,
    );
  });

  it('lanza 409 si algún stock ya fue vendido', async () => {
    sessionRepo.findById.mockResolvedValue(finalizedSession);
    lineRepo.findBySessionId.mockResolvedValue([
      {
        _id: { toString: () => 'rl-1' },
        status: 'received',
        stock_id: 'stock-1',
        received_qty: 1,
        transit_line_id: 'tl-1',
        card_name: 'Pikachu',
      },
    ]);
    stockRepo.findById.mockResolvedValue({ card_state: 'vendido' });

    await expect(service.revertFinalization('sess-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
