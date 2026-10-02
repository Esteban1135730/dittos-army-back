import { Test } from '@nestjs/testing';
import { DashboardOverviewService } from './dashboard-overview.service';
import { StockRepository } from '../repository/stock.repository';
import { SaleRepository } from '../repository/sale.repository';
import { ClientRepository } from '../repository/client.repository';
import { ReservaRepository } from '../repository/reserva.repository';
import { ReservaIncomingRepository } from '../repository/reserva-incoming.repository';
import { IncomingBatchRepository } from '../repository/incoming-batch.repository';
import { IncomingBatchItemRepository } from '../repository/incoming-batch-item.repository';
import { CardtraderTransitLineRepository } from '../repository/cardtrader-transit-line.repository';
import { PvpRepository } from '../repository/pvp.repository';
import {
  BULK_CARD_ID,
  DOMICILIO_CARD_ID,
  ENVIO_CARD_ID,
  PROTECCION_CARTAS_CARD_ID,
} from '../constants/bulk-product';

const stockId = '507f1f77bcf86cd799439011';
const stockId2 = '507f1f77bcf86cd799439012';

describe('DashboardOverviewService', () => {
  const stockRepository = { findAllLean: jest.fn() };
  const saleRepository = {
    findActiveVentasLean: jest.fn(),
    findHistoricalVentasLean: jest.fn(),
  };
  const clientRepository = { countAll: jest.fn() };
  const reservaRepository = { findAllLean: jest.fn() };
  const reservaIncomingRepository = { findAllLean: jest.fn() };
  const incomingBatchRepository = { findOpenBatchIds: jest.fn() };
  const incomingBatchItemRepository = { findByBatchIdsLean: jest.fn() };
  const cardtraderTransitLineRepository = {
    findByRemainingQuantityGreaterThanZeroLean: jest.fn(),
  };
  const pvpRepository = { findByCardIds: jest.fn() };

  let service: DashboardOverviewService;

  function mockEmptyBase() {
    stockRepository.findAllLean.mockResolvedValue([]);
    saleRepository.findActiveVentasLean.mockResolvedValue([]);
    saleRepository.findHistoricalVentasLean.mockResolvedValue([]);
    clientRepository.countAll.mockResolvedValue(0);
    reservaRepository.findAllLean.mockResolvedValue([]);
    reservaIncomingRepository.findAllLean.mockResolvedValue([]);
    incomingBatchRepository.findOpenBatchIds.mockResolvedValue([]);
    incomingBatchItemRepository.findByBatchIdsLean.mockResolvedValue([]);
    cardtraderTransitLineRepository.findByRemainingQuantityGreaterThanZeroLean.mockResolvedValue(
      [],
    );
    pvpRepository.findByCardIds.mockResolvedValue([]);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.EUR_TO_COP = '5000';

    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardOverviewService,
        { provide: StockRepository, useValue: stockRepository },
        { provide: SaleRepository, useValue: saleRepository },
        { provide: ClientRepository, useValue: clientRepository },
        { provide: ReservaRepository, useValue: reservaRepository },
        {
          provide: ReservaIncomingRepository,
          useValue: reservaIncomingRepository,
        },
        { provide: IncomingBatchRepository, useValue: incomingBatchRepository },
        {
          provide: IncomingBatchItemRepository,
          useValue: incomingBatchItemRepository,
        },
        {
          provide: CardtraderTransitLineRepository,
          useValue: cardtraderTransitLineRepository,
        },
        { provide: PvpRepository, useValue: pvpRepository },
      ],
    }).compile();

    service = moduleRef.get(DashboardOverviewService);
  });

  it('devuelve ceros cuando no hay documentos', async () => {
    mockEmptyBase();

    const result = await service.getOverview();

    expect(result.stock.total_lines).toBe(0);
    expect(result.sales.active_count).toBe(0);
    expect(result.clients_reservations.clients_count).toBe(0);
    expect(result.incoming.open_batches_count).toBe(0);
    expect(result.incoming.units_in_transit).toBe(0);
    expect(result.incoming.estimated_cost_cop).toBe(0);
    expect(result.charts.sales_by_month).toHaveLength(6);
    expect(result.highlights.capital_engaged_cop).toBe(0);
  });

  it('agrupa ventas por mes en los últimos 6 meses', async () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    mockEmptyBase();
    saleRepository.findActiveVentasLean.mockResolvedValue([
      { created_at: today, amount_cop: 5000 },
    ]);

    const result = await service.getOverview();
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const monthRow = result.charts.sales_by_month.find(
      (d) => d.month === monthKey,
    );

    expect(monthRow?.count).toBe(1);
    expect(monthRow?.amount_cop).toBe(5000);
  });

  it('agrupa conteos por card_state', async () => {
    mockEmptyBase();
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: stockId,
        card_id: 'c1',
        card_state: 'disponible',
        currency: 'COP',
        unity_cost: 1000,
        shipment: 0,
        cards_in_shipmet: 1,
      },
      {
        _id: stockId2,
        card_id: 'c2',
        card_state: 'Reserva',
        currency: 'COP',
        unity_cost: 500,
        shipment: 0,
        cards_in_shipmet: 1,
      },
    ]);

    const result = await service.getOverview();

    expect(result.stock.by_state.disponible).toBe(1);
    expect(result.stock.by_state.reserva).toBe(1);
    expect(result.stock.sellable_lines).toBe(2);
    expect(result.stock.inventory_cost_cop).toBe(1500);
  });

  it('calcula ganancia de ventas activas con costo EUR', async () => {
    mockEmptyBase();
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: stockId,
        card_id: 'c1',
        card_state: 'vendida',
        currency: 'EUR',
        unity_cost: 2,
        shipment: 0,
        cards_in_shipmet: 1,
      },
    ]);
    saleRepository.findActiveVentasLean.mockResolvedValue([
      { stock_id: stockId, amount_cop: 15000 },
    ]);

    const result = await service.getOverview();

    expect(result.sales.active_count).toBe(1);
    expect(result.sales.active_amount_cop).toBe(15000);
    expect(result.sales.active_estimated_profit_cop).toBe(5000);
  });

  it('reserva sin stock cuenta venta esperada y costo 0 en ganancia', async () => {
    mockEmptyBase();
    reservaRepository.findAllLean.mockResolvedValue([
      { stock_id: 'missing', precio: 8000, currency: 'COP' },
    ]);

    const result = await service.getOverview();

    expect(result.clients_reservations.ventas_esperadas_cop).toBe(8000);
    expect(result.clients_reservations.ganancia_estimada_cop).toBe(8000);
  });

  it('domicilio conserva el precio y ganancia 100% (costo 0)', async () => {
    mockEmptyBase();
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: stockId,
        card_id: 'da-domicilio',
        card_state: 'disponible',
        currency: 'COP',
        unity_cost: 0,
        shipment: 0,
        cards_in_shipmet: 1,
      },
    ]);
    saleRepository.findActiveVentasLean.mockResolvedValue([
      { stock_id: stockId, card_id: 'da-domicilio', amount_cop: 8000 },
    ]);
    reservaRepository.findAllLean.mockResolvedValue([
      { stock_id: stockId, precio: 8000, currency: 'COP' },
    ]);

    const result = await service.getOverview();

    expect(result.sales.active_amount_cop).toBe(8000);
    expect(result.sales.active_estimated_profit_cop).toBe(8000);
    expect(result.clients_reservations.ventas_esperadas_cop).toBe(8000);
    expect(result.clients_reservations.ganancia_estimada_cop).toBe(8000);
  });

  it('envio conserva el precio y ganancia 0 en venta y reserva', async () => {
    mockEmptyBase();
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: stockId,
        card_id: 'da-envio',
        card_state: 'disponible',
        currency: 'COP',
        unity_cost: 0,
        shipment: 0,
        cards_in_shipmet: 1,
      },
    ]);
    saleRepository.findActiveVentasLean.mockResolvedValue([
      { stock_id: stockId, card_id: 'da-envio', amount_cop: 8000 },
    ]);
    reservaRepository.findAllLean.mockResolvedValue([
      { stock_id: stockId, precio: 8000, currency: 'COP' },
    ]);

    const result = await service.getOverview();

    expect(result.sales.active_amount_cop).toBe(8000);
    expect(result.sales.active_estimated_profit_cop).toBe(0);
    expect(result.clients_reservations.ventas_esperadas_cop).toBe(8000);
    expect(result.clients_reservations.ganancia_estimada_cop).toBe(0);
  });

  it('suma costo CT transit con remaining > 0 (remaining × unit_cost_cop)', async () => {
    mockEmptyBase();
    cardtraderTransitLineRepository.findByRemainingQuantityGreaterThanZeroLean.mockResolvedValue(
      [
        { remaining_quantity: 2, unit_cost_cop: 1000 },
        { remaining_quantity: 1, unit_cost_cop: 500 },
      ],
    );

    const result = await service.getOverview();

    expect(result.incoming.units_in_transit).toBe(3);
    expect(result.incoming.estimated_cost_cop).toBe(2500);
    expect(result.highlights.capital_engaged_cop).toBe(2500);
    expect(
      result.charts.money_flow.find((r) => r.key === 'transit')?.value_cop,
    ).toBe(2500);
  });

  it('no suma líneas CT con remaining 0 aunque el repo las devolviera', async () => {
    mockEmptyBase();
    cardtraderTransitLineRepository.findByRemainingQuantityGreaterThanZeroLean.mockResolvedValue(
      [
        { remaining_quantity: 2, unit_cost_cop: 1000 },
        { remaining_quantity: 0, unit_cost_cop: 99999 },
      ],
    );

    const result = await service.getOverview();

    expect(result.incoming.units_in_transit).toBe(2);
    expect(result.incoming.estimated_cost_cop).toBe(2000);
    expect(result.highlights.capital_engaged_cop).toBe(2000);
  });

  it('CT vacío deja tránsito en 0 y capital solo inventario', async () => {
    mockEmptyBase();
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: stockId,
        card_id: 'c1',
        card_state: 'disponible',
        currency: 'COP',
        unity_cost: 3000,
        shipment: 0,
        cards_in_shipmet: 1,
      },
    ]);

    const result = await service.getOverview();

    expect(result.incoming.units_in_transit).toBe(0);
    expect(result.incoming.estimated_cost_cop).toBe(0);
    expect(result.highlights.capital_engaged_cop).toBe(3000);
  });

  it('suma CT transit + incoming legacy remaining', async () => {
    mockEmptyBase();
    const batchId = '507f1f77bcf86cd799439099';
    incomingBatchRepository.findOpenBatchIds.mockResolvedValue([batchId]);
    incomingBatchItemRepository.findByBatchIdsLean.mockResolvedValue([
      { remaining_quantity: 1, unit_cost_cop: 400 },
      { remaining_quantity: 0, unit_cost_cop: 9999 },
    ]);
    cardtraderTransitLineRepository.findByRemainingQuantityGreaterThanZeroLean.mockResolvedValue(
      [{ remaining_quantity: 2, unit_cost_cop: 1000 }],
    );

    const result = await service.getOverview();

    expect(result.incoming.units_in_transit).toBe(3);
    expect(result.incoming.estimated_cost_cop).toBe(2400);
    expect(result.highlights.capital_engaged_cop).toBe(2400);
    expect(result.incoming.open_batches_count).toBe(1);
  });

  const syntheticCardIds = [
    BULK_CARD_ID,
    ENVIO_CARD_ID,
    DOMICILIO_CARD_ID,
    PROTECCION_CARTAS_CARD_ID,
  ] as const;

  it.each(syntheticCardIds)(
    'ignora stock sintético %s en KPIs de inventario y capital',
    async (syntheticId) => {
      mockEmptyBase();
      stockRepository.findAllLean.mockResolvedValue([
        {
          _id: stockId,
          card_id: 'c1',
          card_state: 'disponible',
          currency: 'COP',
          unity_cost: 3000,
          shipment: 0,
          cards_in_shipmet: 1,
          quantity: 1,
        },
        {
          _id: stockId2,
          card_id: syntheticId,
          card_state: 'disponible',
          currency: 'EUR',
          unity_cost: 14600,
          shipment: 0,
          cards_in_shipmet: 1,
          quantity: 9999,
        },
      ]);
      pvpRepository.findByCardIds.mockImplementation(async (ids: string[]) =>
        ids.flatMap((card_id) => {
          if (card_id === 'c1') {
            return [{ card_id, pvp: 8000, currency: 'COP' }];
          }
          if (card_id === syntheticId) {
            return [{ card_id, pvp: 2000, currency: 'COP' }];
          }
          return [];
        }),
      );

      const result = await service.getOverview();

      expect(result.stock.total_lines).toBe(2);
      expect(result.stock.by_state.disponible).toBe(2);
      expect(result.stock.sellable_lines).toBe(1);
      expect(result.stock.inventory_cost_cop).toBe(3000);
      expect(result.stock.inventory_pvp_cop).toBe(8000);
      expect(result.highlights.capital_engaged_cop).toBe(3000);
      expect(
        result.charts.money_flow.find((r) => r.key === 'inventory')?.value_cop,
      ).toBe(3000);
      expect(pvpRepository.findByCardIds).toHaveBeenCalledWith(['c1']);
    },
  );

  it('no suma líneas CT sintéticas en tránsito ni capital', async () => {
    mockEmptyBase();
    cardtraderTransitLineRepository.findByRemainingQuantityGreaterThanZeroLean.mockResolvedValue(
      [
        { card_id: 'sv1-1', remaining_quantity: 2, unit_cost_cop: 1000 },
        {
          card_id: BULK_CARD_ID,
          remaining_quantity: 9999,
          unit_cost_cop: 14600,
        },
        {
          card_id: ENVIO_CARD_ID,
          remaining_quantity: 1,
          unit_cost_cop: 50000,
        },
      ],
    );

    const result = await service.getOverview();

    expect(result.incoming.units_in_transit).toBe(2);
    expect(result.incoming.estimated_cost_cop).toBe(2000);
    expect(result.highlights.capital_engaged_cop).toBe(2000);
    expect(
      result.charts.money_flow.find((r) => r.key === 'transit')?.value_cop,
    ).toBe(2000);
  });

  it('no suma ítems incoming legacy sintéticos en tránsito', async () => {
    mockEmptyBase();
    const batchId = '507f1f77bcf86cd799439099';
    incomingBatchRepository.findOpenBatchIds.mockResolvedValue([batchId]);
    incomingBatchItemRepository.findByBatchIdsLean.mockResolvedValue([
      { card_id: 'c1', remaining_quantity: 1, unit_cost_cop: 400 },
      {
        card_id: DOMICILIO_CARD_ID,
        remaining_quantity: 9999,
        unit_cost_cop: 9000,
      },
      {
        card_id: PROTECCION_CARTAS_CARD_ID,
        remaining_quantity: 3,
        unit_cost_cop: 1000,
      },
    ]);

    const result = await service.getOverview();

    expect(result.incoming.units_in_transit).toBe(1);
    expect(result.incoming.estimated_cost_cop).toBe(400);
    expect(result.highlights.capital_engaged_cop).toBe(400);
  });

  it('ítems de varios lotes abiertos en una sola query $in', async () => {
    mockEmptyBase();
    incomingBatchRepository.findOpenBatchIds.mockResolvedValue(['b1', 'b2']);
    incomingBatchItemRepository.findByBatchIdsLean.mockResolvedValue([
      { card_id: 'c1', remaining_quantity: 1, unit_cost_cop: 100 },
      { card_id: 'c2', remaining_quantity: 2, unit_cost_cop: 50 },
    ]);
    clientRepository.countAll.mockResolvedValue(7);

    const result = await service.getOverview();

    expect(
      incomingBatchItemRepository.findByBatchIdsLean,
    ).toHaveBeenCalledTimes(1);
    expect(incomingBatchItemRepository.findByBatchIdsLean).toHaveBeenCalledWith(
      ['b1', 'b2'],
      expect.any(String),
    );
    expect(result.incoming.open_batches_count).toBe(2);
    expect(result.incoming.units_in_transit).toBe(3);
    expect(result.incoming.estimated_cost_cop).toBe(200);
    expect(result.clients_reservations.clients_count).toBe(7);
  });

  describe('caché por owner/TCG', () => {
    afterEach(() => jest.restoreAllMocks());

    it('reutiliza el resultado dentro del TTL y recalcula al expirar', async () => {
      mockEmptyBase();
      let now = 1_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      const a = await service.getOverview();
      const b = await service.getOverview();
      expect(b).toBe(a);
      expect(stockRepository.findAllLean).toHaveBeenCalledTimes(1);

      now += 30_001;
      await service.getOverview();
      expect(stockRepository.findAllLean).toHaveBeenCalledTimes(2);
    });

    it('owners distintos no comparten entrada', async () => {
      mockEmptyBase();
      const { runWithOwner } = await import('../owner/owner-context');
      await runWithOwner('pablo', () => service.getOverview());
      await runWithOwner('esteban', () => service.getOverview());
      await runWithOwner('pablo', () => service.getOverview());
      expect(stockRepository.findAllLean).toHaveBeenCalledTimes(2);
    });

    it('peticiones concurrentes comparten un solo cálculo', async () => {
      mockEmptyBase();
      await Promise.all([service.getOverview(), service.getOverview()]);
      expect(stockRepository.findAllLean).toHaveBeenCalledTimes(1);
    });
  });
});
