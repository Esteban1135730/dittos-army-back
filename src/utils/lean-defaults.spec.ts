import { Mongoose, Types } from 'mongoose';
import { applyLeanDefaults } from './lean-defaults';
import { ReservaSchema } from '../schema/reserva.schema';
import { ClientSchema } from '../schema/client.schema';

describe('applyLeanDefaults', () => {
  const mongoose = new Mongoose();
  const ReservaModel = mongoose.model('ReservaLeanSpec', ReservaSchema);
  const ClientModel = mongoose.model('ClientLeanSpec', ClientSchema);

  it('rellena defaults ausentes igual que un documento hidratado', () => {
    const raw = {
      _id: new Types.ObjectId(),
      client_id: 'c1',
      stock_id: 's1',
      precio: 1000,
      __v: 0,
    };
    const hydratedJson = JSON.parse(
      JSON.stringify(ReservaModel.hydrate({ ...raw })),
    );
    const [lean] = applyLeanDefaults(ReservaModel, [{ ...raw }]);
    expect(JSON.parse(JSON.stringify(lean))).toEqual(hydratedJson);
    expect(lean).toMatchObject({ currency: 'COP', quantity: 1 });
  });

  it('no pisa valores existentes', () => {
    const [lean] = applyLeanDefaults(ReservaModel, [
      {
        client_id: 'c',
        stock_id: 's',
        precio: 1,
        quantity: 3,
        currency: 'EUR',
      },
    ]);
    expect(lean.quantity).toBe(3);
    expect(lean.currency).toBe('EUR');
  });

  it('documento completo → mismo JSON que hidratado (campos fuera de schema incluidos)', () => {
    const raw = {
      _id: new Types.ObjectId(),
      nombre: 'Ana',
      metodo_contacto: 'whatsapp',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-02T00:00:00Z'),
      legacy_extra: 'x',
      __v: 0,
    };
    const hydratedJson = JSON.parse(
      JSON.stringify(ClientModel.hydrate({ ...raw })),
    );
    const [lean] = applyLeanDefaults(ClientModel, [{ ...raw }]);
    expect(JSON.parse(JSON.stringify(lean))).toEqual(hydratedJson);
  });

  it('lista vacía → []', () => {
    expect(applyLeanDefaults(ReservaModel, [])).toEqual([]);
  });
});
