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
    stock: Array<Record<string, unknown>>;
    reservas?: Array<{ stock_id: string }>;
    pvps?: Array<{
      card_id: string;
      pvp: number;
      currency: string;
      rareza?: string | null;
    }>;
  }) {
    const clientRepository = {
      findById: jest.fn().mockResolvedValue({ _id: 'c1', nombre: 'Cliente' }),
    } as unknown as ClientRepository;

    const stockRepository = {
      findAll: jest.fn().mockResolvedValue(deps.stock),
      findById: jest.fn(
        async (id: string) =>
          deps.stock.find((s) => String(s._id) === id) ?? null,
      ),
      updateCardState: jest.fn().mockResolvedValue({}),
    } as unknown as StockRepository;

    const reservaRepository = {
      findAll: jest.fn().mockResolvedValue(deps.reservas ?? []),
      findByStockId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (dto) => ({
        _id: `r-${dto.stock_id}`,
        ...dto,
      })),
    } as unknown as ReservaRepository;

    const pvpRepository = {
      findByCardIds: jest.fn().mockResolvedValue(deps.pvps ?? []),
      update: jest.fn().mockResolvedValue({}),
    } as unknown as PvpRepository;

    const pedidoService = {
      requireReservadoPedido: jest.fn().mockResolvedValue({ _id: 'p1' }),
    } as unknown as PedidoService;

    const svc = new StoreWhatsAppReservationImportService(
      clientRepository,
      stockRepository,
      reservaRepository,
      pvpRepository,
      pedidoService,
    );

    return { svc, reservaRepository, stockRepository, pvpRepository };
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
      expect.objectContaining({ pedido_id: 'p1', stock_id: 's1' }),
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
});
