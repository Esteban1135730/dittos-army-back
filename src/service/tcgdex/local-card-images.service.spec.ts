import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalCardImagesService } from './local-card-images.service';

describe('LocalCardImagesService', () => {
  function createFixture() {
    const root = mkdtempSync(join(tmpdir(), 'tcg-images-'));
    mkdirSync(join(root, 'swsh3'), { recursive: true });
    writeFileSync(join(root, 'swsh3', 'swsh3-136.png'), Buffer.alloc(1024));
    mkdirSync(join(root, 'SV9a-zh'), { recursive: true });
    writeFileSync(join(root, 'SV9a-zh', 'SV9a-001.png'), Buffer.alloc(1024));

    writeFileSync(
      join(root, 'card-index.json'),
      JSON.stringify({
        'swsh3-136': { file: 'swsh3/swsh3-136.png', setId: 'swsh3' },
        'zh:SV9a-001': {
          file: 'SV9a-zh/SV9a-001.png',
          lang: 'zh-tw',
          setId: 'SV9a',
        },
      }),
    );

    const service = new LocalCardImagesService();
    process.env.TCGDEX_LOCAL_IMAGES_DIR = root;
    process.env.CARD_IMAGES_PUBLIC_BASE = 'http://test/card-images';
    process.env.TCGDEX_PENDING_DOWNLOAD_MANIFEST = join(
      root,
      'pending-download-manifest.json',
    );
    service.loadIndex();
    return { service, root };
  }

  afterEach(() => {
    delete process.env.TCGDEX_LOCAL_IMAGES_DIR;
    delete process.env.CARD_IMAGES_PUBLIC_BASE;
    delete process.env.TCGDEX_PENDING_DOWNLOAD_MANIFEST;
  });

  it('resuelve imagen local en inglés por cardId', () => {
    const { service } = createFixture();
    const resolved = service.resolve({
      cardId: 'swsh3-136',
      locale: 'en',
      setId: 'swsh3',
    });
    expect(resolved?.source).toBe('local');
    expect(resolved?.image).toBe('http://test/card-images/swsh3/swsh3-136.png');
  });

  it('encuentra ruta relativa local sin setId explícito', () => {
    const { service } = createFixture();
    expect(service.findRelativePath('swsh3-136', 'en')).toBe(
      'swsh3/swsh3-136.png',
    );
  });

  it('resuelve imagen zh-tw con clave prefijada del índice', () => {
    const { service } = createFixture();
    const resolved = service.resolve({
      cardId: 'SV9a-001',
      locale: 'zh-tw',
      setId: 'SV9a',
    });
    expect(resolved?.image).toContain('SV9a-zh/SV9a-001.png');
  });

  it('usa remoto y registra manifest si no hay archivo local', () => {
    const { service, root } = createFixture();
    const remote = {
      image: 'https://assets.tcgdex.net/en/base/base1/1/low.png',
      small: 'https://assets.tcgdex.net/en/base/base1/1/low.png',
      large: 'https://assets.tcgdex.net/en/base/base1/1/high.png',
    };
    const result = service.applyRemoteFallback(
      {
        cardId: 'base1-1',
        locale: 'en',
        setId: 'base1',
        remoteImageBase: 'https://assets.tcgdex.net/en/base/base1/1',
      },
      remote,
    );
    expect(result.small).toBe(remote.small);
    service.flushPendingManifest();
    const manifest = JSON.parse(
      require('fs').readFileSync(
        join(root, 'pending-download-manifest.json'),
        'utf8',
      ),
    );
    expect(manifest.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardId: 'base1-1',
          lang: 'en',
          url: 'https://assets.tcgdex.net/en/base/base1/1/high.png',
        }),
      ]),
    );
  });

  it('usa data/card-images como raíz por defecto en todos los OS', () => {
    delete process.env.TCGDEX_LOCAL_IMAGES_DIR;
    const service = new LocalCardImagesService();
    expect(service.getImagesRoot()).toBe(
      join(process.cwd(), 'data', 'card-images'),
    );
  });

  it('saveBuffer escribe y actualiza índice en memoria', () => {
    const { service, root } = createFixture();
    const rel = service.saveBuffer('base1/base1-2.png', Buffer.alloc(64));
    expect(rel).toBe('base1/base1-2.png');
    expect(existsSync(join(root, 'base1', 'base1-2.png'))).toBe(true);
    expect(service.findRelativePath('base1-2', 'en')).toBe('base1/base1-2.png');
  });

  it('copyFromLegacyIfPresent copia al imagesRoot', () => {
    const { service, root } = createFixture();
    const legacy = mkdtempSync(join(tmpdir(), 'tcg-legacy-'));
    mkdirSync(join(legacy, 'base1'), { recursive: true });
    writeFileSync(join(legacy, 'base1', 'base1-1.png'), Buffer.alloc(256));
    jest.spyOn(service, 'legacyImagesRoots').mockReturnValue([legacy]);

    const copied = service.copyFromLegacyIfPresent('base1-1', 'en', 'base1');
    expect(copied).toBe('base1/base1-1.png');
    expect(existsSync(join(root, 'base1', 'base1-1.png'))).toBe(true);
  });

  it('deleteFilesForCardId borra solo ese cardId', () => {
    const { service, root } = createFixture();
    mkdirSync(join(root, 'base1'), { recursive: true });
    writeFileSync(join(root, 'base1', 'base1-1.png'), Buffer.alloc(100));

    const deleted = service.deleteFilesForCardId('swsh3-136');
    expect(deleted).toBeGreaterThan(0);
    expect(existsSync(join(root, 'swsh3', 'swsh3-136.png'))).toBe(false);
    expect(existsSync(join(root, 'base1', 'base1-1.png'))).toBe(true);
    expect(existsSync(join(root, 'SV9a-zh', 'SV9a-001.png'))).toBe(true);
  });
});
