import { BadRequestException } from '@nestjs/common';
import { IncomingHomologService } from './incoming-homolog.service';

describe('IncomingHomologService.createTanda (CT path)', () => {
  const sessionId = 'sess-1';

  const sessionRepo = {
    findById: jest.fn(),
    markConverted: jest.fn(),
  };

  const novedadStockRepo = {
    findPendingBySession: jest.fn(),
    findInStockBySession: jest.fn(),
  };

  const transitLineRepo = {
    findByRemainingQuantityGreaterThanZero: jest.fn(),
    decrementRemainingQuantity: jest.fn(),
  };

  const stockRepo = {
    createMany: jest.fn(),
  };

  const tcgdexService = {
    getCard: jest.fn(),
  };

  const incomingReservationService = {
    materializeForNewStockLines: jest.fn(),
  };

  function makeService() {
    return new IncomingHomologService(
      {} as any,
      {} as any,
      sessionRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      novedadStockRepo as any,
      stockRepo as any,
      {} as any,
      {} as any,
      tcgdexService as any,
      transitLineRepo as any,
      {} as any,
      incomingReservationService as any,
    );
  }

  function baseSession(overrides: Record<string, unknown> = {}) {
    return {
      _id: { toString: () => sessionId },
      status: 'ready',
      units: [
        {
          sent_unit_key: 'u1',
          status: 'verified',
          transit_line_id: 'tl-1',
        },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    sessionRepo.findById.mockResolvedValue(baseSession());
    sessionRepo.markConverted.mockResolvedValue({});
    novedadStockRepo.findPendingBySession.mockResolvedValue([]);
    novedadStockRepo.findInStockBySession.mockResolvedValue([
      { sent_unit_key: 'u2' },
    ]);
    transitLineRepo.findByRemainingQuantityGreaterThanZero.mockResolvedValue([
      {
        _id: { toString: () => 'tl-1' },
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        image_url: 'http://img',
        language: 'EN',
        rareza: 'common',
        remaining_quantity: 2,
      },
    ]);
    transitLineRepo.decrementRemainingQuantity.mockResolvedValue(undefined);
    stockRepo.createMany.mockResolvedValue([{ _id: 'stock-1' }]);
    incomingReservationService.materializeForNewStockLines.mockResolvedValue(
      undefined,
    );
    tcgdexService.getCard.mockResolvedValue({
      id: 'sv1-1',
      name: 'Pikachu',
      image: 'http://localhost:3000/card-images/sv1/sv1-1.png',
      images: {
        small: 'https://assets.tcgdex.net/en/sv/sv1/1/low.png',
        large: 'https://assets.tcgdex.net/en/sv/sv1/1/high.png',
      },
    });
  });

  it('crea stock disponible con card_id de la línea transit y materializa reservas', async () => {
    const service = makeService();
    const result = await service.createTanda(sessionId, {
      shipping_total_cop: 10000,
      cards: [
        {
          sent_unit_key: 'u1',
          transit_line_id: 'tl-1',
          purchase_price_eur: 1.5,
          unit_cost_cop: 5000,
        },
      ],
    });

    expect(stockRepo.createMany).toHaveBeenCalledTimes(1);
    const dtos = stockRepo.createMany.mock.calls[0][0];
    expect(dtos).toHaveLength(1);
    expect(dtos[0]).toMatchObject({
      card_id: 'sv1-1',
      card_name: 'Pikachu',
      card_state: 'disponible',
      image_url: 'https://assets.tcgdex.net/en/sv/sv1/1/low.png',
      unity_cost: 5000,
      shipment: 10000,
      cards_in_shipmet: 1,
      currency: 'COP',
      incoming_notes: '[recepción CT homolog]',
    });
    expect(tcgdexService.getCard).toHaveBeenCalled();

    expect(
      incomingReservationService.materializeForNewStockLines,
    ).toHaveBeenCalledWith([{ _id: 'stock-1' }], ['tl-1']);

    expect(sessionRepo.markConverted).toHaveBeenCalledWith(
      sessionId,
      null,
      10000,
      ['stock-1'],
    );

    expect(result).toMatchObject({
      round_id: null,
      transit_reception: true,
      stock_created: 1,
      stock_ids: ['stock-1'],
    });
  });

  it('lanza BadRequestException si la línea transit no tiene card_id', async () => {
    transitLineRepo.findByRemainingQuantityGreaterThanZero.mockResolvedValue([
      {
        _id: { toString: () => 'tl-1' },
        card_id: '   ',
        card_name: 'Pikachu',
        language: 'en',
        remaining_quantity: 1,
      },
    ]);

    const service = makeService();
    await expect(
      service.createTanda(sessionId, {
        shipping_total_cop: 10000,
        cards: [
          {
            sent_unit_key: 'u1',
            transit_line_id: 'tl-1',
            purchase_price_eur: 1.5,
            unit_cost_cop: 5000,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(stockRepo.createMany).not.toHaveBeenCalled();
    expect(sessionRepo.markConverted).not.toHaveBeenCalled();
  });

  it('excluye is_novedad de createMany', async () => {
    sessionRepo.findById.mockResolvedValue(
      baseSession({
        units: [
          {
            sent_unit_key: 'u1',
            status: 'verified',
            transit_line_id: 'tl-1',
          },
          {
            sent_unit_key: 'u2',
            status: 'novedad',
            transit_line_id: null,
          },
        ],
      }),
    );

    const service = makeService();
    await service.createTanda(sessionId, {
      shipping_total_cop: 10000,
      cards: [
        {
          sent_unit_key: 'u1',
          transit_line_id: 'tl-1',
          purchase_price_eur: 1.5,
          unit_cost_cop: 5000,
        },
        {
          sent_unit_key: 'u2',
          transit_line_id: '',
          purchase_price_eur: 1,
          unit_cost_cop: 0,
          is_novedad: true,
          novedad_notes: 'faltante',
        },
      ],
    });

    expect(stockRepo.createMany).toHaveBeenCalledTimes(1);
    const dtos = stockRepo.createMany.mock.calls[0][0];
    expect(dtos).toHaveLength(1);
    expect(dtos[0].card_id).toBe('sv1-1');
    expect(sessionRepo.markConverted).toHaveBeenCalledWith(
      sessionId,
      null,
      10000,
      ['stock-1'],
    );
  });

  it('sesión solo novedad marca convertida sin crear stock', async () => {
    sessionRepo.findById.mockResolvedValue(
      baseSession({
        units: [
          {
            sent_unit_key: 'u2',
            status: 'novedad',
            transit_line_id: null,
          },
        ],
      }),
    );

    const service = makeService();
    const result = await service.createTanda(sessionId, {
      shipping_total_cop: 10000,
      cards: [
        {
          sent_unit_key: 'u2',
          transit_line_id: '',
          purchase_price_eur: 1,
          unit_cost_cop: 0,
          is_novedad: true,
        },
      ],
    });

    expect(stockRepo.createMany).not.toHaveBeenCalled();
    expect(
      incomingReservationService.materializeForNewStockLines,
    ).not.toHaveBeenCalled();
    expect(sessionRepo.markConverted).toHaveBeenCalledWith(
      sessionId,
      null,
      10000,
      [],
    );
    expect(result).toMatchObject({
      round_id: null,
      stock_created: 0,
      stock_ids: [],
    });
  });
});
