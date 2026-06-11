import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import {
  isLocalhostImageUrl,
  localizeStoreImageUrl,
  localizeStoreItemImages,
  parseCardImagesRelativePath,
  storeAssetPublicUrl,
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
      await import('fs/promises').then((fs) =>
        fs
          .access(
            path.join(storeRepo, 'public', 'assets', 'cards', relative),
          )
          .then(() => true)
          .catch(() => false),
      ),
    ).toBe(true);

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

  it('prioriza imagen remota TCGdex antes de copiar assets', async () => {
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

    expect(result[0].image).toBe(
      'https://assets.tcgdex.net/en/sv/sv07/128/low.png',
    );
    expect(resolveRemoteImage).toHaveBeenCalledWith('sv07-128', 'en');
    expect(copyFileFn).not.toHaveBeenCalled();
  });
});
