import { Test } from '@nestjs/testing';
import { DashboardOverviewService } from './dashboard-overview.service';
import { StockRepository } from '../repository/stock.repository';
import { SaleRepository } from '../repository/sale.repository';
import { ClientRepository } from '../repository/client.repository';
import { ReservaRepository } from '../repository/reserva.repository';
import { ReservaIncomingRepository } from '../repository/reserva-incoming.repository';
import { IncomingBatchRepository } from '../repository/incoming-batch.repository';
import { IncomingBatchItemRepository } from '../repository/incoming-batch-item.repository';
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
  const pvpRepository = { findByCardIds: jest.fn() };

  let service: DashboardOverviewService;

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
        { provide: ReservaIncomingRepository, useValue: reservaIncomingRepository },
        { provide: IncomingBatchRepository, useValue: incomingBatchRepository },
        {
          provide: IncomingBatchItemRepository,
          useValue: incomingBatchItemRepository,
        },
        { provide: PvpRepository, useValue: pvpRepository },
      ],
    }).compile();

    service = moduleRef.get(DashboardOverviewService);
  });

  it('devuelve ceros cuando no hay documentos', async () => {
    stockRepository.findAll.mockResolvedValue([]);
    saleRepository.findActiveVentas.mockResolvedValue([]);
    saleRepository.findHistoricalVentas.mockResolvedValue([]);
    clientRepository.findAll.mockResolvedValue([]);
    reservaRepository.findAll.mockResolvedValue([]);
    reservaIncomingRepository.findAll.mockResolvedValue([]);
    incomingBatchRepository.findOpenBatches.mockResolvedValue([]);
    pvpRepository.findByCardIds.mockResolvedValue([]);

    const result = await service.getOverview();

    expect(result.stock.total_lines).toBe(0);
    expect(result.sales.active_count).toBe(0);
    expect(result.clients_reservations.clients_count).toBe(0);
    expect(result.incoming.open_batches_count).toBe(0);
    expect(result.sales.consistency_issue_count).toBe(0);
    expect(result.charts.sales_by_month).toHaveLength(6);
    expect(result.highlights.capital_engaged_cop).toBe(0);
  });

  it('agrupa ventas por mes en los últimos 6 meses', async () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    stockRepository.findAll.mockResolvedValue([]);
    saleRepository.findActiveVentas.mockResolvedValue([
      { created_at: today, amount_cop: 5000 },
    ]);
    saleRepository.findHistoricalVentas.mockResolvedValue([]);
    clientRepository.findAll.mockResolvedValue([]);
    reservaRepository.findAll.mockResolvedValue([]);
    reservaIncomingRepository.findAll.mockResolvedValue([]);
    incomingBatchRepository.findOpenBatches.mockResolvedValue([]);
    pvpRepository.findByCardIds.mockResolvedValue([]);

    const result = await service.getOverview();
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const monthRow = result.charts.sales_by_month.find((d) => d.month === monthKey);

    expect(monthRow?.count).toBe(1);
    expect(monthRow?.amount_cop).toBe(5000);
  });

  it('agrupa conteos por card_state', async () => {
    stockRepository.findAll.mockResolvedValue([
      { _id: stockId, card_id: 'c1', card_state: 'disponible', currency: 'COP', unity_cost: 1000, shipment: 0, cards_in_shipmet: 1 },
      { _id: stockId2, card_id: 'c2', card_state: 'Reserva', currency: 'COP', unity_cost: 500, shipment: 0, cards_in_shipmet: 1 },
    ]);
    saleRepository.findActiveVentas.mockResolvedValue([]);
    saleRepository.findHistoricalVentas.mockResolvedValue([]);
    clientRepository.findAll.mockResolvedValue([]);
    reservaRepository.findAll.mockResolvedValue([]);
    reservaIncomingRepository.findAll.mockResolvedValue([]);
    incomingBatchRepository.findOpenBatches.mockResolvedValue([]);
    pvpRepository.findByCardIds.mockResolvedValue([]);

    const result = await service.getOverview();

    expect(result.stock.by_state.disponible).toBe(1);
    expect(result.stock.by_state.reserva).toBe(1);
    expect(result.stock.sellable_lines).toBe(2);
    expect(result.stock.inventory_cost_cop).toBe(1500);
  });

  it('calcula ganancia de ventas activas con costo EUR', async () => {
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
    saleRepository.findHistoricalVentas.mockResolvedValue([]);
    clientRepository.findAll.mockResolvedValue([]);
    reservaRepository.findAll.mockResolvedValue([]);
    reservaIncomingRepository.findAll.mockResolvedValue([]);
    incomingBatchRepository.findOpenBatches.mockResolvedValue([]);
    pvpRepository.findByCardIds.mockResolvedValue([]);

    const result = await service.getOverview();

    expect(result.sales.active_count).toBe(1);
    expect(result.sales.active_amount_cop).toBe(15000);
    expect(result.sales.active_estimated_profit_cop).toBe(5000);
  });

  it('cuenta discrepancias de consistencia', async () => {
    stockRepository.findAll.mockResolvedValue([
      { _id: stockId, card_id: 'c1', card_state: 'vendida', currency: 'COP', unity_cost: 0, shipment: 0, cards_in_shipmet: 1 },
      { _id: stockId2, card_id: 'c2', card_state: 'disponible', currency: 'COP', unity_cost: 0, shipment: 0, cards_in_shipmet: 1 },
    ]);
    saleRepository.findActiveVentas.mockResolvedValue([
      { stock_id: stockId2, amount_cop: 1000 },
    ]);
    saleRepository.findHistoricalVentas.mockResolvedValue([]);
    clientRepository.findAll.mockResolvedValue([]);
    reservaRepository.findAll.mockResolvedValue([]);
    reservaIncomingRepository.findAll.mockResolvedValue([]);
    incomingBatchRepository.findOpenBatches.mockResolvedValue([]);
    pvpRepository.findByCardIds.mockResolvedValue([]);

    const result = await service.getOverview();

    expect(result.sales.consistency_issue_count).toBe(2);
  });

  it('reserva sin stock cuenta venta esperada y costo 0 en ganancia', async () => {
    stockRepository.findAll.mockResolvedValue([]);
    saleRepository.findActiveVentas.mockResolvedValue([]);
    saleRepository.findHistoricalVentas.mockResolvedValue([]);
    clientRepository.findAll.mockResolvedValue([]);
    reservaRepository.findAll.mockResolvedValue([
      { stock_id: 'missing', precio: 8000, currency: 'COP' },
    ]);
    reservaIncomingRepository.findAll.mockResolvedValue([]);
    incomingBatchRepository.findOpenBatches.mockResolvedValue([]);
    pvpRepository.findByCardIds.mockResolvedValue([]);

    const result = await service.getOverview();

    expect(result.clients_reservations.ventas_esperadas_cop).toBe(8000);
    expect(result.clients_reservations.ganancia_estimada_cop).toBe(8000);
  });
});
