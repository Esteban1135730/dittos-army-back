import { Test } from '@nestjs/testing';
import { BulkProductService } from './bulk-product.service';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import {
  BULK_CARD_ID,
  BULK_CARD_NAME,
  BULK_DEFAULT_PVP_COP,
  BULK_DEFAULT_QUANTITY,
} from 'src/constants/bulk-product';

describe('BulkProductService', () => {
  let service: BulkProductService;
  let stockRepository: {
    findOneByCardId: jest.Mock;
    create: jest.Mock;
    updateById: jest.Mock;
  };
  let pvpRepository: {
    findBaseByCardId: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    stockRepository = {
      findOneByCardId: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn(),
    };
    pvpRepository = {
      findBaseByCardId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BulkProductService,
        { provide: StockRepository, useValue: stockRepository },
        { provide: PvpRepository, useValue: pvpRepository },
      ],
    }).compile();

    service = moduleRef.get(BulkProductService);
  });

  it('crea el SKU bulk y PVP default la primera vez', async () => {
    stockRepository.findOneByCardId.mockResolvedValue(null);
    stockRepository.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      card_id: BULK_CARD_ID,
      card_name: BULK_CARD_NAME,
      product_kind: 'quantity',
      quantity: BULK_DEFAULT_QUANTITY,
    });

    const res = await service.ensureBulk();

    expect(res.created).toBe(true);
    expect(res.pvp_ensured).toBe(true);
    expect(res.quantity).toBe(BULK_DEFAULT_QUANTITY);
    expect(stockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        card_id: BULK_CARD_ID,
        product_kind: 'quantity',
        quantity: BULK_DEFAULT_QUANTITY,
      }),
    );
    expect(pvpRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        card_id: BULK_CARD_ID,
        pvp: BULK_DEFAULT_PVP_COP,
        currency: 'COP',
      }),
    );
  });

  it('segunda llamada no duplica ni resetea quantity; no sobrescribe PVP existente', async () => {
    stockRepository.findOneByCardId.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      card_id: BULK_CARD_ID,
      card_name: BULK_CARD_NAME,
      product_kind: 'quantity',
      quantity: 42,
      image_url: '/bulk-dummy.svg',
      card_state: 'disponible',
    });
    pvpRepository.findBaseByCardId.mockResolvedValue({
      card_id: BULK_CARD_ID,
      pvp: 3500,
      currency: 'COP',
    });

    const res = await service.ensureBulk();

    expect(res.created).toBe(false);
    expect(res.pvp_ensured).toBe(false);
    expect(res.quantity).toBe(42);
    expect(stockRepository.create).not.toHaveBeenCalled();
    expect(pvpRepository.create).not.toHaveBeenCalled();
    expect(pvpRepository.update).not.toHaveBeenCalled();
  });

  it('asegura PVP 2000 si falta el base', async () => {
    stockRepository.findOneByCardId.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      card_id: BULK_CARD_ID,
      card_name: BULK_CARD_NAME,
      product_kind: 'quantity',
      quantity: 100,
      image_url: '/bulk-dummy.svg',
      card_state: 'disponible',
    });
    pvpRepository.findBaseByCardId.mockResolvedValue(null);

    const res = await service.ensureBulk();

    expect(res.pvp_ensured).toBe(true);
    expect(pvpRepository.create).toHaveBeenCalled();
  });

  it('repara card_state reserva del SKU bulk a disponible', async () => {
    stockRepository.findOneByCardId.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      card_id: BULK_CARD_ID,
      card_name: BULK_CARD_NAME,
      product_kind: 'quantity',
      quantity: 50,
      image_url: '/bulk-dummy.svg',
      card_state: 'reserva',
    });
    stockRepository.updateById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      card_id: BULK_CARD_ID,
      card_state: 'disponible',
      quantity: 50,
    });

    await service.ensureBulk();

    expect(stockRepository.updateById).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({ card_state: 'disponible' }),
    );
  });
});
