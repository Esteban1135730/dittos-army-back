import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IncomingReservationAbonoService } from './incoming-reservation-abono.service';
import { ReservaIncomingRepository } from '../repository/reserva-incoming.repository';
import { ReservaIncomingAbonoRepository } from '../repository/reserva-incoming-abono.repository';

const CLIENT_A = '69ffb0da7b2101b0d20fdc6b';
const CLIENT_B = '69ffb0da7b2101b0d20fdc6c';
const ABONO_A = '507f1f77bcf86cd799439011';
const ABONO_B = '507f1f77bcf86cd799439012';

type Line = { precio_cop?: number | null; quantity?: number };
type AbonoDoc = {
  _id: string;
  client_id: string;
  amount_cop: number;
  created_at: Date;
};

describe('IncomingReservationAbonoService', () => {
  function makeService(opts: { lines: Line[]; abonos?: AbonoDoc[] }) {
    let abonos = [...(opts.abonos ?? [])];
    const incomingRepo = {
      findAll: jest.fn().mockResolvedValue(opts.lines),
    } as unknown as ReservaIncomingRepository;

    const abonoRepo = {
      findByClientId: jest.fn().mockImplementation(() => abonos),
      create: jest
        .fn()
        .mockImplementation((clientId: string, amount: number) => {
          const doc: AbonoDoc = {
            _id: 'new-abono',
            client_id: clientId,
            amount_cop: amount,
            created_at: new Date('2026-08-31T12:00:00.000Z'),
          };
          abonos = [doc, ...abonos];
          return doc;
        }),
      findById: jest.fn().mockImplementation((id: string) => {
        return abonos.find((a) => a._id === id) ?? null;
      }),
      deleteById: jest.fn().mockImplementation((id: string) => {
        const before = abonos.length;
        abonos = abonos.filter((a) => a._id !== id);
        return abonos.length < before;
      }),
    } as unknown as ReservaIncomingAbonoRepository;

    const svc = new IncomingReservationAbonoService(incomingRepo, abonoRepo);
    return { svc, incomingRepo, abonoRepo, getAbonos: () => abonos };
  }

  describe('totales PVP', () => {
    it('suma solo líneas con PVP > 0 y respeta quantity > 1; sin PVP no entra', async () => {
      const { svc } = makeService({
        lines: [
          { precio_cop: 4000, quantity: 2 },
          { precio_cop: null, quantity: 3 },
          { precio_cop: 0, quantity: 5 },
          { precio_cop: 1500 },
          { precio_cop: 2000, quantity: 0 },
        ],
      });
      const res = await svc.listAbonos(CLIENT_A);
      // 4000*2 + 1500*1 (quantity ausente) + 2000*1 (quantity 0 inválido → 1)
      expect(res.total_pvp_cop).toBe(8000 + 1500 + 2000);
      expect(res.abonado_cop).toBe(0);
      expect(res.saldo_cop).toBe(11500);
      expect(res.abonos).toEqual([]);
    });
  });

  describe('POST addAbono', () => {
    it('registra un abono dentro del saldo y recalcula', async () => {
      const { svc } = makeService({
        lines: [{ precio_cop: 10000, quantity: 1 }],
      });
      const res = await svc.addAbono(CLIENT_A, 3000);
      expect(res.abonado_cop).toBe(3000);
      expect(res.saldo_cop).toBe(7000);
      expect(res.total_pvp_cop).toBe(10000);
      expect(res.abonos).toHaveLength(1);
      expect(res.abonos[0].amount_cop).toBe(3000);
    });

    it('rechaza un abono mayor que el saldo', async () => {
      const { svc } = makeService({
        lines: [{ precio_cop: 5000, quantity: 1 }],
        abonos: [
          {
            _id: ABONO_A,
            client_id: CLIENT_A,
            amount_cop: 2000,
            created_at: new Date(),
          },
        ],
      });
      await expect(svc.addAbono(CLIENT_A, 4000)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(svc.addAbono(CLIENT_A, 4000)).rejects.toThrow(
        'El abono supera el saldo',
      );
    });

    it('rechaza POST cuando el saldo es 0', async () => {
      const { svc } = makeService({
        lines: [
          { precio_cop: null, quantity: 2 },
          { precio_cop: 0, quantity: 1 },
        ],
      });
      await expect(svc.addAbono(CLIENT_A, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(svc.addAbono(CLIENT_A, 1)).rejects.toThrow(
        'No hay saldo para abonar',
      );
    });

    it('rechaza POST sin líneas incoming con 409', async () => {
      const { svc } = makeService({ lines: [] });
      await expect(svc.addAbono(CLIENT_A, 1000)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(svc.addAbono(CLIENT_A, 1000)).rejects.toThrow(
        'El cliente no tiene reserva en camino',
      );
    });

    it('rechaza amount_cop no entero ≥ 1', async () => {
      const { svc } = makeService({
        lines: [{ precio_cop: 5000, quantity: 1 }],
      });
      await expect(svc.addAbono(CLIENT_A, 0)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(svc.addAbono(CLIENT_A, 1.5)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(svc.addAbono(CLIENT_A, -10)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('GET listAbonos', () => {
    it('lanza 409 si el cliente no tiene reserva en camino', async () => {
      const { svc } = makeService({ lines: [] });
      await expect(svc.listAbonos(CLIENT_A)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('DELETE deleteAbono', () => {
    it('borra un abono propio', async () => {
      const { svc, getAbonos } = makeService({
        lines: [{ precio_cop: 8000, quantity: 1 }],
        abonos: [
          {
            _id: ABONO_A,
            client_id: CLIENT_A,
            amount_cop: 2000,
            created_at: new Date(),
          },
        ],
      });
      await expect(svc.deleteAbono(CLIENT_A, ABONO_A)).resolves.toEqual({
        success: true,
      });
      expect(getAbonos()).toHaveLength(0);
    });

    it('devuelve 404 si el abono es de otro cliente', async () => {
      const { svc } = makeService({
        lines: [{ precio_cop: 8000, quantity: 1 }],
        abonos: [
          {
            _id: ABONO_B,
            client_id: CLIENT_B,
            amount_cop: 2000,
            created_at: new Date(),
          },
        ],
      });
      await expect(svc.deleteAbono(CLIENT_A, ABONO_B)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('devuelve 404 si el abono no existe', async () => {
      const { svc } = makeService({
        lines: [{ precio_cop: 8000, quantity: 1 }],
      });
      await expect(svc.deleteAbono(CLIENT_A, ABONO_A)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('permite borrar un abono propio aunque ya no haya líneas incoming', async () => {
      const { svc } = makeService({
        lines: [],
        abonos: [
          {
            _id: ABONO_A,
            client_id: CLIENT_A,
            amount_cop: 1500,
            created_at: new Date(),
          },
        ],
      });
      await expect(svc.deleteAbono(CLIENT_A, ABONO_A)).resolves.toEqual({
        success: true,
      });
    });
  });

  describe('recálculo tras bajar PVP', () => {
    it('deja saldo negativo y un POST posterior falla', async () => {
      const abonos: AbonoDoc[] = [
        {
          _id: ABONO_A,
          client_id: CLIENT_A,
          amount_cop: 8000,
          created_at: new Date(),
        },
      ];
      const highPvp = makeService({
        lines: [{ precio_cop: 10000, quantity: 1 }],
        abonos,
      });
      const before = await highPvp.svc.listAbonos(CLIENT_A);
      expect(before.saldo_cop).toBe(2000);

      const afterDrop = makeService({
        lines: [{ precio_cop: 3000, quantity: 1 }],
        abonos,
      });
      const after = await afterDrop.svc.listAbonos(CLIENT_A);
      expect(after.total_pvp_cop).toBe(3000);
      expect(after.abonado_cop).toBe(8000);
      expect(after.saldo_cop).toBe(-5000);

      await expect(afterDrop.svc.addAbono(CLIENT_A, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(afterDrop.svc.addAbono(CLIENT_A, 1)).rejects.toThrow(
        'No hay saldo para abonar',
      );
    });
  });
});
