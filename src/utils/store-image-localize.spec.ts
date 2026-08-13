import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import {
  isBlockedVendorImageUrl,
  isLocalhostImageUrl,
  localizeStoreImageUrl,
  localizeStoreItemImages,
  parseCardImagesRelativePath,
  pruneUnusedStoreCardAssets,
  storeAssetPublicUrl,
  usedStoreAssetRelativePaths,
} from './store-image-localize';

describe('store-image-localize', () => {
  it('detecta URLs localhost', () => {
    expect(isLocalhostImageUrl('http://localhost:3000/card-images/a.png')).toBe(
      true,
    );
    expect(
      isLocalhostImageUrl('https://assets.tcgdex.net/en/sv/sv07/128/low.png'),
    ).toBe(false);
  });

  it('parsea ruta relativa de /card-images/', () => {
    expect(
      parseCardImagesRelativePath(
        'http://localhost:3000/card-images/swsh3/swsh3-136.png',
      ),
    ).toBe('swsh3/swsh3-136.png');
  });

  it('genera URL pública del asset', () => {
    expect(storeAssetPublicUrl('swsh3/swsh3-136.png')).toBe(
      '/assets/cards/swsh3/swsh3-136.png',
    );
  });

  it('copia imagen local y devuelve ruta pública', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'store-localize-'));
    const imagesRoot = path.join(root, 'images');
    const storeRepo = path.join(root, 'store');
    const relative = 'swsh3/swsh3-136.png';

    await mkdir(path.join(imagesRoot, 'swsh3'), { recursive: true });
    await writeFile(path.join(imagesRoot, relative), 'png-bytes');
    await mkdir(path.join(storeRepo, 'public'), { recursive: true });

    const result = await localizeStoreImageUrl(
      `http://localhost:3000/card-images/${relative}`,
      {
        storeRepoPath: storeRepo,
        localImagesRoot: imagesRoot,
      },
    );

    expect(result).toBe('/assets/cards/swsh3/swsh3-136.png');
    expect(
      await readFile(
        path.join(storeRepo, 'public', 'assets', 'cards', relative),
        'utf8',
      ),
    ).toBe('png-bytes');

    await rm(root, { recursive: true, force: true });
  });

  it('localiza varias líneas reutilizando caché local', async () => {
    const copyFileFn = jest.fn().mockResolvedValue(undefined);
    const existsFn = jest.fn().mockReturnValue(true);
    const url = 'http://localhost:3000/card-images/set/card.png';

    const result = await localizeStoreItemImages(
      [
        { image: url, card_id: 'a' },
        { image: url, card_id: 'b' },
        { image: 'https://cdn.example/x.png', card_id: 'c' },
      ],
      {
        storeRepoPath: 'C:\\store',
        localImagesRoot: 'C:\\images',
        copyFileFn,
        existsFn,
      },
    );

    expect(result[0].image).toBe('/assets/cards/set/card.png');
    expect(result[1].image).toBe('/assets/cards/set/card.png');
    expect(result[2].image).toBe('https://cdn.example/x.png');
    expect(copyFileFn).toHaveBeenCalledTimes(1);
  });

  it('copia localhost antes de usar la imagen remota', async () => {
    const copyFileFn = jest.fn().mockResolvedValue(undefined);
    const existsFn = jest.fn().mockReturnValue(true);
    const resolveRemoteImage = jest
      .fn()
      .mockResolvedValue('https://assets.tcgdex.net/en/sv/sv07/128/low.png');

    const result = await localizeStoreItemImages(
      [
        {
          image: 'http://localhost:3000/card-images/set/card.png',
          card_id: 'sv07-128',
          language: 'en',
        },
      ],
      {
        storeRepoPath: 'C:\\store',
        localImagesRoot: 'C:\\images',
        resolveRemoteImage,
        copyFileFn,
        existsFn,
      },
    );

    expect(result[0].image).toBe('/assets/cards/set/card.png');
    expect(copyFileFn).toHaveBeenCalled();
    expect(resolveRemoteImage).not.toHaveBeenCalled();
  });

  it('completa imagen vacía desde el índice local antes que la remota', async () => {
    const copyFileFn = jest.fn().mockResolvedValue(undefined);
    const existsFn = jest.fn().mockReturnValue(true);
    const resolveRemoteImage = jest
      .fn()
      .mockResolvedValue('https://assets.tcgdex.net/en/sv/sv07/128/low.png');

    const result = await localizeStoreItemImages(
      [{ image: '', card_id: 'sv07-128', language: 'en' }],
      {
        storeRepoPath: 'C:\\store',
        localImagesRoot: 'C:\\images',
        resolveLocalRelativePath: (cardId) =>
          cardId === 'sv07-128' ? 'sv07/sv07-128.png' : undefined,
        resolveRemoteImage,
        copyFileFn,
        existsFn,
      },
    );

    expect(result[0].image).toBe('/assets/cards/sv07/sv07-128.png');
    expect(copyFileFn).toHaveBeenCalled();
    expect(resolveRemoteImage).not.toHaveBeenCalled();
  });

  it('sustituye imágenes de host bloqueado por archivo local o remota pública', async () => {
    expect(
      isBlockedVendorImageUrl(
        'https://www.cardtrader.com/uploads/blueprints/image/1.png',
      ),
    ).toBe(true);

    const resolveRemoteImage = jest
      .fn()
      .mockResolvedValue('https://assets.tcgdex.net/en/sv/sv07/128/low.png');

    const result = await localizeStoreItemImages(
      [
        {
          image: 'https://www.cardtrader.com/uploads/blueprints/image/1.png',
          card_id: 'sv07-128',
          language: 'en',
        },
      ],
      {
        storeRepoPath: 'C:\\store',
        localImagesRoot: 'C:\\images',
        resolveRemoteImage,
      },
    );

    expect(result[0].image).toBe(
      'https://assets.tcgdex.net/en/sv/sv07/128/low.png',
    );
  });

  it('completa imagen vacía con la remota pública si no hay archivo local', async () => {
    const resolveRemoteImage = jest
      .fn()
      .mockResolvedValue('https://assets.tcgdex.net/en/sv/sv07/128/low.png');

    const result = await localizeStoreItemImages(
      [{ image: '', card_id: 'sv07-128', language: 'en' }],
      {
        storeRepoPath: 'C:\\store',
        localImagesRoot: 'C:\\images',
        resolveRemoteImage,
      },
    );

    expect(result[0].image).toBe(
      'https://assets.tcgdex.net/en/sv/sv07/128/low.png',
    );
  });

  it('identifica assets usados por la tienda', () => {
    expect(
      [...usedStoreAssetRelativePaths(['/assets/cards/swsh3/swsh3-136.png'])],
    ).toEqual(['swsh3/swsh3-136.png']);
  });

  it('elimina imágenes que el catálogo ya no referencia', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'store-prune-'));
    const storeRepo = path.join(root, 'store');
    const cardsRoot = path.join(storeRepo, 'public', 'assets', 'cards');
    await mkdir(path.join(cardsRoot, 'keep'), { recursive: true });
    await mkdir(path.join(cardsRoot, 'gone'), { recursive: true });
    await writeFile(path.join(cardsRoot, 'keep', 'a.png'), 'keep');
    await writeFile(path.join(cardsRoot, 'gone', 'b.png'), 'gone');

    const result = await pruneUnusedStoreCardAssets(
      ['/assets/cards/keep/a.png'],
      { storeRepoPath: storeRepo },
    );

    expect(result).toEqual({ removed: 1, kept: 1 });
    await expect(
      readFile(path.join(cardsRoot, 'keep', 'a.png'), 'utf8'),
    ).resolves.toBe('keep');
    await expect(
      readFile(path.join(cardsRoot, 'gone', 'b.png'), 'utf8'),
    ).rejects.toThrow();

    await rm(root, { recursive: true, force: true });
  });
});
