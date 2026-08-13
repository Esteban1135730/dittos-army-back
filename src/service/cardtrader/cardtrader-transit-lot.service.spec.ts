import { BadRequestException, ConflictException } from '@nestjs/common';
import { CardtraderTransitLotService } from './cardtrader-transit-lot.service';

describe('CardtraderTransitLotService', () => {
  const lotRepository = {
    findByCt0PackageKey: jest.fn(),
    create: jest.fn(),
    findOpenLots: jest.fn(),
    findById: jest.fn(),
    backfillMissingOwner: jest.fn(),
    updateById: jest.fn(),
  };
  const lineRepository = {
    createMany: jest.fn(),
    findByLotId: jest.fn(),
    findByCt0ItemIds: jest.fn(),
    setNotArrivedAtIfUnset: jest.fn(),
    findById: jest.fn(),
    updateUnitCostByLotId: jest.fn(),
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
        owner: 'pablo',
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

  it('crea lote complementos con costos de carta en 0', async () => {
    lotRepository.findByCt0PackageKey.mockResolvedValue(null);
    lotRepository.create.mockResolvedValue({ _id: { toString: () => 'lot-comp' } });
    lineRepository.createMany.mockResolvedValue([]);
    tcgDexService.getCard.mockResolvedValue({
      name: 'Poké Pad',
      image: 'https://example.com/x.png',
    });

    const result = await service.createLot({
      items: [
        {
          card_id: 'me03-081',
          language: 'es',
          quantity: 1,
          fx_total_lot: 0,
          card_name: 'Poké Pad',
          ct0_item_id: 107022473,
        },
      ],
      total_cop_cards_cost: 0,
      purchase_date: '2026-07-28',
      source: 'complementos',
      ct0_package_key: 'complementos:107022473',
    });

    expect(result.lot_id).toBe('lot-comp');
    expect(lotRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'complementos',
        total_fx_cards_cost: 0,
        total_cop_cards_cost: 0,
        real_fx_rate_cop: 0,
        registered_items_fx_subtotal: 0,
      }),
    );
    expect(lineRepository.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          lot_id: 'lot-comp',
          fx_total_lot: 0,
          fx_unit_price: 0,
          unit_cost_cop: 0,
          remaining_quantity: 1,
        }),
      ]),
    );
  });

  it('sin owner en create persiste pablo', async () => {
    lotRepository.findByCt0PackageKey.mockResolvedValue(null);
    lotRepository.create.mockResolvedValue({ _id: { toString: () => 'lot-def' } });
    lineRepository.createMany.mockResolvedValue([]);

    await service.createLot({
      items: [
        {
          card_id: 'sv1-1',
          language: 'en',
          quantity: 1,
          fx_total_lot: 2,
        },
      ],
      total_cop_cards_cost: 10000,
      purchase_date: '2026-06-01',
    });

    expect(lotRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'pablo' }),
    );
  });

  it('owner esteban se persiste en create', async () => {
    lotRepository.findByCt0PackageKey.mockResolvedValue(null);
    lotRepository.create.mockResolvedValue({ _id: { toString: () => 'lot-est' } });
    lineRepository.createMany.mockResolvedValue([]);

    await service.createLot({
      items: [
        {
          card_id: 'sv1-1',
          language: 'en',
          quantity: 1,
          fx_total_lot: 2,
        },
      ],
      total_cop_cards_cost: 10000,
      purchase_date: '2026-06-01',
      owner: 'esteban',
    });

    expect(lotRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'esteban' }),
    );
  });

  it('owner inválido en create lanza BadRequestException', async () => {
    await expect(
      service.createLot({
        items: [
          {
            card_id: 'sv1-1',
            language: 'en',
            quantity: 1,
            fx_total_lot: 2,
          },
        ],
        total_cop_cards_cost: 10000,
        purchase_date: '2026-06-01',
        owner: 'otro' as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(lotRepository.create).not.toHaveBeenCalled();
  });

  it('listOpenLots incluye owner y hace fallback a pablo', async () => {
    lotRepository.backfillMissingOwner.mockResolvedValue(1);
    lotRepository.findOpenLots.mockResolvedValue([
      {
        _id: { toString: () => 'lot-old' },
        status: 'open',
        source: 'ct0',
        purchase_date: new Date('2026-06-01'),
        created_at: new Date('2026-06-01'),
        total_fx_cards_cost: 4,
        total_cop_cards_cost: 20000,
        cards_cost_currency: 'USD',
      },
      {
        _id: { toString: () => 'lot-est' },
        status: 'open',
        source: 'ct0',
        purchase_date: new Date('2026-06-02'),
        created_at: new Date('2026-06-02'),
        total_fx_cards_cost: 1,
        total_cop_cards_cost: 5000,
        cards_cost_currency: 'USD',
        owner: 'esteban',
      },
    ]);
    lineRepository.findByLotId.mockResolvedValue([]);

    const rows = await service.listOpenLots();

    expect(lotRepository.backfillMissingOwner).toHaveBeenCalled();
    expect(rows[0].owner).toBe('pablo');
    expect(rows[1].owner).toBe('esteban');
  });

  it('getLot incluye owner con fallback pablo', async () => {
    lotRepository.findById.mockResolvedValue({
      _id: { toString: () => 'lot-1' },
      status: 'open',
      source: 'ct0',
      purchase_date: new Date('2026-06-01'),
      created_at: new Date('2026-06-01'),
      total_fx_cards_cost: 4,
      total_cop_cards_cost: 20000,
      real_fx_rate_cop: 5000,
      cards_cost_currency: 'USD',
    });
    lineRepository.findByLotId.mockResolvedValue([]);

    const lot = await service.getLot('lot-1');
    expect(lot.owner).toBe('pablo');
    expect(lot.owner_editable).toBe(true);
  });

  it('getLot owner_editable true si todas las líneas están intactas', async () => {
    lotRepository.findById.mockResolvedValue({
      _id: { toString: () => 'lot-1' },
      status: 'open',
      source: 'ct0',
      purchase_date: new Date('2026-06-01'),
      created_at: new Date('2026-06-01'),
      total_fx_cards_cost: 4,
      total_cop_cards_cost: 20000,
      real_fx_rate_cop: 5000,
      cards_cost_currency: 'USD',
      owner: 'esteban',
    });
    lineRepository.findByLotId.mockResolvedValue([
      { remaining_quantity: 2, quantity_ordered: 2 },
      { remaining_quantity: 1, quantity_ordered: 1 },
    ]);

    const lot = await service.getLot('lot-1');
    expect(lot.owner).toBe('esteban');
    expect(lot.owner_editable).toBe(true);
  });

  it('getLot owner_editable false si alguna línea decrementó', async () => {
    lotRepository.findById.mockResolvedValue({
      _id: { toString: () => 'lot-1' },
      status: 'open',
      source: 'ct0',
      purchase_date: new Date('2026-06-01'),
      created_at: new Date('2026-06-01'),
      total_fx_cards_cost: 4,
      total_cop_cards_cost: 20000,
      real_fx_rate_cop: 5000,
      cards_cost_currency: 'USD',
      owner: 'pablo',
    });
    lineRepository.findByLotId.mockResolvedValue([
      { remaining_quantity: 1, quantity_ordered: 2 },
    ]);

    const lot = await service.getLot('lot-1');
    expect(lot.owner_editable).toBe(false);
  });

  it('updateLot persiste owner esteban si las líneas están intactas', async () => {
    lotRepository.findById.mockResolvedValue({
      _id: { toString: () => 'lot-1' },
      owner: 'pablo',
      total_fx_cards_cost: 4,
    });
    lineRepository.findByLotId.mockResolvedValue([
      { remaining_quantity: 2, quantity_ordered: 2 },
    ]);
    lotRepository.updateById.mockResolvedValue({});

    const result = await service.updateLot('lot-1', { owner: 'esteban' });

    expect(result).toEqual({ success: true });
    expect(lotRepository.updateById).toHaveBeenCalledWith(
      'lot-1',
      expect.objectContaining({ owner: 'esteban' }),
    );
  });

  it('updateLot 409 si alguna línea ya decrementó y no persiste owner', async () => {
    lotRepository.findById.mockResolvedValue({
      _id: { toString: () => 'lot-1' },
      owner: 'pablo',
      total_fx_cards_cost: 4,
    });
    lineRepository.findByLotId.mockResolvedValue([
      { remaining_quantity: 1, quantity_ordered: 2 },
    ]);

    await expect(
      service.updateLot('lot-1', { owner: 'esteban' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(lotRepository.updateById).not.toHaveBeenCalled();
  });

  it('updateLot owner inválido lanza BadRequestException', async () => {
    await expect(
      service.updateLot('lot-1', { owner: 'otro' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(lotRepository.updateById).not.toHaveBeenCalled();
  });

  it('rechaza lote ct0 con COP 0', async () => {
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
        total_cop_cards_cost: 0,
        purchase_date: '2026-07-28',
        source: 'ct0',
      }),
    ).rejects.toThrow(/mayor a 0/);
  });

  it('rechaza complementos con fx_total_lot > 0', async () => {
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
        total_cop_cards_cost: 0,
        purchase_date: '2026-07-28',
        source: 'complementos',
      }),
    ).rejects.toThrow(/fx_total_lot = 0/);
  });

  it('marca líneas no llegadas por ct0_item_id sin tocar remaining', async () => {
    lotRepository.findOpenLots.mockResolvedValue([
      { _id: { toString: () => 'lot-open' } },
    ]);
    const line = {
      _id: { toString: () => 'line-1' },
      lot_id: 'lot-open',
      ct0_item_id: 95921482,
      remaining_quantity: 1,
      not_arrived_at: undefined,
    };
    lineRepository.findByCt0ItemIds.mockResolvedValue([line]);
    lineRepository.setNotArrivedAtIfUnset.mockResolvedValue({
      ...line,
      not_arrived_at: new Date('2026-07-29T12:00:00.000Z'),
    });
    lineRepository.findById.mockResolvedValue(null);

    const result = await service.markNotArrived({ ct0_item_ids: [95921482, 1] });

    expect(result.marked).toEqual([
      { ct0_item_id: 95921482, transit_line_id: 'line-1' },
    ]);
    expect(result.not_found).toEqual([1]);
    expect(result.already_marked).toEqual([]);
    expect(lineRepository.setNotArrivedAtIfUnset).toHaveBeenCalledWith(
      'line-1',
      expect.any(Date),
    );
  });

  it('markNotArrived es idempotente si ya marcada', async () => {
    lotRepository.findOpenLots.mockResolvedValue([
      { _id: { toString: () => 'lot-open' } },
    ]);
    const at = new Date('2026-07-01T00:00:00.000Z');
    lineRepository.findByCt0ItemIds.mockResolvedValue([
      {
        _id: { toString: () => 'line-1' },
        lot_id: 'lot-open',
        ct0_item_id: 10,
        remaining_quantity: 2,
        not_arrived_at: at,
      },
    ]);
    lineRepository.setNotArrivedAtIfUnset.mockClear();

    const result = await service.markNotArrived({ ct0_item_ids: [10] });

    expect(result.already_marked).toEqual([
      { ct0_item_id: 10, transit_line_id: 'line-1' },
    ]);
    expect(result.marked).toEqual([]);
    expect(lineRepository.setNotArrivedAtIfUnset).not.toHaveBeenCalled();
  });

  it('listOpenCatalogLines excluye not_arrived_at', async () => {
    lotRepository.findOpenLots.mockResolvedValue([
      {
        _id: { toString: () => 'lot-1' },
        purchase_date: new Date('2026-07-01'),
      },
    ]);
    lineRepository.findByLotId.mockResolvedValue([
      {
        _id: { toString: () => 'a' },
        card_id: 'x-1',
        card_name: 'Ok',
        image_url: '',
        language: 'en',
        rareza: null,
        remaining_quantity: 1,
        unit_cost_cop: 100,
        created_at: new Date('2026-07-01'),
      },
      {
        _id: { toString: () => 'b' },
        card_id: 'x-2',
        card_name: 'Missing',
        image_url: '',
        language: 'en',
        rareza: null,
        remaining_quantity: 1,
        unit_cost_cop: 100,
        not_arrived_at: new Date('2026-07-29'),
        created_at: new Date('2026-07-02'),
      },
    ]);

    const rows = await service.listOpenCatalogLines();
    expect(rows).toHaveLength(1);
    expect(rows[0].transit_line_id).toBe('a');
  });

  it('rechaza markNotArrived con body vacío', async () => {
    await expect(service.markNotArrived({ ct0_item_ids: [] })).rejects.toThrow(
      /ct0_item_ids/,
    );
  });
});
