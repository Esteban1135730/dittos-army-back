import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PedidoAbonoService } from './pedido-abono.service';
import { PedidoAbonoRepository } from '../repository/pedido-abono.repository';
import { PedidoRepository } from '../repository/pedido.repository';
import { ReservaRepository } from '../repository/reserva.repository';
import { PedidoDocument } from '../schema/pedido.schema';
import { precioToCop } from '../utils/precio-to-cop';

const PEDIDO_ID = '507f1f77bcf86cd799439012';
const OTHER_PEDIDO = '507f1f77bcf86cd799439099';
const ABONO_A = '507f1f77bcf86cd799439011';
const ABONO_B = '507f1f77bcf86cd799439013';

type AbonoDoc = {
  _id: string;
  pedido_id: string;
  amount_cop: number;
  created_at: Date;
};

function makePedido(overrides: Record<string, unknown> = {}): PedidoDocument {
  return {
    _id: PEDIDO_ID,
    client_id: '507f1f77bcf86cd799439001',
    status: 'reservado',
    entrega_en_tienda: true,
    lines_snapshot: [],
    ...overrides,
  } as unknown as PedidoDocument;
}

describe('PedidoAbonoService', () => {
  function makeService(opts: {
    pedido?: PedidoDocument | null;
    reservas?: Array<{ precio: number; currency?: string; quantity?: number }>;
    abonos?: AbonoDoc[];
  }) {
    let abonos = [...(opts.abonos ?? [])];
    const pedidoRepo = {
      findById: jest.fn(async () =>
        Object.prototype.hasOwnProperty.call(opts, 'pedido')
          ? opts.pedido ?? null
          : makePedido(),
      ),
    } as unknown as PedidoRepository;
    const reservaRepo = {
      findByPedidoId: jest.fn(async () => opts.reservas ?? []),
    } as unknown as ReservaRepository;
    const abonoRepo = {
      findByPedidoId: jest.fn(async () => abonos),
      create: jest.fn(async (pedidoId: string, amount: number) => {
        const doc: AbonoDoc = {
          _id: 'new-abono',
          pedido_id: pedidoId,
          amount_cop: amount,
          created_at: new Date('2026-08-31T12:00:00.000Z'),
        };
        abonos = [doc, ...abonos];
        return doc;
      }),
      findById: jest.fn(async (id: string) => abonos.find((a) => a._id === id) ?? null),
      deleteById: jest.fn(async (id: string) => {
        const before = abonos.length;
        abonos = abonos.filter((a) => a._id !== id);
        return abonos.length < before;
      }),
      deleteByPedidoId: jest.fn(async () => {
        const n = abonos.length;
        abonos = [];
        return n;
      }),
    } as unknown as PedidoAbonoRepository;

    const svc = new PedidoAbonoService(pedidoRepo, reservaRepo, abonoRepo);
    return { svc, getAbonos: () => abonos };
  }

  it('suma COP de reservas vivas con quantity y convierte EUR', async () => {
    const { svc } = makeService({
      reservas: [
        { precio: 4000, currency: 'COP', quantity: 2 },
        { precio: 2, currency: 'EUR', quantity: 1 },
      ],
    });
    const res = await svc.listAbonos(PEDIDO_ID);
    expect(res.total_pvp_cop).toBe(8000 + precioToCop(2, 'EUR'));
    expect(res.abonado_cop).toBe(0);
    expect(res.saldo_cop).toBe(18000);
  });

  it('POST registra un abono dentro del saldo', async () => {
    const { svc } = makeService({
      reservas: [{ precio: 10000, currency: 'COP', quantity: 1 }],
    });
    const res = await svc.addAbono(PEDIDO_ID, 3000);
    expect(res.abonado_cop).toBe(3000);
    expect(res.saldo_cop).toBe(7000);
  });

  it('POST rechaza si supera el saldo o el saldo es 0', async () => {
    const full = makeService({
      reservas: [{ precio: 5000, currency: 'COP' }],
      abonos: [
        {
          _id: ABONO_A,
          pedido_id: PEDIDO_ID,
          amount_cop: 5000,
          created_at: new Date(),
        },
      ],
    });
    await expect(full.svc.addAbono(PEDIDO_ID, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const empty = makeService({ reservas: [] });
    await expect(empty.svc.addAbono(PEDIDO_ID, 1)).rejects.toThrow(
      'No hay saldo para abonar',
    );
  });

  it('POST/DELETE en pagado → 409; GET usa snapshot', async () => {
    const pedido = makePedido({
      status: 'pagado',
      lines_snapshot: [{ precio: 8000, currency: 'COP', quantity: 1 }],
    });
    const { svc } = makeService({
      pedido,
      abonos: [
        {
          _id: ABONO_A,
          pedido_id: PEDIDO_ID,
          amount_cop: 2000,
          created_at: new Date(),
        },
      ],
    });
    const listed = await svc.listAbonos(PEDIDO_ID);
    expect(listed.total_pvp_cop).toBe(8000);
    expect(listed.abonado_cop).toBe(2000);
    await expect(svc.addAbono(PEDIDO_ID, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(svc.deleteAbono(PEDIDO_ID, ABONO_A)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('DELETE propio ok; otro pedido → 404', async () => {
    const { svc, getAbonos } = makeService({
      reservas: [{ precio: 8000, currency: 'COP' }],
      abonos: [
        {
          _id: ABONO_A,
          pedido_id: PEDIDO_ID,
          amount_cop: 2000,
          created_at: new Date(),
        },
      ],
    });
    await expect(svc.deleteAbono(PEDIDO_ID, ABONO_A)).resolves.toEqual({
      success: true,
    });
    expect(getAbonos()).toHaveLength(0);

    const other = makeService({
      reservas: [{ precio: 8000, currency: 'COP' }],
      abonos: [
        {
          _id: ABONO_B,
          pedido_id: OTHER_PEDIDO,
          amount_cop: 2000,
          created_at: new Date(),
        },
      ],
    });
    await expect(other.svc.deleteAbono(PEDIDO_ID, ABONO_B)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('pedido inexistente → 404; id inválido → 400', async () => {
    const { svc } = makeService({ pedido: null });
    await expect(svc.listAbonos(PEDIDO_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.listAbonos('no-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
