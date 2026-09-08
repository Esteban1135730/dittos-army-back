import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalCardImagesService } from './local-card-images.service';
import { StockCardImagesSyncService } from './stock-card-images-sync.service';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe('StockCardImagesSyncService', () => {
  const originalFetch = global.fetch;

  function createHarness() {
    const root = mkdtempSync(join(tmpdir(), 'stock-card-sync-'));
    process.env.TCGDEX_LOCAL_IMAGES_DIR = root;
    const local = new LocalCardImagesService();
    local.loadIndex();
    local.ensureImagesRoot();
    jest.spyOn(local, 'legacyImagesRoots').mockReturnValue([]);

    const stockRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      findByCardId: jest.fn().mockResolvedValue([]),
      updateById: jest.fn().mockResolvedValue({}),
    };
    const tcgDexService = {
      lookupProductionCardImage: jest
        .fn()
        .mockResolvedValue({ status: 'missing' }),
      getRemoteStoreCardImageUrl: jest.fn().mockResolvedValue(undefined),
    };
    const service = new StockCardImagesSyncService(
      stockRepository as never,
      local,
      tcgDexService as never,
    );
    return { service, local, root, stockRepository, tcgDexService };
  }

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    delete process.env.TCGDEX_LOCAL_IMAGES_DIR;
    delete process.env.CARD_IMAGES_PUBLIC_BASE;
  });

  it('onApplicationBootstrap no espera syncInBackground', () => {
    jest.useFakeTimers();
    const { service } = createHarness();
    const spy = jest
      .spyOn(service, 'syncInBackground')
      .mockResolvedValue(undefined);
    service.onApplicationBootstrap();
    expect(spy).not.toHaveBeenCalled();
    jest.runOnlyPendingTimers();
    expect(spy).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('descarga solo si TCGdex nube no tiene arte, y no re-descarga si ya existe', async () => {
    const { service, root, stockRepository, tcgDexService } = createHarness();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => PNG,
    });
    global.fetch = fetchMock as typeof fetch;

    stockRepository.findAll.mockResolvedValue([
      {
        _id: '1',
        card_id: 'swsh3-136',
        card_state: 'disponible',
        image_url: 'https://cdn.example/swsh3-136.png',
      },
    ]);

    await service.syncInBackground();
    expect(existsSync(join(root, 'swsh3', 'swsh3-136.png'))).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    expect(tcgDexService.lookupProductionCardImage).toHaveBeenCalled();
    const firstCalls = fetchMock.mock.calls.length;

    fetchMock.mockClear();
    tcgDexService.lookupProductionCardImage.mockClear();
    await service.syncInBackground();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tcgDexService.lookupProductionCardImage).toHaveBeenCalled();
    expect(firstCalls).toBeGreaterThan(0);
  });

  it('no cachea ni conserva archivo si TCGdex nube resuelve la imagen', async () => {
    const { service, local, root, stockRepository, tcgDexService } =
      createHarness();
    local.saveBuffer('sv04/sv04-236.png', PNG);
    tcgDexService.lookupProductionCardImage.mockResolvedValue({
      status: 'found',
      url: 'https://assets.tcgdex.net/en/sv04/236/low.png',
    });
    stockRepository.findAll.mockResolvedValue([
      {
        _id: '1',
        card_id: 'sv04-236',
        card_state: 'disponible',
        image_url: '/card-images/sv04/sv04-236.png',
      },
    ]);

    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;

    await service.syncInBackground();
    expect(existsSync(join(root, 'sv04', 'sv04-236.png'))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stockRepository.updateById).toHaveBeenCalledWith('1', {
      image_url: 'https://assets.tcgdex.net/en/sv04/236/low.png',
    });
  });

  it('si TCGdex nube falla no descarga el stock entero', async () => {
    const { service, local, root, stockRepository, tcgDexService } =
      createHarness();
    local.saveBuffer('sv04/sv04-236.png', PNG);
    tcgDexService.lookupProductionCardImage.mockResolvedValue({
      status: 'error',
    });
    stockRepository.findAll.mockResolvedValue([
      {
        _id: '1',
        card_id: 'sv04-236',
        card_state: 'disponible',
        image_url: 'https://cdn.example/sv04-236.png',
      },
    ]);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;

    await service.syncInBackground();
    expect(existsSync(join(root, 'sv04', 'sv04-236.png'))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('poda archivos cuyo card_id ya no está activo', async () => {
    const { service, root, stockRepository } = createHarness();
    mkdirSync(join(root, 'base1'), { recursive: true });
    writeFileSync(join(root, 'base1', 'base1-1.png'), PNG);
    mkdirSync(join(root, 'swsh3'), { recursive: true });
    writeFileSync(join(root, 'swsh3', 'swsh3-136.png'), PNG);
    writeFileSync(join(root, 'card-index.json'), '{}');

    stockRepository.findAll.mockResolvedValue([
      {
        _id: '1',
        card_id: 'swsh3-136',
        card_state: 'disponible',
        image_url: '',
      },
    ]);

    await service.syncInBackground();
    expect(existsSync(join(root, 'swsh3', 'swsh3-136.png'))).toBe(true);
    expect(existsSync(join(root, 'base1', 'base1-1.png'))).toBe(false);
    expect(existsSync(join(root, 'card-index.json'))).toBe(true);
  });

  it('pruneIfCardUnused no borra si otro owner aún tiene stock activo', async () => {
    const { service, local, root, stockRepository } = createHarness();
    local.saveBuffer('swsh3/swsh3-136.png', PNG);
    stockRepository.findByCardId
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          card_id: 'swsh3-136',
          card_state: 'reserva',
        },
      ]);

    await service.pruneIfCardUnused('swsh3-136');
    expect(existsSync(join(root, 'swsh3', 'swsh3-136.png'))).toBe(true);
  });

  it('pruneIfCardUnused borra si ningún owner tiene stock activo', async () => {
    const { service, local, root, stockRepository } = createHarness();
    local.saveBuffer('swsh3/swsh3-136.png', PNG);
    stockRepository.findByCardId.mockResolvedValue([
      { card_id: 'swsh3-136', card_state: 'vendida' },
    ]);

    await service.pruneIfCardUnused('swsh3-136');
    expect(existsSync(join(root, 'swsh3', 'swsh3-136.png'))).toBe(false);
  });

  it('reescribe image_url vacío a /card-images/...', async () => {
    const { service, local, stockRepository } = createHarness();
    local.saveBuffer('swsh3/swsh3-136.png', PNG);
    stockRepository.findAll.mockResolvedValue([
      {
        _id: 'abc',
        card_id: 'swsh3-136',
        card_state: 'disponible',
        image_url: '',
      },
    ]);

    await service.syncInBackground();
    expect(stockRepository.updateById).toHaveBeenCalledWith('abc', {
      image_url: '/card-images/swsh3/swsh3-136.png',
    });
  });
});
