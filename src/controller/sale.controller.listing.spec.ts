import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { SaleController } from './sale.controller';
import { SaleRepository } from 'src/repository/sale.repository';
import { ClientRepository } from 'src/repository/client.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { TCGDexService } from 'src/pokemon';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';
import { StockCardImagesSyncService } from 'src/service/stock-card-images-sync.service';
import { SaleBatchService } from 'src/service/sale-batch.service';

const stockA = new Types.ObjectId('507f1f77bcf86cd7994390a1');
const stockB = new Types.ObjectId('507f1f77bcf86cd7994390b2');
const missingStock = '507f1f77bcf86cd7994390c3';
const clientId = '507f1f77bcf86cd7994390d4';

function sale(
  id: string,
  stockId: string,
  cardId: string,
  amount: number,
  extra: Record<string, unknown> = {},
) {
  return {
    _id: new Types.ObjectId(id),
    stock_id: stockId,
    card_id: cardId,
    type: 'venta' as const,
    amount_cop: amount,
    notes: '',
    created_at: new Date('2026-09-01T10:00:00Z'),
    ...extra,
  };
}

describe('SaleController listados (batch de stock + TCGdex deduplicado)', () => {
  let controller: SaleController;
  let saleRepository: Record<string, jest.Mock>;
  let stockRepository: Record<string, jest.Mock>;
  let tcgDexService: { getCard: jest.Mock };

  const stocks = [
    {
      _id: stockA,
      card_id: 'sv1-1',
      card_name: '',
      image_url: '',
      currency: 'COP',
      language: 'es',
      shipment: 100,
      cards_in_shipmet: 2,
      unity_cost: 1000,
    },
    {
      _id: stockB,
      card_id: 'sv1-1',
      card_name: 'Pikachu DB',
      image_url: '',
      currency: 'EUR',
      languaje: 'en',
      shipment: 0,
      cards_in_shipmet: 1,
      unity_cost: 5,
    },
  ];

  beforeEach(async () => {
    saleRepository = {
      findActiveVentasLean: jest.fn(),
      findHistoricalVentasLean: jest.fn(),
      findVentasByClientIdLean: jest.fn(),
    };
    stockRepository = {
      findById: jest.fn(),
      findByIdsLean: jest.fn().mockResolvedValue(stocks),
    };
    tcgDexService = {
      getCard: jest.fn().mockResolvedValue({
        name: 'Pikachu TCG',
        images: { small: 'https://img/sv1-1.png' },
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SaleController],
      providers: [
        { provide: SaleRepository, useValue: saleRepository },
        {
          provide: ClientRepository,
          useValue: {
            findById: jest.fn().mockResolvedValue({ _id: clientId }),
          },
        },
        { provide: StockRepository, useValue: stockRepository },
        { provide: ReservaRepository, useValue: {} },
        { provide: TCGDexService, useValue: tcgDexService },
        { provide: CardStockTagRepository, useValue: {} },
        { provide: StockCardImagesSyncService, useValue: {} },
        { provide: SaleBatchService, useValue: {} },
      ],
    }).compile();
    controller = moduleRef.get(SaleController);
  });

  it('dashboard: una query de stock, sin findById, TCGdex una vez por card_id; mismo shape y orden', async () => {
    saleRepository.findActiveVentasLean.mockResolvedValue([
      sale('607f1f77bcf86cd799439001', String(stockA), 'sv1-1', 5000),
      sale('607f1f77bcf86cd799439002', missingStock, 'sv1-9', 1),
      sale('607f1f77bcf86cd799439003', String(stockB), 'sv1-1', 7000),
    ]);

    const rows = await controller.getSalesDashboard();

    expect(stockRepository.findById).not.toHaveBeenCalled();
    expect(stockRepository.findByIdsLean).toHaveBeenCalledTimes(1);
    expect(stockRepository.findByIdsLean).toHaveBeenCalledWith([
      String(stockA),
      missingStock,
      String(stockB),
    ]);
    expect(tcgDexService.getCard).toHaveBeenCalledTimes(1);
    expect(tcgDexService.getCard).toHaveBeenCalledWith('sv1-1');
    expect(rows).toEqual([
      {
        _id: '607f1f77bcf86cd799439001',
        stock_id: String(stockA),
        card_id: 'sv1-1',
        type: 'venta',
        amount_cop: 5000,
        notes: '',
        created_at: new Date('2026-09-01T10:00:00Z'),
        stock_info: {
          card_name: 'Pikachu TCG',
          image_url: 'https://img/sv1-1.png',
          card_cost: 1050,
          currency: 'COP',
          shipment: 100,
          cards_in_shipmet: 2,
          unity_cost: 1000,
        },
      },
      {
        _id: '607f1f77bcf86cd799439003',
        stock_id: String(stockB),
        card_id: 'sv1-1',
        type: 'venta',
        amount_cop: 7000,
        notes: '',
        created_at: new Date('2026-09-01T10:00:00Z'),
        stock_info: {
          card_name: 'Pikachu DB',
          image_url: 'https://img/sv1-1.png',
          card_cost: 5,
          currency: 'EUR',
          shipment: 0,
          cards_in_shipmet: 1,
          unity_cost: 5,
        },
      },
    ]);
  });

  it('dashboard: no llama TCGdex si el stock ya trae nombre e imagen', async () => {
    stockRepository.findByIdsLean.mockResolvedValue([
      { ...stocks[0], card_name: 'X', image_url: 'https://x' },
    ]);
    saleRepository.findActiveVentasLean.mockResolvedValue([
      sale('607f1f77bcf86cd799439001', String(stockA), 'sv1-1', 1),
    ]);
    const rows = await controller.getSalesDashboard();
    expect(tcgDexService.getCard).not.toHaveBeenCalled();
    expect(rows[0].stock_info.card_name).toBe('X');
  });

  it('history: incluye cycle_closed_at y language (language ?? languaje)', async () => {
    const closed = new Date('2026-09-10T00:00:00Z');
    saleRepository.findHistoricalVentasLean.mockResolvedValue([
      sale('607f1f77bcf86cd799439001', String(stockA), 'sv1-1', 1, {
        cycle_closed_at: closed,
      }),
      sale('607f1f77bcf86cd799439003', String(stockB), 'sv1-1', 2),
    ]);
    const rows = await controller.getSalesHistory();
    expect(rows.map((r) => r.cycle_closed_at)).toEqual([closed, null]);
    expect(rows.map((r) => r.stock_info.language)).toEqual(['es', 'en']);
    expect(stockRepository.findById).not.toHaveBeenCalled();
    expect(tcgDexService.getCard).toHaveBeenCalledTimes(1);
  });

  it('by-client: conserva filas sin stock, dedupe TCGdex y errores TCGdex no rompen', async () => {
    tcgDexService.getCard.mockImplementation(async (id: string) => {
      if (id === 'sv1-9') throw new Error('down');
      return {
        name: 'Pikachu TCG',
        images: { small: 'https://img/sv1-1.png' },
      };
    });
    saleRepository.findVentasByClientIdLean.mockResolvedValue([
      sale('607f1f77bcf86cd799439001', String(stockA), 'sv1-1', 1, {
        client_id: clientId,
      }),
      sale('607f1f77bcf86cd799439002', missingStock, 'sv1-9', 2, {
        client_id: clientId,
      }),
      sale('607f1f77bcf86cd799439003', String(stockB), 'sv1-1', 3, {
        client_id: clientId,
      }),
    ]);

    const rows = (await controller.listVentasByCliente(clientId)) as Array<
      Record<string, unknown>
    >;

    expect(saleRepository.findVentasByClientIdLean).toHaveBeenCalledWith(
      clientId,
      { limit: 50 },
    );
    expect(stockRepository.findById).not.toHaveBeenCalled();
    expect(stockRepository.findByIdsLean).toHaveBeenCalledTimes(1);
    expect(tcgDexService.getCard).toHaveBeenCalledTimes(2);
    expect(rows.map((r) => r._id)).toEqual([
      '607f1f77bcf86cd799439001',
      '607f1f77bcf86cd799439002',
      '607f1f77bcf86cd799439003',
    ]);
    expect(rows[0]).toEqual({
      _id: '607f1f77bcf86cd799439001',
      stock_id: String(stockA),
      card_id: 'sv1-1',
      card_name: 'Pikachu TCG',
      image_url: 'https://img/sv1-1.png',
      type: 'venta',
      amount_cop: 1,
      notes: '',
      created_at: new Date('2026-09-01T10:00:00Z'),
      cycle_closed_at: null,
      client_id: clientId,
    });
    expect(rows[1]).toMatchObject({
      card_id: 'sv1-9',
      card_name: undefined,
      image_url: undefined,
    });
    expect(rows[2]).toMatchObject({
      card_name: 'Pikachu DB',
      image_url: 'https://img/sv1-1.png',
    });
  });
});
