import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PedidoService } from './pedido.service';
import { PedidoRepository } from '../repository/pedido.repository';
import { PedidoAbonoRepository } from '../repository/pedido-abono.repository';
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
      findPendientesByFechaRange: jest.fn(async () => [] as PedidoDocument[]),
    } as unknown as PedidoRepository;

    const clientRepo = {
      findById: jest.fn(async () => ({ _id: CLIENT_ID, nombre: 'Ana' })),
      findByIds: jest.fn(async (ids: string[]) =>
        ids.map((id) => ({ _id: id, nombre: 'Ana' })),
      ),
    } as unknown as ClientRepository;

    const reservaRepo = {
      findByPedidoId: jest.fn(async () => opts?.reservas ?? []),
      attachOrphansToPedido: jest.fn(async () => 0),
      deleteByStockId: jest.fn(async () => true),
      deleteById: jest.fn(async () => true),
    } as unknown as ReservaRepository;

    const stockRepo = {
      findById: jest.fn(async () => opts?.stock ?? null),
      findByIds: jest.fn(async () => (opts?.stock ? [opts.stock] : [])),
      updateCardState: jest.fn(async () => ({})),
      incrementQuantityAtomic: jest.fn(async () => ({})),
    } as unknown as StockRepository;

    const saleRepo = {
      create: jest.fn(async () => ({})),
      findVentasByClientId: jest.fn(async () => []),
    } as unknown as SaleRepository;

    const tagRepo = {
      findMapByCardIds: jest.fn(async () => new Map()),
    } as unknown as CardStockTagRepository;

    const pedidoAbonoRepo = {
      deleteByPedidoId: jest.fn(async () => 0),
    } as unknown as PedidoAbonoRepository;

    const svc = new PedidoService(
      pedidoRepo,
      clientRepo,
      reservaRepo,
      stockRepo,
      saleRepo,
      tagRepo,
      pedidoAbonoRepo,
    );
    return { svc, pedidoRepo, reservaRepo, saleRepo, stockRepo, clientRepo, pedidoAbonoRepo };
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

  it('al crear un pedido reserva adjunta reservas sueltas del cliente', async () => {
    const { svc, reservaRepo } = makeService();
    await svc.create({
      client_id: CLIENT_ID,
      entrega_en_tienda: true,
      store_id: 'valhalla',
      fecha_tentativa_entrega: '2026-08-20',
    });
    expect(reservaRepo.attachOrphansToPedido).toHaveBeenCalledWith(
      CLIENT_ID,
      PEDIDO_ID,
    );
  });

  it('pagar adjunta huérfanas antes de resolver líneas', async () => {
    const { svc, reservaRepo } = makeService({
      reservas: [
        {
          _id: 'res-u',
          stock_id: STOCK_ID,
          precio: 15000,
          currency: 'COP',
        },
      ],
      stock: {
        _id: STOCK_ID,
        card_id: 'sv1-1',
        card_name: 'Pikachu',
      },
    });
    await svc.pagar(PEDIDO_ID);
    expect(reservaRepo.attachOrphansToPedido).toHaveBeenCalledWith(
      CLIENT_ID,
      PEDIDO_ID,
    );
    expect(reservaRepo.findByPedidoId).toHaveBeenCalledWith(PEDIDO_ID);
    const attachOrder = (reservaRepo.attachOrphansToPedido as jest.Mock).mock
      .invocationCallOrder[0];
    const findOrder = (reservaRepo.findByPedidoId as jest.Mock).mock
      .invocationCallOrder[0];
    expect(attachOrder).toBeLessThan(findOrder);
  });

  it('listByClient adjunta huérfanas al pedido reservado', async () => {
    const { svc, reservaRepo } = makeService();
    await svc.listByClient(CLIENT_ID);
    expect(reservaRepo.attachOrphansToPedido).toHaveBeenCalledWith(
      CLIENT_ID,
      PEDIDO_ID,
    );
  });

  it('getById de pagado no adjunta huérfanas', async () => {
    const { svc, reservaRepo } = makeService({
      pedido: makePedido({ status: 'pagado', lines_snapshot: [] }),
    });
    await svc.getById(PEDIDO_ID);
    expect(reservaRepo.attachOrphansToPedido).not.toHaveBeenCalled();
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
    const { svc, saleRepo, stockRepo } = makeService({
      reservas: [
        {
          _id: 'res-u',
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
    expect(stockRepo.updateCardState).toHaveBeenCalledWith(STOCK_ID, 'vendida');
  });

  it('pagar línea quantity crea Q sales y no marca vendida', async () => {
    const { svc, saleRepo, stockRepo, reservaRepo } = makeService({
      reservas: [
        {
          _id: 'res-q',
          stock_id: STOCK_ID,
          precio: 2000,
          currency: 'COP',
          quantity: 3,
        },
      ],
      stock: {
        _id: STOCK_ID,
        card_id: 'da-bulk',
        card_name: 'bulk',
        product_kind: 'quantity',
        quantity: 17,
      },
    });
    const paid = await svc.pagar(PEDIDO_ID);
    expect(paid.status).toBe('pagado');
    expect(paid.lines).toHaveLength(1);
    expect(paid.lines[0].quantity).toBe(3);
    expect(saleRepo.create).toHaveBeenCalledTimes(3);
    expect(stockRepo.updateCardState).not.toHaveBeenCalled();
    expect(reservaRepo.deleteById).toHaveBeenCalledWith('res-q');
  });

  it('cancelar línea quantity restaura qty y no pone disponible', async () => {
    const { svc, stockRepo, reservaRepo } = makeService({
      reservas: [
        {
          _id: 'res-q',
          stock_id: STOCK_ID,
          precio: 2000,
          currency: 'COP',
          quantity: 4,
        },
      ],
      stock: {
        _id: STOCK_ID,
        card_id: 'da-bulk',
        product_kind: 'quantity',
        quantity: 10,
      },
    });
    const res = await svc.cancel(PEDIDO_ID);
    expect(res.success).toBe(true);
    expect(stockRepo.incrementQuantityAtomic).toHaveBeenCalledWith(STOCK_ID, 4);
    expect(reservaRepo.deleteById).toHaveBeenCalledWith('res-q');
    expect(stockRepo.updateCardState).not.toHaveBeenCalled();
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

  describe('listCalendario', () => {
    const from = '2026-08-01';
    const to = '2026-08-31';

    it('sin from/to → 400', async () => {
      const { svc } = makeService();
      await expect(svc.listCalendario()).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(svc.listCalendario(from)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(svc.listCalendario(undefined, to)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('from > to → 400; rango de 63 días → 400', async () => {
      const { svc } = makeService();
      await expect(svc.listCalendario('2026-08-31', '2026-08-01')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        svc.listCalendario('2026-01-01', '2026-03-05'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('solo reservado/pagado en el rango; excluye entregado y fuera de rango', async () => {
      const inRangeReservado = makePedido({
        _id: 'p-res',
        status: 'reservado',
        fecha_tentativa_entrega: new Date(Date.UTC(2026, 7, 10)),
      });
      const inRangePagado = makePedido({
        _id: 'p-pag',
        status: 'pagado',
        fecha_tentativa_entrega: new Date(Date.UTC(2026, 7, 12)),
      });
      const entregado = makePedido({
        _id: 'p-ent',
        status: 'entregado',
        fecha_tentativa_entrega: new Date(Date.UTC(2026, 7, 11)),
      });
      const fuera = makePedido({
        _id: 'p-out',
        status: 'reservado',
        fecha_tentativa_entrega: new Date(Date.UTC(2026, 6, 1)),
      });
      const { svc, pedidoRepo } = makeService();
      (pedidoRepo.findPendientesByFechaRange as jest.Mock).mockResolvedValue([
        inRangeReservado,
        inRangePagado,
        entregado,
        fuera,
      ]);

      const res = await svc.listCalendario(from, to);
      expect(res.items.map((i) => i.id).sort()).toEqual(['p-pag', 'p-res']);
      expect(res.items.every((i) => i.status === 'reservado' || i.status === 'pagado')).toBe(
        true,
      );
      expect(res.items.some((i) => 'lines' in i)).toBe(false);
    });

    it('overdue true si fecha < today Bogotá; false si es hoy o futuro', async () => {
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const [ty, tm, td] = today.split('-').map(Number);
      const todayUtc = new Date(Date.UTC(ty, tm - 1, td));
      const pastUtc = new Date(Date.UTC(ty, tm - 1, td - 2));
      const futureUtc = new Date(Date.UTC(ty, tm - 1, td + 3));

      const pastPedido = makePedido({
        _id: 'p-past',
        fecha_tentativa_entrega: pastUtc,
      });
      const todayPedido = makePedido({
        _id: 'p-today',
        fecha_tentativa_entrega: todayUtc,
      });
      const futurePedido = makePedido({
        _id: 'p-fut',
        fecha_tentativa_entrega: futureUtc,
      });
      const { svc, pedidoRepo } = makeService();
      (pedidoRepo.findPendientesByFechaRange as jest.Mock).mockResolvedValue([
        pastPedido,
        todayPedido,
        futurePedido,
      ]);

      const rangeFrom = new Date(Date.UTC(ty, tm - 1, td - 5)).toISOString().slice(0, 10);
      const rangeTo = new Date(Date.UTC(ty, tm - 1, td + 5)).toISOString().slice(0, 10);
      const res = await svc.listCalendario(rangeFrom, rangeTo);
      expect(res.today).toBe(today);
      expect(res.items.find((i) => i.id === 'p-past')?.overdue).toBe(true);
      expect(res.items.find((i) => i.id === 'p-today')?.overdue).toBe(false);
      expect(res.items.find((i) => i.id === 'p-fut')?.overdue).toBe(false);
    });

    it('item tienda incluye mapa.kind tienda y coords del catálogo', async () => {
      const { svc, pedidoRepo } = makeService();
      (pedidoRepo.findPendientesByFechaRange as jest.Mock).mockResolvedValue([
        makePedido({
          entrega_en_tienda: true,
          store_id: 'valhalla',
          store_name: 'Valhalla',
          fecha_tentativa_entrega: new Date(Date.UTC(2026, 7, 20)),
        }),
      ]);
      const res = await svc.listCalendario(from, to);
      expect(res.items).toHaveLength(1);
      const mapa = res.items[0].mapa;
      expect(mapa.kind).toBe('tienda');
      if (mapa.kind === 'tienda') {
        expect(mapa.store_id).toBe('valhalla');
        expect(mapa.lat).toBe(4.7318253);
        expect(mapa.lng).toBe(-74.0420361);
      }
    });

    it('ciudad Bogotá / bogota / BOGOTÁ D.C. → domicilio_bogota; Medellín → omitido/fuera_bogota', async () => {
      const mkShip = (
        id: string,
        ciudad: string,
      ): PedidoDocument =>
        makePedido({
          _id: id,
          entrega_en_tienda: false,
          store_id: undefined,
          store_name: undefined,
          store_address: undefined,
          ciudad,
          direccion_o_punto: 'Calle 100 #15-20',
          fecha_tentativa_entrega: new Date(Date.UTC(2026, 7, 15)),
        });
      const { svc, pedidoRepo } = makeService();
      (pedidoRepo.findPendientesByFechaRange as jest.Mock).mockResolvedValue([
        mkShip('p-bog1', 'Bogotá'),
        mkShip('p-bog2', 'bogota'),
        mkShip('p-bog3', 'BOGOTÁ D.C.'),
        mkShip('p-med', 'Medellín'),
      ]);
      const res = await svc.listCalendario(from, to);
      const byId = Object.fromEntries(res.items.map((i) => [i.id, i.mapa]));
      expect(byId['p-bog1']).toEqual({ kind: 'domicilio_bogota' });
      expect(byId['p-bog2']).toEqual({ kind: 'domicilio_bogota' });
      expect(byId['p-bog3']).toEqual({ kind: 'domicilio_bogota' });
      expect(byId['p-med']).toEqual({
        kind: 'omitido',
        reason: 'fuera_bogota',
      });
    });
  });

  it('PATCH pagado con nueva fecha → 200 y status sigue pagado', async () => {
    const { svc, pedidoRepo } = makeService({
      pedido: makePedido({
        status: 'pagado',
        fecha_tentativa_entrega: new Date(Date.UTC(2026, 7, 20)),
      }),
    });
    const res = await svc.patch(PEDIDO_ID, {
      fecha_tentativa_entrega: '2026-08-25',
    });
    expect(res.status).toBe('pagado');
    expect(res.fecha_tentativa_entrega).toBe('2026-08-25');
    const payload = (pedidoRepo.update as jest.Mock).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.status).toBeUndefined();
    expect(payload.paid_at).toBeUndefined();
    expect(payload.lines_snapshot).toBeUndefined();
  });

  it('PATCH entregado → 409', async () => {
    const { svc } = makeService({
      pedido: makePedido({ status: 'entregado' }),
    });
    await expect(
      svc.patch(PEDIDO_ID, { fecha_tentativa_entrega: '2026-08-25' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('PATCH reservado sigue funcionando', async () => {
    const { svc } = makeService();
    const res = await svc.patch(PEDIDO_ID, {
      fecha_tentativa_entrega: '2026-08-22',
    });
    expect(res.status).toBe('reservado');
    expect(res.fecha_tentativa_entrega).toBe('2026-08-22');
  });

  it('listTiendas incluye lat/lng para los 8 ids', () => {
    const { svc } = makeService();
    const tiendas = svc.listTiendas();
    expect(tiendas.map((t) => t.id)).toEqual([
      'hidden-tcg-store',
      'draco-hobby-center',
      'unlimited-hobby-center',
      'lx-store',
      'play4cards',
      'tokyo-hobby-nations',
      'valhalla',
      'real-burgers',
    ]);
    for (const t of tiendas) {
      expect(Number.isFinite(t.lat)).toBe(true);
      expect(Number.isFinite(t.lng)).toBe(true);
    }
  });
});
