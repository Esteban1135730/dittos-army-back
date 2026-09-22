import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SaleController } from './sale.controller';
import { SaleRepository } from 'src/repository/sale.repository';
import { ClientRepository } from 'src/repository/client.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { TCGDexService } from 'src/pokemon';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';
import { runWithOwnerAsync } from 'src/owner/owner-context';
import { assertFeatureAllowed } from 'src/owner/feature-acl.guard';
import { StockCardImagesSyncService } from 'src/service/stock-card-images-sync.service';
import { SaleBatchService } from 'src/service/sale-batch.service';

const pabloId = '507f1f77bcf86cd799439011';
const estebanId = '507f1f77bcf86cd799439022';

describe('SaleController sell-batch multi-owner (034)', () => {
  let controller: SaleController;
  let saleRepository: { create: jest.Mock };
  let stockRepository: {
    findById: jest.Mock;
    updateCardState: jest.Mock;
  };
  let reservaRepository: { deleteByStockId: jest.Mock };
  const createOwners: string[] = [];

  beforeEach(async () => {
    createOwners.length = 0;
    saleRepository = {
      create: jest.fn().mockImplementation(async () => {
        const { getCurrentOwner } = require('src/owner/owner-context');
        createOwners.push(getCurrentOwner());
        return {};
      }),
    };
    stockRepository = {
      findById: jest.fn().mockImplementation(async (id: string) => {
        const { getCurrentOwner } = require('src/owner/owner-context');
        const owner = getCurrentOwner();
        if (owner === 'pablo' && id === pabloId) {
          return { card_id: 'pablo-card', card_state: 'disponible' };
        }
        if (owner === 'esteban' && id === estebanId) {
          return { card_id: 'esteban-card', card_state: 'disponible' };
        }
        return null;
      }),
      updateCardState: jest.fn().mockResolvedValue(undefined),
    };
    reservaRepository = {
      deleteByStockId: jest.fn().mockResolvedValue(true),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SaleController],
      providers: [
        { provide: SaleRepository, useValue: saleRepository },
        { provide: ClientRepository, useValue: {} },
        { provide: StockRepository, useValue: stockRepository },
        { provide: PvpRepository, useValue: {} },
        { provide: ReservaRepository, useValue: reservaRepository },
        { provide: TCGDexService, useValue: {} },
        {
          provide: CardStockTagRepository,
          useValue: {
            findMapByCardIds: jest.fn().mockResolvedValue(new Map()),
          },
        },
        {
          provide: StockCardImagesSyncService,
          useValue: {
            pruneIfCardUnused: jest.fn().mockResolvedValue(undefined),
          },
        },
        SaleBatchService,
      ],
    }).compile();

    controller = moduleRef.get(SaleController);
  });

  it('vende 1 ítem pablo + 1 esteban en su conexión (ALS owner)', async () => {
    const res = await controller.sellBatch({
      items: [
        { stock_id: pabloId, amount_cop: 50000, owner: 'pablo' },
        { stock_id: estebanId, amount_cop: 30000, owner: 'esteban' },
      ],
    });
    expect(res.sold_count).toBe(2);
    expect(res.results.map((r) => r.owner)).toEqual(['pablo', 'esteban']);
    expect(createOwners).toEqual(['pablo', 'esteban']);
    expect(saleRepository.create).toHaveBeenCalledTimes(2);
  });

  it('ítem con owner/stock mismatch → fail de ese ítem', async () => {
    const res = await controller.sellBatch({
      items: [
        { stock_id: estebanId, amount_cop: 50000, owner: 'pablo' },
        { stock_id: pabloId, amount_cop: 30000, owner: 'pablo' },
      ],
    });
    expect(res.sold_count).toBe(1);
    expect(res.results[0].success).toBe(false);
    expect(res.results[0].message).toContain('no encontrado');
    expect(res.results[1].success).toBe(true);
  });

  it('ACL export-tienda con esteban → 403', async () => {
    await runWithOwnerAsync('esteban', async () => {
      expect(() => assertFeatureAllowed('export-tienda')).toThrow(
        ForbiddenException,
      );
    });
    await runWithOwnerAsync('pablo', async () => {
      expect(() => assertFeatureAllowed('export-tienda')).not.toThrow();
    });
  });
});
