import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PedidoService } from './pedido.service';
import { PedidoRepository } from '../repository/pedido.repository';
import { ClientRepository } from '../repository/client.repository';
import { ReservaRepository } from '../repository/reserva.repository';
import { StockRepository } from '../repository/stock.repository';
import { SaleRepository } from '../repository/sale.repository';
import { CardStockTagRepository } from '../repository/card-stock-tag.repository';
import { PedidoDocument } from '../schema/pedido.schema';

const CLIENT_ID = '507f1f77bcf86cd799439011';
const PEDIDO_ID = '507f1f77bcf86cd799439012';
const STOCK_ID = '507f1f77bcf86cd799439013';

function makePedido(overrides: Record<string, unknown> = {}): PedidoDocument {
  return {
    _id: PEDIDO_ID,
    client_id: CLIENT_ID,
    status: 'reservado',
    entrega_en_tienda: true,
    store_id: 'valhalla',
    store_name: 'Valhalla',
    store_address: 'Cl. 150 #16-56 local 2074, CC Cedritos, Bogotá',
    fecha_tentativa_entrega: new Date(Date.UTC(2026, 7, 20)),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as unknown as PedidoDocument;
}

describe('PedidoService', () => {
  function makeService(opts?: {
    open?: PedidoDocument | null;
    pedido?: PedidoDocument | null;
    reservas?: Array<Record<string, unknown>>;
    stock?: Record<string, unknown> | null;
  }) {
    const pedidoRepo = {
      create: jest.fn(async (data) => makePedido({ ...data, _id: PEDIDO_ID })),
      findById: jest.fn(async () => opts?.pedido ?? makePedido()),
      findByClientId: jest.fn(async () => [opts?.pedido ?? makePedido()]),
      findOpenByClientId: jest.fn(async () => opts?.open ?? null),
      findReservadoByClientId: jest.fn(async () =>
        (opts?.pedido ?? makePedido()).status === 'reservado'
          ? (opts?.pedido ?? makePedido())
          : null,
      ),
      update: jest.fn(async (_id, data) =>
        makePedido({ ...(opts?.pedido ?? makePedido()), ...data }),
      ),
      deleteById: jest.fn(async () => true),
    } as unknown as PedidoRepository;

    const clientRepo = {
      findById: jest.fn(async () => ({ _id: CLIENT_ID, nombre: 'Ana' })),
    } as unknown as ClientRepository;

    const reservaRepo = {
      findByPedidoId: jest.fn(async () => opts?.reservas ?? []),
      deleteByStockId: jest.fn(async () => true),
    } as unknown as ReservaRepository;

    const stockRepo = {
      findById: jest.fn(async () => opts?.stock ?? null),
      findByIds: jest.fn(async () => (opts?.stock ? [opts.stock] : [])),
      updateCardState: jest.fn(async () => ({})),
    } as unknown as StockRepository;

    const saleRepo = {
      create: jest.fn(async () => ({})),
      findVentasByClientId: jest.fn(async () => []),
    } as unknown as SaleRepository;

    const tagRepo = {
      findMapByCardIds: jest.fn(async () => new Map()),
    } as unknown as CardStockTagRepository;

    const svc = new PedidoService(
      pedidoRepo,
      clientRepo,
      reservaRepo,
      stockRepo,
      saleRepo,
      tagRepo,
    );
    return { svc, pedidoRepo, reservaRepo, saleRepo };
  }

  it('valida entrega en tienda vs envío', async () => {
    const { svc } = makeService();
    await expect(
      svc.create({
        client_id: CLIENT_ID,
        entrega_en_tienda: true,
        store_id: 'no-existe',
        fecha_tentativa_entrega: '2026-08-20',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      svc.create({
        client_id: CLIENT_ID,
        entrega_en_tienda: false,
        ciudad: 'Bogotá',
        fecha_tentativa_entrega: '2026-08-20',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const created = await svc.create({
      client_id: CLIENT_ID,
      entrega_en_tienda: false,
      ciudad: 'Medellín',
      direccion_o_punto: 'Calle 10 #5-20',
      fecha_tentativa_entrega: '2026-08-20',
    });
    expect(created.entrega_en_tienda).toBe(false);
    expect(created.ciudad).toBe('Medellín');
  });

  it('409 si ya hay un pedido abierto', async () => {
    const { svc } = makeService({ open: makePedido() });
    await expect(
      svc.create({
        client_id: CLIENT_ID,
        entrega_en_tienda: true,
        store_id: 'valhalla',
        fecha_tentativa_entrega: '2026-08-20',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reservar sin pedido reservado → 409', async () => {
    const { svc } = makeService({
      pedido: makePedido({ status: 'pagado' }),
    });
    await expect(svc.requireReservadoPedido(CLIENT_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('pagar vacío → 400; pagar no reservado → 409', async () => {
    const empty = makeService({ reservas: [] });
    await expect(empty.svc.pagar(PEDIDO_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const paid = makeService({
      pedido: makePedido({ status: 'pagado' }),
      reservas: [{ stock_id: STOCK_ID, precio: 1000, currency: 'COP' }],
    });
    await expect(paid.svc.pagar(PEDIDO_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('entregar solo desde pagado', async () => {
    const reserved = makeService({ pedido: makePedido({ status: 'reservado' }) });
    await expect(reserved.svc.entregar(PEDIDO_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const pagado = makeService({ pedido: makePedido({ status: 'pagado' }) });
    const res = await pagado.svc.entregar(PEDIDO_ID);
    expect(res.status).toBe('entregado');
  });

  it('pagar snapshot y marca vendida', async () => {
    const { svc, saleRepo } = makeService({
      reservas: [
        {
          stock_id: STOCK_ID,
          precio: 15000,
          currency: 'COP',
        },
      ],
      stock: {
        _id: STOCK_ID,
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        image_url: 'http://img',
      },
    });
    const paid = await svc.pagar(PEDIDO_ID);
    expect(paid.status).toBe('pagado');
    expect(paid.lines).toHaveLength(1);
    expect(saleRepo.create).toHaveBeenCalled();
  });

  it('reconstruye líneas desde ventas si falta snapshot', async () => {
    const { svc, saleRepo } = makeService({
      pedido: makePedido({
        status: 'entregado',
        lines_snapshot: [],
        delivered_at: new Date(),
      }),
      stock: {
        _id: STOCK_ID,
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        image_url: 'http://img',
      },
    });
    (saleRepo.findVentasByClientId as jest.Mock).mockResolvedValue([
      {
        stock_id: STOCK_ID,
        card_id: 'sv1-1',
        amount_cop: 18000,
        notes: `Venta finalizada desde pedido ${PEDIDO_ID}`,
      },
    ]);
    const res = await svc.getById(PEDIDO_ID);
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].precio).toBe(18000);
    expect(res.lines[0].card_name).toBe('Pikachu');
  });

  it('cliente inexistente → 404', async () => {
    const clientRepo = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as ClientRepository;
    const { svc } = makeService();
    (svc as unknown as { clientRepository: ClientRepository }).clientRepository =
      clientRepo;
    await expect(
      svc.create({
        client_id: CLIENT_ID,
        entrega_en_tienda: true,
        store_id: 'valhalla',
        fecha_tentativa_entrega: '2026-08-20',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
