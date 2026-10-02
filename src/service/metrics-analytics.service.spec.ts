import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CardStockTagRepository } from '../repository/card-stock-tag.repository';
import { PvpRepository } from '../repository/pvp.repository';
import { SaleRepository } from '../repository/sale.repository';
import { StockRepository } from '../repository/stock.repository';
import {
  DEAD_STOCK_MIN_COST_COP,
  defaultMetricsPeriod,
  MetricsAnalyticsService,
} from './metrics-analytics.service';

const stockId1 = '507f1f77bcf86cd799439011';
const stockId2 = '507f1f77bcf86cd799439012';
const stockId3 = '507f1f77bcf86cd799439013';

describe('MetricsAnalyticsService', () => {
  const saleRepository = { findVentasInPeriodLean: jest.fn() };
  const stockRepository = { findAllLean: jest.fn() };
  const cardStockTagRepository = { findMapByCardIds: jest.fn() };
  const pvpRepository = { findByCardIds: jest.fn() };
  let service: MetricsAnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.EUR_TO_COP = '5000';
    cardStockTagRepository.findMapByCardIds.mockResolvedValue(new Map());
    pvpRepository.findByCardIds.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MetricsAnalyticsService,
        { provide: SaleRepository, useValue: saleRepository },
        { provide: StockRepository, useValue: stockRepository },
        {
          provide: CardStockTagRepository,
          useValue: cardStockTagRepository,
        },
        { provide: PvpRepository, useValue: pvpRepository },
      ],
    }).compile();

    service = moduleRef.get(MetricsAnalyticsService);
  });

  it('usa periodo default de ~3 meses cuando no hay query', async () => {
    saleRepository.findVentasInPeriodLean.mockResolvedValue([]);
    stockRepository.findAllLean.mockResolvedValue([]);

    const res = await service.getAnalytics({});
    const expected = defaultMetricsPeriod();
    expect(res.period).toEqual(expected);
    expect(saleRepository.findVentasInPeriodLean).toHaveBeenCalled();
  });

  it('from > to → 400', async () => {
    await expect(
      service.getAnalytics({ from: '2026-06-01', to: '2026-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fecha inválida → 400', async () => {
    await expect(
      service.getAnalytics({ from: 'no-fecha', to: '2026-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cachea por owner + periodo y no cachea errores', async () => {
    saleRepository.findVentasInPeriodLean.mockResolvedValue([]);
    stockRepository.findAllLean.mockRejectedValueOnce(new Error('db down'));
    stockRepository.findAllLean.mockResolvedValue([]);
    const period = { from: '2026-01-01', to: '2026-01-31' };

    await expect(service.getAnalytics(period)).rejects.toThrow('db down');
    const a = await service.getAnalytics(period);
    const b = await service.getAnalytics({ ...period });
    expect(b).toBe(a);
    expect(stockRepository.findAllLean).toHaveBeenCalledTimes(2);

    await service.getAnalytics({ from: '2026-01-01', to: '2026-02-01' });
    expect(stockRepository.findAllLean).toHaveBeenCalledTimes(3);

    const { runWithOwner } = await import('../owner/owner-context');
    await runWithOwner('esteban', () => service.getAnalytics(period));
    expect(stockRepository.findAllLean).toHaveBeenCalledTimes(4);
  });

  it('invalidateCache fuerza recálculo de todos los owners y periodos', async () => {
    saleRepository.findVentasInPeriodLean.mockResolvedValue([]);
    stockRepository.findAllLean.mockResolvedValue([]);
    const period = { from: '2026-01-01', to: '2026-01-31' };
    const { runWithOwner } = await import('../owner/owner-context');

    await service.getAnalytics(period);
    await runWithOwner('esteban', () => service.getAnalytics(period));
    expect(stockRepository.findAllLean).toHaveBeenCalledTimes(2);

    service.invalidateCache();
    await service.getAnalytics(period);
    await runWithOwner('esteban', () => service.getAnalytics(period));
    expect(stockRepository.findAllLean).toHaveBeenCalledTimes(4);
  });

  it('summary con snapshot vs fallback de costo', async () => {
    saleRepository.findVentasInPeriodLean.mockResolvedValue([
      {
        stock_id: stockId1,
        card_id: 'c1',
        type: 'venta',
        amount_cop: 100000,
        cost_cop_snapshot: 40000,
        created_at: new Date('2026-05-10T12:00:00.000Z'),
      },
      {
        stock_id: stockId2,
        card_id: 'c2',
        type: 'venta',
        amount_cop: 50000,
        created_at: new Date('2026-05-11T12:00:00.000Z'),
      },
    ]);
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: { toString: () => stockId1 },
        card_id: 'c1',
        card_name: 'Card A',
        card_state: 'vendida',
        shipment: 0,
        unity_cost: 0,
        cards_in_shipmet: 1,
        currency: 'COP',
      },
      {
        _id: { toString: () => stockId2 },
        card_id: 'c2',
        card_name: 'Card B',
        card_state: 'vendida',
        shipment: 100,
        unity_cost: 10,
        cards_in_shipmet: 10,
        currency: 'COP',
      },
    ]);

    const res = await service.getAnalytics({
      from: '2026-05-01',
      to: '2026-05-31',
    });

    expect(res.summary.units_sold).toBe(2);
    expect(res.summary.revenue_cop).toBe(150000);
    // snapshot 40000 + fallback (100/10+10)=20
    expect(res.summary.cost_cop).toBe(40020);
    expect(res.summary.cost_data_quality).toEqual({
      with_snapshot: 1,
      with_fallback: 1,
    });
    expect(res.summary.gross_profit_cop).toBe(150000 - 40020);
    expect(res.summary.aov_cop).toBe(75000);
  });

  it('envio conserva revenue y fuerza ganancia 0 aunque el snapshot de costo sea 0', async () => {
    saleRepository.findVentasInPeriodLean.mockResolvedValue([
      {
        stock_id: stockId1,
        card_id: 'da-envio',
        type: 'venta',
        amount_cop: 8000,
        cost_cop_snapshot: 0,
        created_at: new Date('2026-05-10T12:00:00.000Z'),
      },
    ]);
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: { toString: () => stockId1 },
        card_id: 'da-envio',
        card_name: 'envio',
        card_state: 'disponible',
        shipment: 0,
        unity_cost: 0,
        cards_in_shipmet: 1,
        currency: 'COP',
        product_kind: 'quantity',
      },
    ]);

    const res = await service.getAnalytics({
      from: '2026-05-01',
      to: '2026-05-31',
    });

    expect(res.summary.revenue_cop).toBe(8000);
    expect(res.summary.cost_cop).toBe(8000);
    expect(res.summary.gross_profit_cop).toBe(0);
  });

  it('top sellers ordenado por units', async () => {
    saleRepository.findVentasInPeriodLean.mockResolvedValue([
      {
        stock_id: stockId1,
        card_id: 'alpha',
        amount_cop: 1000,
        cost_cop_snapshot: 100,
        created_at: new Date('2026-05-01T00:00:00.000Z'),
      },
      {
        stock_id: stockId1,
        card_id: 'alpha',
        amount_cop: 1000,
        cost_cop_snapshot: 100,
        created_at: new Date('2026-05-02T00:00:00.000Z'),
      },
      {
        stock_id: stockId2,
        card_id: 'beta',
        amount_cop: 5000,
        cost_cop_snapshot: 100,
        created_at: new Date('2026-05-03T00:00:00.000Z'),
      },
    ]);
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: { toString: () => stockId1 },
        card_id: 'alpha',
        card_name: 'Alpha',
        image_url: 'https://example.com/alpha.png',
        card_state: 'vendida',
        shipment: 0,
        unity_cost: 0,
        cards_in_shipmet: 1,
        currency: 'COP',
      },
      {
        _id: { toString: () => stockId2 },
        card_id: 'beta',
        card_name: 'Beta',
        image_url: 'https://example.com/beta.png',
        card_state: 'vendida',
        shipment: 0,
        unity_cost: 0,
        cards_in_shipmet: 1,
        currency: 'COP',
      },
    ]);

    const res = await service.getAnalytics({
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(res.top_sellers_by_units[0].card_id).toBe('alpha');
    expect(res.top_sellers_by_units[0].units).toBe(2);
    expect(res.top_sellers_by_units[0].image_url).toBe(
      'https://example.com/alpha.png',
    );
    expect(res.top_sellers_by_revenue[0].card_id).toBe('beta');
    expect(res.top_sellers_by_revenue[0].image_url).toBe(
      'https://example.com/beta.png',
    );
  });

  it('sales_by_day agrupa por día UTC', async () => {
    saleRepository.findVentasInPeriodLean.mockResolvedValue([
      {
        stock_id: stockId1,
        card_id: 'c1',
        amount_cop: 1000,
        cost_cop_snapshot: 100,
        created_at: new Date('2026-05-10T23:00:00.000Z'),
      },
      {
        stock_id: stockId1,
        card_id: 'c1',
        amount_cop: 2000,
        cost_cop_snapshot: 200,
        created_at: new Date('2026-05-10T01:00:00.000Z'),
      },
      {
        stock_id: stockId1,
        card_id: 'c1',
        amount_cop: 3000,
        cost_cop_snapshot: 300,
        created_at: new Date('2026-05-11T12:00:00.000Z'),
      },
    ]);
    stockRepository.findAllLean.mockResolvedValue([]);

    const res = await service.getAnalytics({
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(res.sales_by_day).toEqual([
      { date: '2026-05-10', units: 2, revenue_cop: 3000, profit_cop: 2700 },
      { date: '2026-05-11', units: 1, revenue_cop: 3000, profit_cop: 2700 },
    ]);
  });

  it('sales_by_cycle separa active vs cerrado', async () => {
    const closed = new Date('2026-04-01T15:00:00.000Z');
    saleRepository.findVentasInPeriodLean.mockResolvedValue([
      {
        stock_id: stockId1,
        card_id: 'c1',
        amount_cop: 1000,
        cost_cop_snapshot: 0,
        created_at: new Date('2026-05-01T00:00:00.000Z'),
      },
      {
        stock_id: stockId2,
        card_id: 'c2',
        amount_cop: 2000,
        cost_cop_snapshot: 0,
        created_at: new Date('2026-05-02T00:00:00.000Z'),
        cycle_closed_at: closed,
      },
    ]);
    stockRepository.findAllLean.mockResolvedValue([]);

    const res = await service.getAnalytics({
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(res.sales_by_cycle.some((c) => c.cycle_key === 'active')).toBe(true);
    expect(
      res.sales_by_cycle.some(
        (c) => c.cycle_closed_at === closed.toISOString(),
      ),
    ).toBe(true);
  });

  it('periodo sin ventas → ceros / listas vacías', async () => {
    saleRepository.findVentasInPeriodLean.mockResolvedValue([]);
    stockRepository.findAllLean.mockResolvedValue([]);
    const res = await service.getAnalytics({
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(res.summary.units_sold).toBe(0);
    expect(res.top_sellers_by_units).toEqual([]);
    expect(res.sales_by_day).toEqual([]);
  });

  it('incluye cartas a replantear por antigüedad, capital, sin ventas y PVP', async () => {
    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 120);
    const mid = new Date();
    mid.setUTCDate(mid.getUTCDate() - 50);
    saleRepository.findVentasInPeriodLean.mockResolvedValue([]);
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: { toString: () => stockId3 },
        card_id: 'dead',
        card_name: 'Dead Card',
        image_url: 'https://example.com/dead.png',
        card_state: 'disponible',
        shipment: 0,
        unity_cost: DEAD_STOCK_MIN_COST_COP,
        cards_in_shipmet: 1,
        currency: 'COP',
        stocked_at: old,
      },
      {
        _id: { toString: () => stockId1 },
        card_id: 'low-margin',
        card_name: 'Low Margin',
        card_state: 'disponible',
        shipment: 0,
        unity_cost: 9000,
        cards_in_shipmet: 1,
        currency: 'COP',
        stocked_at: mid,
      },
    ]);
    pvpRepository.findByCardIds.mockResolvedValue([
      {
        card_id: 'low-margin',
        pvp: 9500,
        currency: 'COP',
        rareza: null,
      },
    ]);

    const res = await service.getAnalytics({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(res.dead_stock.lines_count).toBeGreaterThanOrEqual(2);
    expect(res.dead_stock.cards_count).toBeGreaterThanOrEqual(2);
    const dead = res.dead_stock.items.find((i) => i.card_id === 'dead');
    expect(dead?.priority).toBe('alta');
    expect(dead?.stock_lines).toBe(1);
    expect(dead?.reason_codes).toEqual(
      expect.arrayContaining([
        'mucho_tiempo_90d',
        'capital_alto',
        'sin_ventas_periodo',
      ]),
    );
    // Orden: más días primero
    expect(res.dead_stock.items[0].card_id).toBe('dead');
    const low = res.dead_stock.items.find((i) => i.card_id === 'low-margin');
    expect(low?.reason_codes).toEqual(
      expect.arrayContaining(['margen_pvp_bajo', 'sin_ventas_periodo']),
    );
    expect(res.kpis.sell_through_approximate).toBe(true);
  });

  it('no alerta unidad restante si el mismo tipo se vendió bien en el periodo', async () => {
    const soldReceived = new Date('2026-04-01T00:00:00.000Z');
    const soldAt = new Date('2026-04-08T00:00:00.000Z'); // ~7 días
    const remaining = new Date();
    remaining.setUTCDate(remaining.getUTCDate() - 25);
    const sidSold1 = '507f1f77bcf86cd799439021';
    const sidSold2 = '507f1f77bcf86cd799439022';
    const sidSold3 = '507f1f77bcf86cd799439023';
    const sidRest = '507f1f77bcf86cd799439024';

    saleRepository.findVentasInPeriodLean.mockResolvedValue([
      {
        stock_id: sidSold1,
        card_id: 'hot',
        amount_cop: 12000,
        cost_cop_snapshot: 5000,
        created_at: soldAt,
        received_at_snapshot: soldReceived,
      },
      {
        stock_id: sidSold2,
        card_id: 'hot',
        amount_cop: 12000,
        cost_cop_snapshot: 5000,
        created_at: soldAt,
        received_at_snapshot: soldReceived,
      },
      {
        stock_id: sidSold3,
        card_id: 'hot',
        amount_cop: 12000,
        cost_cop_snapshot: 5000,
        created_at: soldAt,
        received_at_snapshot: soldReceived,
      },
    ]);
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: { toString: () => sidRest },
        card_id: 'hot',
        card_name: 'Hot Card',
        card_state: 'disponible',
        shipment: 0,
        unity_cost: 8000,
        cards_in_shipmet: 1,
        currency: 'COP',
        stocked_at: remaining,
      },
    ]);
    pvpRepository.findByCardIds.mockResolvedValue([
      { card_id: 'hot', pvp: 15000, currency: 'COP', rareza: null },
    ]);

    const res = await service.getAnalytics({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(
      res.dead_stock.items.find((i) => i.card_id === 'hot'),
    ).toBeUndefined();
  });

  it('sí alerta unidad outlier vs mediana de venta del mismo tipo', async () => {
    const soldReceived = new Date('2026-04-01T00:00:00.000Z');
    const soldAt = new Date('2026-04-08T00:00:00.000Z'); // mediana ~7d
    const remaining = new Date();
    remaining.setUTCDate(remaining.getUTCDate() - 100); // > max(14, 7+30)=37
    const sidSold1 = '507f1f77bcf86cd799439031';
    const sidSold2 = '507f1f77bcf86cd799439032';
    const sidRest = '507f1f77bcf86cd799439033';

    saleRepository.findVentasInPeriodLean.mockResolvedValue([
      {
        stock_id: sidSold1,
        card_id: 'slow-unit',
        amount_cop: 12000,
        cost_cop_snapshot: 5000,
        created_at: soldAt,
        received_at_snapshot: soldReceived,
      },
      {
        stock_id: sidSold2,
        card_id: 'slow-unit',
        amount_cop: 12000,
        cost_cop_snapshot: 5000,
        created_at: soldAt,
        received_at_snapshot: soldReceived,
      },
    ]);
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: { toString: () => sidRest },
        card_id: 'slow-unit',
        card_name: 'Slow Unit',
        card_state: 'disponible',
        shipment: 0,
        unity_cost: 8000,
        cards_in_shipmet: 1,
        currency: 'COP',
        stocked_at: remaining,
      },
    ]);
    pvpRepository.findByCardIds.mockResolvedValue([
      { card_id: 'slow-unit', pvp: 15000, currency: 'COP', rareza: null },
    ]);

    const res = await service.getAnalytics({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    const item = res.dead_stock.items.find((i) => i.card_id === 'slow-unit');
    expect(item).toBeDefined();
    expect(item?.reason_codes).toEqual(
      expect.arrayContaining(['unidad_lenta_vs_tipo', 'tipo_se_vende_bien']),
    );
    expect(item?.type_median_days_to_sell).toBeCloseTo(7, 0);
  });

  it('sí alerta si vendió poco relativo a muchas unidades estancadas del tipo', async () => {
    const mid = new Date();
    mid.setUTCDate(mid.getUTCDate() - 50);
    const soldReceived = new Date('2026-04-01T00:00:00.000Z');
    const soldAt = new Date('2026-04-20T00:00:00.000Z');
    const ids = [
      '507f1f77bcf86cd799439041',
      '507f1f77bcf86cd799439042',
      '507f1f77bcf86cd799439043',
      '507f1f77bcf86cd799439044',
      '507f1f77bcf86cd799439045',
    ];

    saleRepository.findVentasInPeriodLean.mockResolvedValue([
      {
        stock_id: ids[0],
        card_id: 'pile',
        amount_cop: 10000,
        cost_cop_snapshot: 4000,
        created_at: soldAt,
        received_at_snapshot: soldReceived,
      },
      {
        stock_id: ids[1],
        card_id: 'pile',
        amount_cop: 10000,
        cost_cop_snapshot: 4000,
        created_at: soldAt,
        received_at_snapshot: soldReceived,
      },
    ]);
    // 2 vendidas + 3 estancadas → 40% vendidas / 60% estancadas
    stockRepository.findAllLean.mockResolvedValue(
      [ids[2], ids[3], ids[4]].map((id, n) => ({
        _id: { toString: () => id },
        card_id: 'pile',
        card_name: 'Pile Card',
        card_state: 'disponible',
        shipment: 0,
        unity_cost: 8000,
        cards_in_shipmet: 1,
        currency: 'COP',
        stocked_at: mid,
      })),
    );
    pvpRepository.findByCardIds.mockResolvedValue([
      { card_id: 'pile', pvp: 15000, currency: 'COP', rareza: null },
    ]);

    const res = await service.getAnalytics({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    const item = res.dead_stock.items.find((i) => i.card_id === 'pile');
    expect(item).toBeDefined();
    expect(item?.type_sell_through_pct).toBe(40);
    expect(item?.type_stuck_pct).toBe(60);
    expect(item?.type_remaining_units).toBe(3);
    expect(item?.reason_codes).toEqual(
      expect.arrayContaining(['mucho_stock_estancado']),
    );
  });

  it('vintage es más laxo en umbrales de tiempo', async () => {
    const mid = new Date();
    mid.setUTCDate(mid.getUTCDate() - 50); // 50d: alerta normal, no vintage
    saleRepository.findVentasInPeriodLean.mockResolvedValue([]);
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: { toString: () => stockId1 },
        card_id: 'vint',
        card_name: 'Vintage Slow',
        card_state: 'disponible',
        shipment: 0,
        unity_cost: 8000,
        cards_in_shipmet: 1,
        currency: 'COP',
        stocked_at: mid,
      },
    ]);
    cardStockTagRepository.findMapByCardIds.mockResolvedValue(
      new Map([['vint', ['vintage']]]),
    );

    const res = await service.getAnalytics({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    // 50 días + capital medio: vintage no entra a la tabla por rotación (<1 año)
    const vint = res.dead_stock.items.find((i) => i.card_id === 'vint');
    expect(vint).toBeUndefined();
  });

  it('vintage no entra por rotación aunque lleve ~200 días', async () => {
    const mid = new Date();
    mid.setUTCDate(mid.getUTCDate() - 200);
    saleRepository.findVentasInPeriodLean.mockResolvedValue([]);
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: { toString: () => stockId1 },
        card_id: 'vint2',
        card_name: 'Vintage Year',
        card_state: 'disponible',
        shipment: 0,
        unity_cost: 25000,
        cards_in_shipmet: 1,
        currency: 'COP',
        stocked_at: mid,
      },
    ]);
    cardStockTagRepository.findMapByCardIds.mockResolvedValue(
      new Map([['vint2', ['vintage']]]),
    );

    const res = await service.getAnalytics({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(
      res.dead_stock.items.find((i) => i.card_id === 'vint2'),
    ).toBeUndefined();
  });

  it('agrega ventas por tag (jugable/vintage/…) y ObjectId como recepción parcial', async () => {
    saleRepository.findVentasInPeriodLean.mockResolvedValue([
      {
        stock_id: stockId1,
        card_id: 'alpha',
        amount_cop: 10000,
        cost_cop_snapshot: 2000,
        created_at: new Date('2026-05-20T12:00:00.000Z'),
      },
      {
        stock_id: stockId2,
        card_id: 'beta',
        amount_cop: 5000,
        cost_cop_snapshot: 1000,
        created_at: new Date('2026-05-21T12:00:00.000Z'),
        tags_snapshot: ['brillo'],
        received_at_snapshot: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]);
    stockRepository.findAllLean.mockResolvedValue([
      {
        _id: stockId1,
        card_id: 'alpha',
        card_name: 'Alpha',
        card_state: 'vendida',
        shipment: 0,
        unity_cost: 0,
        cards_in_shipmet: 1,
        currency: 'COP',
      },
      {
        _id: stockId2,
        card_id: 'beta',
        card_name: 'Beta',
        card_state: 'vendida',
        shipment: 0,
        unity_cost: 0,
        cards_in_shipmet: 1,
        currency: 'COP',
        stocked_at: new Date('2026-04-01T00:00:00.000Z'),
      },
    ]);
    cardStockTagRepository.findMapByCardIds.mockResolvedValue(
      new Map([['alpha', ['jugable', 'vintage']]]),
    );

    const res = await service.getAnalytics({
      from: '2026-05-01',
      to: '2026-05-31',
    });

    const byTag = Object.fromEntries(res.sales_by_tag.map((t) => [t.tag, t]));
    expect(byTag.jugable.units).toBe(1);
    expect(byTag.vintage.units).toBe(1);
    expect(byTag.brillo.units).toBe(1);
    expect(byTag.bulk.units).toBe(0);
    expect(res.summary.timing_data_quality.with_sale_created_at).toBe(2);
    expect(res.summary.timing_data_quality.reception_from_objectid).toBe(1);
    expect(res.summary.timing_data_quality.reception_from_snapshot).toBe(1);
    expect(res.summary.timing_data_quality.tags_from_snapshot).toBe(1);
    expect(res.summary.timing_data_quality.tags_from_card_map).toBe(1);
  });
});
