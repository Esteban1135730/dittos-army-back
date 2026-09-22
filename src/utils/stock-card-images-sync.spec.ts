import {
  cardIdsFromRelativePath,
  isAcceptableCardImageBody,
  isActiveStockForImageCache,
  isCardImagesMetaFile,
  mapWithConcurrency,
  pickDownloadUrl,
  publicCardImagesPath,
  rewriteImageUrlIfLocalhostOrEmpty,
  rewriteImageUrlToCloudIfLocalCache,
  shouldCacheLocalImage,
} from './stock-card-images-sync';

describe('stock-card-images-sync helpers', () => {
  describe('isActiveStockForImageCache', () => {
    it('conserva unit en estados activos', () => {
      expect(
        isActiveStockForImageCache({
          card_id: 'swsh3-136',
          card_state: 'disponible',
        }),
      ).toBe(true);
      expect(
        isActiveStockForImageCache({
          card_id: 'swsh3-136',
          card_state: 'en_stock_colombia',
        }),
      ).toBe(true);
      expect(
        isActiveStockForImageCache({
          card_id: 'swsh3-136',
          card_state: 'reserva',
        }),
      ).toBe(true);
    });

    it('excluye vendida, SKUs sintéticos y quantity sin stock', () => {
      expect(
        isActiveStockForImageCache({
          card_id: 'swsh3-136',
          card_state: 'vendida',
        }),
      ).toBe(false);
      expect(
        isActiveStockForImageCache({
          card_id: 'da-bulk',
          card_state: 'disponible',
          product_kind: 'quantity',
          quantity: 99,
        }),
      ).toBe(false);
      expect(
        isActiveStockForImageCache({
          card_id: 'da-envio',
          card_state: 'disponible',
          product_kind: 'quantity',
          quantity: 99,
        }),
      ).toBe(false);
      expect(
        isActiveStockForImageCache({
          card_id: 'da-domicilio',
          card_state: 'disponible',
          product_kind: 'quantity',
          quantity: 99,
        }),
      ).toBe(false);
      expect(
        isActiveStockForImageCache({
          card_id: 'da-proteccion-cartas',
          card_state: 'disponible',
          product_kind: 'quantity',
          quantity: 99,
        }),
      ).toBe(false);
      expect(
        isActiveStockForImageCache({
          card_id: 'sv8-1',
          card_state: 'disponible',
          product_kind: 'quantity',
          quantity: 0,
        }),
      ).toBe(false);
    });
  });

  describe('pickDownloadUrl', () => {
    it('acepta HTTPS público y rechaza localhost o vacío', () => {
      expect(pickDownloadUrl('https://assets.tcgdex.net/en/swsh3/136')).toBe(
        'https://assets.tcgdex.net/en/swsh3/136/low.png',
      );
      expect(pickDownloadUrl('http://localhost:3000/card-images/a.png')).toBe(
        undefined,
      );
      expect(pickDownloadUrl('')).toBeUndefined();
      expect(pickDownloadUrl('/card-images/a.png')).toBeUndefined();
    });
  });

  describe('rewriteImageUrlIfLocalhostOrEmpty', () => {
    it('reescribe vacío y localhost card-images', () => {
      expect(rewriteImageUrlIfLocalhostOrEmpty('', 'swsh3/swsh3-136.png')).toBe(
        '/card-images/swsh3/swsh3-136.png',
      );
      expect(
        rewriteImageUrlIfLocalhostOrEmpty(
          'http://localhost:3000/card-images/old/x.png',
          'swsh3/swsh3-136.png',
        ),
      ).toBe('/card-images/swsh3/swsh3-136.png');
      expect(
        rewriteImageUrlIfLocalhostOrEmpty(
          'http://127.0.0.1:3000/card-images/old.png',
          'a/b.png',
        ),
      ).toBe('/card-images/a/b.png');
    });

    it('no pisa CDN público', () => {
      expect(
        rewriteImageUrlIfLocalhostOrEmpty(
          'https://assets.tcgdex.net/en/swsh3/136/low.png',
          'swsh3/swsh3-136.png',
        ),
      ).toBeUndefined();
    });
  });

  describe('shouldCacheLocalImage', () => {
    it('cachea solo si la nube no tiene URL pública', () => {
      expect(
        shouldCacheLocalImage('https://assets.tcgdex.net/en/sv04/236/low.png'),
      ).toBe(false);
      expect(shouldCacheLocalImage(undefined)).toBe(true);
      expect(shouldCacheLocalImage('')).toBe(true);
      expect(
        shouldCacheLocalImage('http://localhost:3000/card-images/a.png'),
      ).toBe(true);
    });
  });

  describe('rewriteImageUrlToCloudIfLocalCache', () => {
    const cloud = 'https://assets.tcgdex.net/en/sv04/236/low.png';

    it('pasa vacío y /card-images al CDN', () => {
      expect(rewriteImageUrlToCloudIfLocalCache('', cloud)).toBe(cloud);
      expect(
        rewriteImageUrlToCloudIfLocalCache(
          '/card-images/sv04/sv04-236.png',
          cloud,
        ),
      ).toBe(cloud);
      expect(
        rewriteImageUrlToCloudIfLocalCache(
          'http://localhost:3000/card-images/sv04/sv04-236.png',
          cloud,
        ),
      ).toBe(cloud);
    });

    it('no pisa CardTrader u otra URL pública', () => {
      expect(
        rewriteImageUrlToCloudIfLocalCache(
          'https://www.cardtrader.com/uploads/blueprints/image.jpg',
          cloud,
        ),
      ).toBeUndefined();
    });
  });

  describe('cardIdsFromRelativePath', () => {
    it('usa el basename sin extensión', () => {
      expect(cardIdsFromRelativePath('swsh3/swsh3-136.png')).toEqual([
        'swsh3-136',
      ]);
      expect(cardIdsFromRelativePath('SV9a-zh/SV9a-001.png')).toEqual([
        'SV9a-001',
      ]);
    });

    it('ignora metadatos de caché', () => {
      expect(cardIdsFromRelativePath('card-index.json')).toEqual([]);
      expect(isCardImagesMetaFile('pending-download-manifest.json')).toBe(true);
    });
  });

  describe('publicCardImagesPath', () => {
    it('normaliza a /card-images/{relativo}', () => {
      expect(publicCardImagesPath('/card-images/swsh3/a.png')).toBe(
        '/card-images/swsh3/a.png',
      );
      expect(publicCardImagesPath('../swsh3/a.png')).toBe(
        '/card-images/swsh3/a.png',
      );
    });
  });

  describe('isAcceptableCardImageBody', () => {
    it('acepta content-type imagen y rechaza oversized', () => {
      expect(isAcceptableCardImageBody(Buffer.alloc(16), 'image/png')).toBe(
        true,
      );
      expect(isAcceptableCardImageBody(Buffer.alloc(16), 'text/html')).toBe(
        false,
      );
    });
  });

  describe('mapWithConcurrency', () => {
    it('respeta el límite y conserva el orden', async () => {
      const seen: number[] = [];
      let running = 0;
      let maxRunning = 0;
      const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        seen.push(n);
        await new Promise((r) => setTimeout(r, 5));
        running -= 1;
        return n * 10;
      });
      expect(out).toEqual([10, 20, 30, 40, 50]);
      expect(maxRunning).toBeLessThanOrEqual(2);
      expect(seen).toHaveLength(5);
    });
  });
});
