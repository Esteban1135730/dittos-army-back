import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
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
        'zh:SV9a-001': { file: 'SV9a-zh/SV9a-001.png', lang: 'zh-tw', setId: 'SV9a' },
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
    expect(resolved?.image).toBe(
      'http://test/card-images/swsh3/swsh3-136.png',
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
});
