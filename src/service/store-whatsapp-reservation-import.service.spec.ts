import { ConflictException } from '@nestjs/common';
import { StoreWhatsAppReservationImportService } from './store-whatsapp-reservation-import.service';
import { ClientRepository } from '../repository/client.repository';
import { StockRepository } from '../repository/stock.repository';
import { ReservaRepository } from '../repository/reserva.repository';
import { PvpRepository } from '../repository/pvp.repository';
import { PedidoService } from './pedido.service';

describe('StoreWhatsAppReservationImportService', () => {
  const sampleMessage = [
    'Hola, quiero reservar las siguientes cartas:',
    '',
    '- Test Card | ID: sv08-130 | Expansión: Set (#130) | Idioma: Inglés x1',
    '',
    'A nombre de: Cliente Test',
  ].join('\n');

  function makeService(deps: {
    stock?: Array<Record<string, unknown>>;
    stockByOwner?: Partial<
      Record<'pablo' | 'esteban', Array<Record<string, unknown>>>
    >;
    reservas?: Array<{ stock_id: string; stock_owner?: string }>;
    reservasByOwner?: Partial<
      Record<
        'pablo' | 'esteban',
        Array<{ stock_id: string; stock_owner?: string }>
      >
    >;
    pvps?: Array<{
      card_id: string;
      pvp: number;
      currency: string;
      rareza?: string | null;
    }>;
    pvpsByOwner?: Partial<
      Record<
        'pablo' | 'esteban',
        Array<{
          card_id: string;
          pvp: number;
          currency: string;
          rareza?: string | null;
        }>
      >
    >;
  }) {
    const stockFor = (owner: 'pablo' | 'esteban') =>
      deps.stockByOwner?.[owner] ??
      (owner === 'pablo' ? (deps.stock ?? []) : []);
    const reservasFor = (owner: 'pablo' | 'esteban') =>
      deps.reservasByOwner?.[owner] ??
      (owner === 'pablo' ? (deps.reservas ?? []) : []);
    const pvpsFor = (owner: 'pablo' | 'esteban') =>
      deps.pvpsByOwner?.[owner] ?? (owner === 'pablo' ? (deps.pvps ?? []) : []);

    const clientRepository = {
      findById: jest.fn().mockResolvedValue({ _id: 'c1', nombre: 'Cliente' }),
    } as unknown as ClientRepository;

    const stockRepository = {
      findAll: jest.fn().mockImplementation(async () => {
        const { getCurrentOwner } = require('src/owner/owner-context');
        return stockFor(getCurrentOwner());
      }),
      findById: jest.fn(async (id: string) => {
        const { getCurrentOwner } = require('src/owner/owner-context');
        return (
          stockFor(getCurrentOwner()).find((s) => String(s._id) === id) ?? null
        );
      }),
      updateCardState: jest.fn().mockResolvedValue({}),
    } as unknown as StockRepository;

    const reservaRepository = {
      findAll: jest.fn().mockImplementation(async () => {
        const { getCurrentOwner } = require('src/owner/owner-context');
        return reservasFor(getCurrentOwner());
      }),
      findByStockId: jest.fn().mockResolvedValue(null),
      findAllByStockId: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async (dto) => ({
        _id: `r-${dto.stock_id}`,
        ...dto,
      })),
    } as unknown as ReservaRepository;

    const pvpRepository = {
      findByCardIds: jest.fn().mockImplementation(async () => {
        const { getCurrentOwner } = require('src/owner/owner-context');
        return pvpsFor(getCurrentOwner());
      }),
      update: jest.fn().mockResolvedValue({}),
    } as unknown as PvpRepository;

    const pedidoService = {
      requireReservadoPedido: jest.fn().mockResolvedValue({ _id: 'p1' }),
      findReservadoByClientId: jest.fn().mockResolvedValue({ _id: 'p1' }),
      findOpenByClientId: jest
        .fn()
        .mockResolvedValue({ _id: 'p1', status: 'reservado' }),
      create: jest.fn().mockResolvedValue({ id: 'p-new', _id: 'p-new' }),
    } as unknown as PedidoService;

    const svc = new StoreWhatsAppReservationImportService(
      clientRepository,
      stockRepository,
      reservaRepository,
      pvpRepository,
      pedidoService,
    );

    return {
      svc,
      reservaRepository,
      stockRepository,
      pvpRepository,
      pedidoService,
    };
  }

  it('preview asigna stock disponible con PVP', async () => {
    const { svc } = makeService({
      stock: [
        {
          _id: 's1',
          card_id: 'sv08-130',
          language: 'en',
          card_state: 'disponible',
        },
      ],
      pvps: [
        { card_id: 'sv08-130', pvp: 12000, currency: 'COP', rareza: null },
      ],
    });

    const plan = await svc.preview('c1', sampleMessage);
    expect(plan.lines[0].matched).toBe(1);
    expect(plan.lines[0].stock_ids).toEqual(['s1']);
    expect(plan.lines[0].stock_owners).toEqual(['pablo']);
    expect(plan.lines[0].precio_cop_por_unidad).toEqual([12000]);
  });

  it('preview parcial si falta stock', async () => {
    const { svc } = makeService({
      stock: [
        {
          _id: 's1',
          card_id: 'sv08-130',
          language: 'en',
          card_state: 'disponible',
        },
      ],
      pvps: [{ card_id: 'sv08-130', pvp: 5000, currency: 'COP', rareza: null }],
    });

    const msg = sampleMessage.replace('x1', 'x3');
    const plan = await svc.preview('c1', msg);
    expect(plan.lines[0].requested).toBe(3);
    expect(plan.lines[0].matched).toBe(1);
    expect(plan.lines[0].issues).toContain('insufficient_stock');
  });

  it('import crea reserva y marca stock', async () => {
    const { svc, reservaRepository, stockRepository } = makeService({
      stock: [
        {
          _id: 's1',
          card_id: 'sv08-130',
          language: 'en',
          card_state: 'disponible',
        },
      ],
      pvps: [{ card_id: 'sv08-130', pvp: 8000, currency: 'COP', rareza: null }],
    });

    const result = await svc.import('c1', sampleMessage);
    expect(result.created).toHaveLength(1);
    expect(reservaRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pedido_id: 'p1',
        stock_id: 's1',
        stock_owner: 'pablo',
      }),
    );
    expect(stockRepository.updateCardState).toHaveBeenCalledWith(
      's1',
      'reserva',
    );
  });

  it('usa el Precio del mensaje de la tienda si no hay PVP en BD', async () => {
    const storeMessage = [
      'Hola, quiero reservar las siguientes cartas:',
      '',
      '- Test Card | ID: sv08-130 | Expansión: Set (#130) | Idioma: Inglés | Precio: $ 15.000 x1',
      '',
      'Total: $ 15.000',
      'A nombre de: Cliente Test',
    ].join('\n');
    const { svc } = makeService({
      stock: [
        {
          _id: 's1',
          card_id: 'sv08-130',
          language: 'en',
          card_state: 'disponible',
          image_url: 'https://img.example/sv08-130.png',
        },
      ],
    });
    const plan = await svc.preview('c1', storeMessage);
    expect(plan.lines[0].matched).toBe(1);
    expect(plan.lines[0].suggested_pvp_cop).toBe(15000);
    expect(plan.lines[0].precio_cop_por_unidad).toEqual([15000]);
    expect(plan.lines[0].image_url).toBe('https://img.example/sv08-130.png');
  });

  it('guarda PVP opcional al importar', async () => {
    const { svc, pvpRepository } = makeService({
      stock: [
        {
          _id: 's1',
          card_id: 'sv08-130',
          language: 'en',
          card_state: 'disponible',
        },
      ],
    });
    const result = await svc.import('c1', sampleMessage, [
      { index: 0, pvp_cop: 9000 },
    ]);
    expect(result.created).toHaveLength(1);
    expect(result.created[0].precio).toBe(9000);
    expect(result.pvp_saved).toBe(1);
    expect(pvpRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        card_id: 'sv08-130',
        pvp: 9000,
        currency: 'COP',
      }),
    );
  });

  it('devuelve image_url aunque no haya cupo de stock', async () => {
    const { svc } = makeService({
      stock: [
        {
          _id: 's1',
          card_id: 'sv08-130',
          language: 'en',
          card_state: 'reserva',
          image_url: 'https://img.example/reserved.png',
        },
      ],
    });
    const plan = await svc.preview('c1', sampleMessage);
    expect(plan.lines[0].matched).toBe(0);
    expect(plan.lines[0].issues).toContain('insufficient_stock');
    expect(plan.lines[0].image_url).toBe('https://img.example/reserved.png');
  });

  it('preview: carta solo en Esteban + contexto pablo → stock_owner esteban', async () => {
    const { svc } = makeService({
      stockByOwner: {
        pablo: [],
        esteban: [
          {
            _id: 'e1',
            card_id: 'sv08-130',
            language: 'en',
            card_state: 'disponible',
          },
        ],
      },
      pvpsByOwner: {
        esteban: [
          { card_id: 'sv08-130', pvp: 11000, currency: 'COP', rareza: null },
        ],
      },
    });

    const { runWithOwnerAsync } = require('src/owner/owner-context');
    const plan = await runWithOwnerAsync('pablo', () =>
      svc.preview('c1', sampleMessage),
    );
    expect(plan.lines[0].matched).toBe(1);
    expect(plan.lines[0].stock_ids).toEqual(['e1']);
    expect(plan.lines[0].stock_owners).toEqual(['esteban']);
    expect(plan.lines[0].precio_cop_por_unidad).toEqual([11000]);
  });

  it('preview: ambas DBs tienen la carta → usa pablo primero si current es pablo', async () => {
    const { svc } = makeService({
      stockByOwner: {
        pablo: [
          {
            _id: 'p1',
            card_id: 'sv08-130',
            language: 'en',
            card_state: 'disponible',
          },
        ],
        esteban: [
          {
            _id: 'e1',
            card_id: 'sv08-130',
            language: 'en',
            card_state: 'disponible',
          },
        ],
      },
      pvpsByOwner: {
        pablo: [
          { card_id: 'sv08-130', pvp: 8000, currency: 'COP', rareza: null },
        ],
        esteban: [
          { card_id: 'sv08-130', pvp: 9000, currency: 'COP', rareza: null },
        ],
      },
    });

    const { runWithOwnerAsync } = require('src/owner/owner-context');
    const plan = await runWithOwnerAsync('pablo', () =>
      svc.preview('c1', sampleMessage),
    );
    expect(plan.lines[0].matched).toBe(1);
    expect(plan.lines[0].stock_ids).toEqual(['p1']);
    expect(plan.lines[0].stock_owners).toEqual(['pablo']);
  });

  it('preview: mismo ObjectId en ambas DBs no descarta la copia del segundo owner', async () => {
    const twoUnits = [
      'Hola, quiero reservar las siguientes cartas:',
      '',
      '- Test Card | ID: sv08-130 | Expansión: Set (#130) | Idioma: Inglés x2',
      '',
      'A nombre de: Cliente Test',
    ].join('\n');
    const { svc } = makeService({
      stockByOwner: {
        pablo: [
          {
            _id: 'same-id',
            card_id: 'sv08-130',
            language: 'en',
            card_state: 'disponible',
          },
        ],
        esteban: [
          {
            _id: 'same-id',
            card_id: 'sv08-130',
            language: 'en',
            card_state: 'disponible',
          },
        ],
      },
      pvpsByOwner: {
        pablo: [
          { card_id: 'sv08-130', pvp: 8000, currency: 'COP', rareza: null },
        ],
        esteban: [
          { card_id: 'sv08-130', pvp: 9000, currency: 'COP', rareza: null },
        ],
      },
    });

    const { runWithOwnerAsync } = require('src/owner/owner-context');
    const plan = await runWithOwnerAsync('pablo', () =>
      svc.preview('c1', twoUnits),
    );
    expect(plan.lines[0].matched).toBe(2);
    expect(plan.lines[0].stock_ids).toEqual(['same-id', 'same-id']);
    expect(plan.lines[0].stock_owners).toEqual(['pablo', 'esteban']);
  });

  it('import de línea Esteban crea reserva en owner del request', async () => {
    const createOwners: string[] = [];
    const { svc, reservaRepository, stockRepository } = makeService({
      stockByOwner: {
        pablo: [],
        esteban: [
          {
            _id: 'e1',
            card_id: 'sv08-130',
            language: 'en',
            card_state: 'disponible',
          },
        ],
      },
      pvpsByOwner: {
        esteban: [
          { card_id: 'sv08-130', pvp: 8000, currency: 'COP', rareza: null },
        ],
      },
    });
    (reservaRepository.create as jest.Mock).mockImplementation(async (dto) => {
      const { getCurrentOwner } = require('src/owner/owner-context');
      createOwners.push(getCurrentOwner());
      return { _id: `r-${dto.stock_id}`, ...dto };
    });
    const updateOwners: string[] = [];
    (stockRepository.updateCardState as jest.Mock).mockImplementation(
      async () => {
        const { getCurrentOwner } = require('src/owner/owner-context');
        updateOwners.push(getCurrentOwner());
        return {};
      },
    );

    const { runWithOwnerAsync } = require('src/owner/owner-context');
    const result = await runWithOwnerAsync('pablo', () =>
      svc.import('c1', sampleMessage),
    );
    expect(result.created).toHaveLength(1);
    expect(result.created[0].stock_owner).toBe('esteban');
    expect(createOwners).toEqual(['pablo']);
    expect(updateOwners).toEqual(['esteban']);
  });

  const deliveryMessage = [
    'Hola, quiero reservar las siguientes cartas:',
    '',
    '- Test Card | ID: sv08-130 | Expansión: Set (#130) | Idioma: Inglés x1',
    '',
    'A nombre de: Cliente Test',
    'Recogida en tienda: Hidden TCG Store | store_id: hidden-tcg-store',
    'Fecha tentativa de entrega: 2026-09-20',
  ].join('\n');

  const stockReady = {
    stock: [
      {
        _id: 's1',
        card_id: 'sv08-130',
        language: 'en',
        card_state: 'disponible',
      },
    ],
    pvps: [{ card_id: 'sv08-130', pvp: 8000, currency: 'COP', rareza: null }],
  };

  it('sin pedidos + tienda+fecha → create y reservas con el id creado', async () => {
    const { svc, reservaRepository, pedidoService } = makeService(stockReady);
    (pedidoService.findReservadoByClientId as jest.Mock).mockResolvedValue(
      null,
    );
    (pedidoService.findOpenByClientId as jest.Mock).mockResolvedValue(null);

    const result = await svc.import('c1', deliveryMessage);
    expect(pedidoService.create).toHaveBeenCalledWith({
      client_id: 'c1',
      entrega_en_tienda: true,
      store_id: 'hidden-tcg-store',
      fecha_tentativa_entrega: '2026-09-20',
    });
    expect(pedidoService.requireReservadoPedido).not.toHaveBeenCalled();
    expect(reservaRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pedido_id: 'p-new',
        stock_id: 's1',
      }),
    );
    expect(result.delivery.pedido_action).toBe('create');
    expect(result.created).toHaveLength(1);
  });

  it('con reservado + tienda+fecha → no create; reservas al id existente', async () => {
    const { svc, reservaRepository, pedidoService } = makeService(stockReady);

    const result = await svc.import('c1', deliveryMessage);
    expect(pedidoService.create).not.toHaveBeenCalled();
    expect(pedidoService.requireReservadoPedido).toHaveBeenCalledWith('c1');
    expect(reservaRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pedido_id: 'p1',
        stock_id: 's1',
      }),
    );
    expect(result.delivery.pedido_action).toBe('reuse_reservado');
    expect(result.delivery.existing_pedido_id).toBe('p1');
  });

  it('sin entrega y sin reservado → reservas huérfanas; no require ni create', async () => {
    const { svc, reservaRepository, pedidoService } = makeService(stockReady);
    (pedidoService.findReservadoByClientId as jest.Mock).mockResolvedValue(
      null,
    );
    (pedidoService.findOpenByClientId as jest.Mock).mockResolvedValue(null);

    const result = await svc.import('c1', sampleMessage);
    expect(pedidoService.create).not.toHaveBeenCalled();
    expect(pedidoService.requireReservadoPedido).not.toHaveBeenCalled();
    expect(reservaRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        stock_id: 's1',
        client_id: 'c1',
      }),
    );
    expect(
      (reservaRepository.create as jest.Mock).mock.calls[0][0],
    ).not.toHaveProperty('pedido_id');
    expect(result.delivery.pedido_action).toBe('reservas_only');
  });

  it('solo tienda o solo fecha → reservas_only igual que sin entrega', async () => {
    const onlyStore = [
      sampleMessage,
      'Recogida en tienda: Hidden TCG Store | store_id: hidden-tcg-store',
    ].join('\n');
    const onlyFecha = [
      sampleMessage,
      'Fecha tentativa de entrega: 2026-09-20',
    ].join('\n');

    for (const msg of [onlyStore, onlyFecha]) {
      const { svc, reservaRepository, pedidoService } = makeService(stockReady);
      (pedidoService.findReservadoByClientId as jest.Mock).mockResolvedValue(
        null,
      );
      (pedidoService.findOpenByClientId as jest.Mock).mockResolvedValue(null);

      const result = await svc.import('c1', msg);
      expect(pedidoService.create).not.toHaveBeenCalled();
      expect(pedidoService.requireReservadoPedido).not.toHaveBeenCalled();
      expect(
        (reservaRepository.create as jest.Mock).mock.calls[0][0],
      ).not.toHaveProperty('pedido_id');
      expect(result.delivery.pedido_action).toBe('reservas_only');
    }
  });

  it('pagado abierto sin reservado → preview blocked_pagado; import 409', async () => {
    const { svc, reservaRepository, pedidoService } = makeService(stockReady);
    (pedidoService.findReservadoByClientId as jest.Mock).mockResolvedValue(
      null,
    );
    (pedidoService.findOpenByClientId as jest.Mock).mockResolvedValue({
      _id: 'p-paid',
      status: 'pagado',
    });

    const preview = await svc.preview('c1', deliveryMessage);
    expect(preview.delivery.pedido_action).toBe('blocked_pagado');
    expect(preview.delivery.existing_pedido_id).toBe('p-paid');

    await expect(svc.import('c1', deliveryMessage)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(pedidoService.create).not.toHaveBeenCalled();
    expect(reservaRepository.create).not.toHaveBeenCalled();
  });
});
