import { StoreWhatsAppIncomingImportService } from './store-whatsapp-incoming-import.service';
import { ClientRepository } from '../repository/client.repository';
import { PvpRepository } from '../repository/pvp.repository';
import { IncomingReservationService } from './incoming-reservation.service';

const sampleMessage = [
  'Hola, quiero reservar / me interesan estas cartas de la sección Próximamente:',
  '',
  '- Pikipek | ID: me05-066 | Expansión: Pitch Black (#066) | Idioma: Inglés x2 (7 en camino)',
  '- Trumbeak | ID: me05-067 | Expansión: Pitch Black (#067) | Idioma: Inglés x2 (9 en camino)',
  '',
  'A nombre de: Julian Pabon',
].join('\n');

describe('StoreWhatsAppIncomingImportService', () => {
  function makeService(opts?: {
    variants?: Record<
      string,
      Array<{
        rareza: string | null;
        cupo: number;
        card_name: string;
        image_url: string;
        language: string;
      }>
    >;
    pvps?: Array<{
      card_id: string;
      pvp: number;
      currency: string;
      rareza?: string | null;
    }>;
  }) {
    const variants = opts?.variants ?? {
      'me05-066': [
        {
          rareza: null,
          cupo: 7,
          card_name: 'Pikipek',
          image_url: '',
          language: 'en',
        },
      ],
      'me05-067': [
        {
          rareza: null,
          cupo: 9,
          card_name: 'Trumbeak',
          image_url: '',
          language: 'en',
        },
      ],
    };
    const incomingReservationService = {
      listVariantCupos: jest.fn(
        async (cardId: string) => variants[cardId] ?? [],
      ),
      addQuantityByCardVariant: jest.fn().mockResolvedValue({}),
    };
    const pvpRepository = {
      findByCardIds: jest.fn().mockResolvedValue(opts?.pvps ?? []),
      update: jest.fn().mockResolvedValue({}),
    };
    const clientRepository = {
      findById: jest.fn().mockResolvedValue({ _id: 'c1', nombre: 'Julian' }),
    };
    const svc = new StoreWhatsAppIncomingImportService(
      clientRepository as unknown as ClientRepository,
      pvpRepository as unknown as PvpRepository,
      incomingReservationService as unknown as IncomingReservationService,
    );
    return { svc, incomingReservationService, pvpRepository };
  }

  it('preview reserva cantidades y PVP sugerido', async () => {
    const { svc } = makeService({
      pvps: [{ card_id: 'me05-066', pvp: 4000, currency: 'COP', rareza: null }],
    });
    const plan = await svc.preview('c1', sampleMessage);
    expect(plan.client_name_from_message).toBe('Julian Pabon');
    expect(plan.summary.units_reserved).toBe(4);
    expect(plan.lines[0].matched).toBe(2);
    expect(plan.lines[0].suggested_pvp_cop).toBe(4000);
    expect(plan.lines[1].issues).toContain('no_pvp');
  });

  it('importa reservas y guarda PVP opcional', async () => {
    const { svc, incomingReservationService, pvpRepository } = makeService();
    const result = await svc.import('c1', sampleMessage, [
      { index: 0, pvp_cop: 4500 },
    ]);
    expect(
      incomingReservationService.addQuantityByCardVariant,
    ).toHaveBeenCalledTimes(2);
    expect(
      incomingReservationService.addQuantityByCardVariant,
    ).toHaveBeenCalledWith('c1', 'me05-066', 'en', null, 2, 4500);
    expect(pvpRepository.update).toHaveBeenCalledTimes(1);
    expect(pvpRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        card_id: 'me05-066',
        pvp: 4500,
        currency: 'COP',
      }),
    );
    expect(result.created).toHaveLength(2);
    expect(result.pvp_saved).toBe(1);
  });

  it('usa el Precio del mensaje como PVP sugerido y lo guarda en la reserva', async () => {
    const message = [
      'Hola, quiero reservar / me interesan estas cartas de la sección Próximamente:',
      '',
      '- Pikipek | ID: me05-066 | Expansión: Pitch Black (#066) | Idioma: Inglés | Precio: $ 4.000 c/u ($ 8.000 en esta línea) x2 (7 en camino)',
      '',
      'A nombre de: Julian Pabon',
    ].join('\n');
    const { svc, incomingReservationService } = makeService();
    const plan = await svc.preview('c1', message);
    expect(plan.lines[0].suggested_pvp_cop).toBe(4000);
    expect(plan.lines[0].issues).not.toContain('no_pvp');

    await svc.import('c1', message, []);
    expect(
      incomingReservationService.addQuantityByCardVariant,
    ).toHaveBeenCalledWith('c1', 'me05-066', 'en', null, 2, 4000);
  });

  it('no reserva si no hay cupo en camino', async () => {
    const { svc, incomingReservationService } = makeService({
      variants: { 'me05-066': [], 'me05-067': [] },
    });
    const result = await svc.import('c1', sampleMessage, []);
    expect(
      incomingReservationService.addQuantityByCardVariant,
    ).not.toHaveBeenCalled();
    expect(result.created).toHaveLength(0);
    expect(
      result.lines.every((l) => l.issues.includes('insufficient_incoming')),
    ).toBe(true);
  });
});
