import { PedidoService } from './pedido.service';
import { PedidoRepository } from '../repository/pedido.repository';
import { PedidoAbonoRepository } from '../repository/pedido-abono.repository';
import { ClientRepository } from '../repository/client.repository';
import { ReservaRepository } from '../repository/reserva.repository';
import { StockRepository } from '../repository/stock.repository';
import { SaleRepository } from '../repository/sale.repository';
import { CardStockTagRepository } from '../repository/card-stock-tag.repository';
import { PedidoDocument } from '../schema/pedido.schema';
import { runWithOwnerAsync } from 'src/owner/owner-context';

const CLIENT_ID = '507f1f77bcf86cd799439011';
const PEDIDO_ID = '507f1f77bcf86cd799439012';
const PABLO_STOCK = '507f1f77bcf86cd799439013';
const ESTEBAN_STOCK = '507f1f77bcf86cd799439022';

function makePedido(overrides: Record<string, unknown> = {}): PedidoDocument {
  return {
    _id: PEDIDO_ID,
    client_id: CLIENT_ID,
    status: 'reservado',
    entrega_en_tienda: true,
    store_id: 'valhalla',
    store_name: 'Valhalla',
    store_address: 'Cl. 150 #16-56',
    fecha_tentativa_entrega: new Date(Date.UTC(2026, 7, 20)),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as unknown as PedidoDocument;
}

describe('PedidoService multi-owner (044)', () => {
  function makeService() {
    const saleOwners: string[] = [];
    const stateOwners: string[] = [];

    const pedidoRepo = {
      findById: jest.fn(async () => makePedido()),
      update: jest.fn(async (_id, data) => makePedido(data)),
      deleteById: jest.fn(async () => true),
      findReservadoByClientId: jest.fn(async () => makePedido()),
    } as unknown as PedidoRepository;

    const clientRepo = {
      findById: jest.fn(async () => ({ _id: CLIENT_ID, nombre: 'Ana' })),
    } as unknown as ClientRepository;

    const reservaRepo = {
      findByPedidoId: jest.fn(async () => [
        {
          _id: 'res-p',
          stock_id: PABLO_STOCK,
          precio: 10000,
          currency: 'COP',
          stock_owner: 'pablo',
        },
        {
          _id: 'res-e',
          stock_id: ESTEBAN_STOCK,
          precio: 8000,
          currency: 'COP',
          stock_owner: 'esteban',
        },
      ]),
      attachOrphansToPedido: jest.fn(async () => 0),
      deleteById: jest.fn(async () => true),
      deleteByStockId: jest.fn(async () => true),
    } as unknown as ReservaRepository;

    const stockRepo = {
      findById: jest.fn(async (id: string) => {
        const { getCurrentOwner } = require('src/owner/owner-context');
        const owner = getCurrentOwner();
        if (owner === 'pablo' && id === PABLO_STOCK) {
          return { _id: PABLO_STOCK, card_id: 'p-card', card_name: 'Pablo' };
        }
        if (owner === 'esteban' && id === ESTEBAN_STOCK) {
          return { _id: ESTEBAN_STOCK, card_id: 'e-card', card_name: 'Esteban' };
        }
        return null;
      }),
      findByIds: jest.fn(async () => []),
      updateCardState: jest.fn(async () => {
        const { getCurrentOwner } = require('src/owner/owner-context');
        stateOwners.push(getCurrentOwner());
        return {};
      }),
      incrementQuantityAtomic: jest.fn(async () => ({})),
    } as unknown as StockRepository;

    const saleRepo = {
      create: jest.fn(async () => {
        const { getCurrentOwner } = require('src/owner/owner-context');
        saleOwners.push(getCurrentOwner());
        return {};
      }),
      findVentasByClientId: jest.fn(async () => []),
    } as unknown as SaleRepository;

    const tagRepo = {
      findMapByCardIds: jest.fn(async () => new Map()),
    } as unknown as CardStockTagRepository;

    const pedidoAbonoRepo = {
      deleteByPedidoId: jest.fn(async () => 0),
    } as unknown as PedidoAbonoRepository;

    const svc = new PedidoService(
      pedidoRepo,
      clientRepo,
      reservaRepo,
      stockRepo,
      saleRepo,
      tagRepo,
      pedidoAbonoRepo,
    );
    return { svc, saleRepo, stockRepo, reservaRepo, saleOwners, stateOwners };
  }

  it('pagar mixto: sale y vendida una vez por owner', async () => {
    const { svc, saleRepo, stockRepo, saleOwners, stateOwners } = makeService();
    await runWithOwnerAsync('pablo', () => svc.pagar(PEDIDO_ID));
    expect(saleRepo.create).toHaveBeenCalledTimes(2);
    expect(saleOwners).toEqual(['pablo', 'esteban']);
    expect(stockRepo.updateCardState).toHaveBeenCalledTimes(2);
    expect(stateOwners).toEqual(['pablo', 'esteban']);
    expect(stockRepo.updateCardState).toHaveBeenNthCalledWith(
      1,
      PABLO_STOCK,
      'vendida',
    );
    expect(stockRepo.updateCardState).toHaveBeenNthCalledWith(
      2,
      ESTEBAN_STOCK,
      'vendida',
    );
  });

  it('cancel mixto restaura disponible en cada DB', async () => {
    const { svc, stockRepo, reservaRepo, stateOwners } = makeService();
    await runWithOwnerAsync('pablo', () => svc.cancel(PEDIDO_ID));
    expect(stateOwners).toEqual(['pablo', 'esteban']);
    expect(stockRepo.updateCardState).toHaveBeenNthCalledWith(
      1,
      PABLO_STOCK,
      'disponible',
    );
    expect(stockRepo.updateCardState).toHaveBeenNthCalledWith(
      2,
      ESTEBAN_STOCK,
      'disponible',
    );
    expect(reservaRepo.deleteById).toHaveBeenCalledWith('res-p');
    expect(reservaRepo.deleteById).toHaveBeenCalledWith('res-e');
  });

  it('pagar legado sin stock_owner = owner actual', async () => {
    const { svc, reservaRepo, saleOwners, stateOwners } = makeService();
    (reservaRepo.findByPedidoId as jest.Mock).mockResolvedValue([
      {
        _id: 'res-legacy',
        stock_id: PABLO_STOCK,
        precio: 5000,
        currency: 'COP',
      },
    ]);
    await runWithOwnerAsync('pablo', () => svc.pagar(PEDIDO_ID));
    expect(saleOwners).toEqual(['pablo']);
    expect(stateOwners).toEqual(['pablo']);
  });
});
