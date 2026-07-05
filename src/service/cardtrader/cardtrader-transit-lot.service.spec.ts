import { ConflictException } from '@nestjs/common';
import { CardtraderTransitLotService } from './cardtrader-transit-lot.service';

describe('CardtraderTransitLotService', () => {
  const lotRepository = {
    findByCt0PackageKey: jest.fn(),
    create: jest.fn(),
    findOpenLots: jest.fn(),
  };
  const lineRepository = {
    createMany: jest.fn(),
    findByLotId: jest.fn(),
  };
  const incomingBatchRepository = { findById: jest.fn() };
  const incomingBatchItemRepository = { findByBatchId: jest.fn() };
  const tcgDexService = { getCard: jest.fn() };

  let service: CardtraderTransitLotService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CardtraderTransitLotService(
      lotRepository as any,
      lineRepository as any,
      incomingBatchRepository as any,
      incomingBatchItemRepository as any,
      tcgDexService as any,
    );
  });

  it('rechaza ct0_package_key duplicado', async () => {
    lotRepository.findByCt0PackageKey.mockResolvedValue({ _id: 'existing' });

    await expect(
      service.createLot({
        items: [
          {
            card_id: 'sv1-1',
            language: 'en',
            quantity: 1,
            fx_total_lot: 1,
          },
        ],
        total_cop_cards_cost: 5000,
        purchase_date: '2026-06-01',
        ct0_package_key: 'pkg-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('crea lote sin legacy usando COP / FX del body', async () => {
    lotRepository.findByCt0PackageKey.mockResolvedValue(null);
    lotRepository.create.mockResolvedValue({ _id: { toString: () => 'lot-1' } });
    lineRepository.createMany.mockResolvedValue([]);

    const result = await service.createLot({
      items: [
        {
          card_id: 'sv1-1',
          language: 'en',
          quantity: 2,
          fx_total_lot: 4,
          card_name: 'Pikachu',
        },
      ],
      total_cop_cards_cost: 20000,
      purchase_date: '2026-06-01',
      cards_cost_currency: 'USD',
    });

    expect(result.lot_id).toBe('lot-1');
    expect(lotRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        total_fx_cards_cost: 4,
        total_cop_cards_cost: 20000,
        real_fx_rate_cop: 5000,
        cards_cost_currency: 'USD',
      }),
    );
    expect(lineRepository.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          lot_id: 'lot-1',
          remaining_quantity: 2,
          unit_cost_cop: 10000,
        }),
      ]),
    );
  });
});
