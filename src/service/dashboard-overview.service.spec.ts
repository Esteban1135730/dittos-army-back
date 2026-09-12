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

const stockId = '507f1f77bcf86cd799439011';
const stockId2 = '507f1f77bcf86cd799439012';

describe('DashboardOverviewService', () => {
  const stockRepository = { findAll: jest.fn() };
  const saleRepository = {
    findActiveVentas: jest.fn(),
    findHistoricalVentas: jest.fn(),
  };
  const clientRepository = { findAll: jest.fn() };
  const reservaRepository = { findAll: jest.fn() };
  const reservaIncomingRepository = { findAll: jest.fn() };
  const incomingBatchRepository = { findOpenBatches: jest.fn() };
  const incomingBatchItemRepository = { findByBatchId: jest.fn() };
  const cardtraderTransitLineRepository = {
    findByRemainingQuantityGreaterThanZero: jest.fn(),
  };
  const pvpRepository = { findByCardIds: jest.fn() };

  let service: DashboardOverviewService;

  function mockEmptyBase() {
    stockRepository.findAll.mockResolvedValue([]);
    saleRepository.findActiveVentas.mockResolvedValue([]);
    saleRepository.findHistoricalVentas.mockResolvedValue([]);
    clientRepository.findAll.mockResolvedValue([]);
    reservaRepository.findAll.mockResolvedValue([]);
    reservaIncomingRepository.findAll.mockResolvedValue([]);
    incomingBatchRepository.findOpenBatches.mockResolvedValue([]);
    cardtraderTransitLineRepository.findByRemainingQuantityGreaterThanZero.mockResolvedValue(
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
    saleRepository.findActiveVentas.mockResolvedValue([
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
    stockRepository.findAll.mockResolvedValue([
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
    stockRepository.findAll.mockResolvedValue([
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
    saleRepository.findActiveVentas.mockResolvedValue([
      { stock_id: stockId, amount_cop: 15000 },
    ]);

    const result = await service.getOverview();

    expect(result.sales.active_count).toBe(1);
    expect(result.sales.active_amount_cop).toBe(15000);
    expect(result.sales.active_estimated_profit_cop).toBe(5000);
  });

  it('reserva sin stock cuenta venta esperada y costo 0 en ganancia', async () => {
    mockEmptyBase();
    reservaRepository.findAll.mockResolvedValue([
      { stock_id: 'missing', precio: 8000, currency: 'COP' },
    ]);

    const result = await service.getOverview();

    expect(result.clients_reservations.ventas_esperadas_cop).toBe(8000);
    expect(result.clients_reservations.ganancia_estimada_cop).toBe(8000);
  });

  it('domicilio conserva el precio y ganancia 100% (costo 0)', async () => {
    mockEmptyBase();
    stockRepository.findAll.mockResolvedValue([
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
    saleRepository.findActiveVentas.mockResolvedValue([
      { stock_id: stockId, card_id: 'da-domicilio', amount_cop: 8000 },
    ]);
    reservaRepository.findAll.mockResolvedValue([
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
    stockRepository.findAll.mockResolvedValue([
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
    saleRepository.findActiveVentas.mockResolvedValue([
      { stock_id: stockId, card_id: 'da-envio', amount_cop: 8000 },
    ]);
    reservaRepository.findAll.mockResolvedValue([
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
    cardtraderTransitLineRepository.findByRemainingQuantityGreaterThanZero.mockResolvedValue(
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
    cardtraderTransitLineRepository.findByRemainingQuantityGreaterThanZero.mockResolvedValue(
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
    stockRepository.findAll.mockResolvedValue([
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
    incomingBatchRepository.findOpenBatches.mockResolvedValue([
      { _id: batchId },
    ]);
    incomingBatchItemRepository.findByBatchId.mockResolvedValue([
      { remaining_quantity: 1, unit_cost_cop: 400 },
      { remaining_quantity: 0, unit_cost_cop: 9999 },
    ]);
    cardtraderTransitLineRepository.findByRemainingQuantityGreaterThanZero.mockResolvedValue(
      [{ remaining_quantity: 2, unit_cost_cop: 1000 }],
    );

    const result = await service.getOverview();

    expect(result.incoming.units_in_transit).toBe(3);
    expect(result.incoming.estimated_cost_cop).toBe(2400);
    expect(result.highlights.capital_engaged_cop).toBe(2400);
    expect(result.incoming.open_batches_count).toBe(1);
  });
});
