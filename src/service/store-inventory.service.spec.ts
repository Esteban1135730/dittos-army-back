import {
  BULK_CARD_ID,
  DOMICILIO_CARD_ID,
  ENVIO_CARD_ID,
  PROTECCION_CARTAS_CARD_ID,
} from '../constants/bulk-product';
import { ForbiddenException } from '@nestjs/common';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runWithOwnerAsync } from '../owner/owner-context';
import { StoreInventoryService } from './store-inventory.service';

jest.mock('../utils/store-image-localize', () => {
  const actual = jest.requireActual('../utils/store-image-localize');
  return {
    ...actual,
    localizeStoreItemImages: jest.fn(async (items: unknown) => items),
    pruneUnusedStoreCardAssets: jest.fn(async () => ({ removed: 0 })),
    readCatalogImageUrls: jest.fn(async () => []),
  };
});

const CARD_ID = 'sv08-130';

function stockUnit(overrides: Record<string, unknown> = {}) {
  return {
    card_id: CARD_ID,
    card_name: 'Pecharunt',
    card_state: 'disponible',
    language: 'en',
    rareza: null,
    image_url: '',
    ...overrides,
  };
}

describe('StoreInventoryService multi-owner (045)', () => {
  let tmpRoot: string;
  let inventoryPath: string;
  let upcomingPath: string;

  const stockByOwner: { pablo: unknown[]; esteban: unknown[] | Error } = {
    pablo: [],
    esteban: [],
  };
  const pvpByOwner: { pablo: unknown[]; esteban: unknown[] } = {
    pablo: [],
    esteban: [],
  };
  const tagsByOwner: {
    pablo: Map<string, string[]>;
    esteban: Map<string, string[]>;
  } = {
    pablo: new Map(),
    esteban: new Map(),
  };
  const salesByOwner: { pablo: unknown[]; esteban: unknown[] } = {
    pablo: [],
    esteban: [],
  };

  const stockRepository = {
    findAll: jest.fn(async () => {
      const { getCurrentOwner } = require('../owner/owner-context');
      const owner = getCurrentOwner() as 'pablo' | 'esteban';
      const rows = stockByOwner[owner];
      if (rows instanceof Error) throw rows;
      return rows;
    }),
  };
  const pvpRepository = {
    findByCardIds: jest.fn(async () => {
      const { getCurrentOwner } = require('../owner/owner-context');
      const owner = getCurrentOwner() as 'pablo' | 'esteban';
      return pvpByOwner[owner];
    }),
  };
  const transitLotRepository = {
    findOpenLots: jest.fn(async (): Promise<any[]> => []),
  };
  const transitLineRepository = {
    findByRemainingQuantityGreaterThanZero: jest.fn(
      async (): Promise<any[]> => [],
    ),
  };
  const tcgDexService = {
    resolveStoreExportMeta: jest.fn(
      async (_id: string, _lang: string, name?: string) => ({
        name: name || 'Pecharunt',
        image: '',
      }),
    ),
    getRemoteStoreCardImageUrl: jest.fn(async () => undefined),
  };
  const localCardImagesService = {
    getImagesRoot: jest.fn(() => tmpRoot),
    findRelativePath: jest.fn(() => undefined),
  };
  const saleRepository = {
    findVentasInPeriod: jest.fn(async () => {
      const { getCurrentOwner } = require('../owner/owner-context');
      const owner = getCurrentOwner() as 'pablo' | 'esteban';
      return salesByOwner[owner];
    }),
  };
  const cardStockTagRepository = {
    findMapByCardIds: jest.fn(async () => {
      const { getCurrentOwner } = require('../owner/owner-context');
      const owner = getCurrentOwner() as 'pablo' | 'esteban';
      return tagsByOwner[owner];
    }),
  };

  let service: StoreInventoryService;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'store-inv-045-'));
    inventoryPath = join(tmpRoot, 'inventory.json');
    upcomingPath = join(tmpRoot, 'upcoming.json');
    process.env.STORE_INVENTORY_PATH = inventoryPath;
    process.env.STORE_UPCOMING_PATH = upcomingPath;
    process.env.STORE_REPO_PATH = tmpRoot;

    stockByOwner.pablo = [];
    stockByOwner.esteban = [];
    pvpByOwner.pablo = [];
    pvpByOwner.esteban = [];
    tagsByOwner.pablo = new Map();
    tagsByOwner.esteban = new Map();
    salesByOwner.pablo = [];
    salesByOwner.esteban = [];

    transitLotRepository.findOpenLots.mockResolvedValue([]);
    transitLineRepository.findByRemainingQuantityGreaterThanZero.mockResolvedValue(
      [],
    );

    service = new StoreInventoryService(
      stockRepository as never,
      pvpRepository as never,
      transitLotRepository as never,
      transitLineRepository as never,
      tcgDexService as never,
      localCardImagesService as never,
      saleRepository as never,
      cardStockTagRepository as never,
    );
  });

  afterEach(() => {
    delete process.env.STORE_INVENTORY_PATH;
    delete process.env.STORE_UPCOMING_PATH;
    delete process.env.STORE_REPO_PATH;
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  async function exportInventory() {
    return runWithOwnerAsync('pablo', () => service.exportStoreInventory());
  }

  function readInventory(): Array<Record<string, unknown>> {
    return JSON.parse(readFileSync(inventoryPath, 'utf-8'));
  }

  it('1 unidad Pablo + 1 misma variante Esteban → 1 ítem, quantity 2', async () => {
    stockByOwner.pablo = [stockUnit({ _id: 'p1' })];
    stockByOwner.esteban = [stockUnit({ _id: 'e1' })];
    pvpByOwner.pablo = [
      { card_id: CARD_ID, pvp: 50000, currency: 'COP', rareza: null },
    ];

    const result = await exportInventory();
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    const rows = readInventory();
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(2);
    expect(rows[0].pvp).toBe(50000);
    expect(rows[0].card_id).toBe(CARD_ID);
  });

  it('carta solo Esteban, PVP solo en Esteban → aparece con ese PVP COP', async () => {
    stockByOwner.esteban = [stockUnit({ card_name: 'Esteban only' })];
    pvpByOwner.esteban = [
      { card_id: CARD_ID, pvp: 45000, currency: 'COP', rareza: null },
    ];

    const result = await exportInventory();
    expect(result.success).toBe(true);
    const rows = readInventory();
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(1);
    expect(rows[0].pvp).toBe(45000);
    expect(rows[0].name).toBe('Esteban only');
  });

  it('Esteban findAll lanza → inventory de Pablo, success true', async () => {
    stockByOwner.pablo = [stockUnit({ card_name: 'Pablo card' })];
    stockByOwner.esteban = new Error('db esteban down');
    pvpByOwner.pablo = [
      { card_id: CARD_ID, pvp: 12000, currency: 'COP', rareza: null },
    ];

    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const result = await exportInventory();
    warn.mockRestore();
    expect(result.success).toBe(true);
    const rows = readInventory();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Pablo card');
    expect(rows[0].quantity).toBe(1);
  });

  it('PVP Pablo > 0 gana aunque Esteban tenga otro precio', async () => {
    stockByOwner.pablo = [stockUnit()];
    stockByOwner.esteban = [stockUnit()];
    pvpByOwner.pablo = [
      { card_id: CARD_ID, pvp: 50000, currency: 'COP', rareza: null },
    ];
    pvpByOwner.esteban = [
      { card_id: CARD_ID, pvp: 40000, currency: 'COP', rareza: null },
    ];

    await exportInventory();
    expect(readInventory()[0].pvp).toBe(50000);
  });

  it('PVP Pablo 0 usa el de Esteban', async () => {
    stockByOwner.pablo = [stockUnit()];
    pvpByOwner.pablo = [
      { card_id: CARD_ID, pvp: 0, currency: 'COP', rareza: null },
    ];
    pvpByOwner.esteban = [
      { card_id: CARD_ID, pvp: 33000, currency: 'COP', rareza: null },
    ];

    await exportInventory();
    expect(readInventory()[0].pvp).toBe(33000);
  });

  it('no exporta cartas sin PVP > 0', async () => {
    stockByOwner.pablo = [
      stockUnit({ card_name: 'Sin precio' }),
      stockUnit({
        card_id: 'sv01-1',
        card_name: 'Con precio',
      }),
    ];
    pvpByOwner.pablo = [
      { card_id: 'sv01-1', pvp: 8000, currency: 'COP', rareza: null },
    ];

    const result = await exportInventory();
    expect(result.success).toBe(true);
    const rows = readInventory();
    expect(rows).toHaveLength(1);
    expect(rows[0].card_id).toBe('sv01-1');
    expect(rows[0].pvp).toBe(8000);
  });

  it('no exporta vendida/reserva de Esteban', async () => {
    stockByOwner.esteban = [
      stockUnit({ card_state: 'vendida' }),
      stockUnit({ card_state: 'reserva' }),
      stockUnit({ card_state: 'disponible' }),
    ];
    pvpByOwner.esteban = [
      { card_id: CARD_ID, pvp: 10000, currency: 'COP', rareza: null },
    ];

    await exportInventory();
    expect(readInventory()[0].quantity).toBe(1);
  });

  it('ignora SKUs dummy bulk/envio/proteccion/domicilio y merch Esteban', async () => {
    stockByOwner.pablo = [
      stockUnit({ card_id: BULK_CARD_ID, card_name: 'bulk' }),
      stockUnit({ card_id: ENVIO_CARD_ID, card_name: 'envio' }),
      stockUnit({ card_id: DOMICILIO_CARD_ID, card_name: 'domicilio' }),
      stockUnit({
        card_id: PROTECCION_CARTAS_CARD_ID,
        card_name: 'proteccion de cartas',
      }),
      stockUnit({ card_name: 'Carta real' }),
    ];
    stockByOwner.esteban = [
      stockUnit({
        card_id: 'es-figura-3d-pequena',
        card_name: 'figura 3d pequeña',
      }),
      stockUnit({
        card_id: 'es-carta-tejida',
        card_name: 'carta tejida',
      }),
    ];
    pvpByOwner.pablo = [
      { card_id: CARD_ID, pvp: 10000, currency: 'COP', rareza: null },
    ];
    pvpByOwner.esteban = [
      {
        card_id: 'es-figura-3d-pequena',
        pvp: 1000,
        currency: 'COP',
        rareza: null,
      },
      { card_id: 'es-carta-tejida', pvp: 35000, currency: 'COP', rareza: null },
    ];

    const result = await exportInventory();
    expect(result.success).toBe(true);
    const rows = readInventory();
    expect(rows).toHaveLength(1);
    expect(rows[0].card_id).toBe(CARD_ID);
    expect(rows[0].name).toBe('Carta real');
  });

  it('une tags públicos y suma sold_units_90d', async () => {
    stockByOwner.pablo = [stockUnit()];
    tagsByOwner.pablo = new Map([[CARD_ID, ['vintage']]]);
    tagsByOwner.esteban = new Map([[CARD_ID, ['jugable']]]);
    salesByOwner.pablo = [{ card_id: CARD_ID }];
    salesByOwner.esteban = [{ card_id: CARD_ID }, { card_id: CARD_ID }];
    pvpByOwner.pablo = [
      { card_id: CARD_ID, pvp: 10000, currency: 'COP', rareza: null },
    ];

    await exportInventory();
    const row = readInventory()[0];
    expect(row.tags).toEqual(['vintage', 'jugable']);
    expect(row.sold_units_90d).toBe(3);
  });

  it('ACL: owner Esteban no puede exportar', async () => {
    await expect(
      runWithOwnerAsync('esteban', () => service.exportStoreInventory()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('upcoming usa PVP de Esteban si Pablo no tiene precio', async () => {
    transitLotRepository.findOpenLots.mockResolvedValue([
      { _id: { toString: () => 'lot-1' } },
    ]);
    transitLineRepository.findByRemainingQuantityGreaterThanZero.mockResolvedValue(
      [
        {
          lot_id: 'lot-1',
          card_id: CARD_ID,
          card_name: 'Transit card',
          image_url: '',
          language: 'en',
          rareza: null,
          remaining_quantity: 2,
          not_arrived_at: null,
        },
      ],
    );
    pvpByOwner.esteban = [
      { card_id: CARD_ID, pvp: 22000, currency: 'COP', rareza: null },
    ];

    const result = await runWithOwnerAsync('pablo', () =>
      service.exportStoreUpcoming(),
    );
    expect(result.success).toBe(true);
    const rows = JSON.parse(readFileSync(upcomingPath, 'utf-8'));
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(2);
    expect(rows[0].pvp).toBe(22000);
  });

  it('upcoming omite líneas sin PVP', async () => {
    transitLotRepository.findOpenLots.mockResolvedValue([
      { _id: { toString: () => 'lot-1' } },
    ]);
    transitLineRepository.findByRemainingQuantityGreaterThanZero.mockResolvedValue(
      [
        {
          lot_id: 'lot-1',
          card_id: CARD_ID,
          card_name: 'Sin PVP',
          image_url: '',
          language: 'en',
          rareza: null,
          remaining_quantity: 2,
          not_arrived_at: null,
        },
      ],
    );

    const result = await runWithOwnerAsync('pablo', () =>
      service.exportStoreUpcoming(),
    );
    expect(result.success).toBe(true);
    const rows = JSON.parse(readFileSync(upcomingPath, 'utf-8'));
    expect(rows).toHaveLength(0);
  });
});
