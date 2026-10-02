import {
  buildCardLocaleFallbackChain,
  TCGDexService,
  TTL_CARD_NOT_FOUND_MS,
} from './tcgdex.service';
import type { SetNameHomologsService } from './set-name-homologs.service';
import type { LocalCardImagesService } from './local-card-images.service';

describe('TCGDexService.getCardExact (caché negativa, dedupe, timeout)', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  function makeService(): TCGDexService {
    const homologs = {
      getEnglishLabel: jest.fn().mockReturnValue(undefined),
    } as unknown as SetNameHomologsService;
    const localImages = {
      applyRemoteFallback: jest.fn(
        (
          _input: unknown,
          remote: { image: string; small: string; large: string },
        ) => remote,
      ),
    } as unknown as LocalCardImagesService;
    return new TCGDexService(homologs, localImages);
  }

  function jsonResponse(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  }

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('404 → undefined y no vuelve a llamar a la API (caché negativa)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, {}));
    const svc = makeService();
    await expect(svc.getCardExact('zz9-999', 'en')).resolves.toBeUndefined();
    await expect(svc.getCardExact('zz9-999', 'en')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('el 404 cacheado expira a los 20 minutos', async () => {
    expect(TTL_CARD_NOT_FOUND_MS).toBe(20 * 60 * 1000);
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    fetchMock.mockResolvedValue(jsonResponse(404, {}));
    const svc = makeService();
    await svc.getCardExact('zz9-998', 'en');
    now += TTL_CARD_NOT_FOUND_MS - 1;
    await svc.getCardExact('zz9-998', 'en');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 2;
    await svc.getCardExact('zz9-998', 'en');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('5xx o error de red no se cachean como inexistente', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(
        jsonResponse(200, { id: 'sv1-1', name: 'Pikachu', image: '' }),
      );
    const svc = makeService();
    await expect(svc.getCardExact('sv1-1', 'en')).resolves.toBeUndefined();
    await expect(svc.getCardExact('sv1-1', 'en')).resolves.toBeUndefined();
    const card = await svc.getCardExact('sv1-1', 'en');
    expect(card?.name).toBe('Pikachu');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('deduplica peticiones concurrentes idénticas y cachea el positivo', async () => {
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((r) => (resolveFetch = r)),
    );
    const svc = makeService();
    const a = svc.getCardExact('sv1-2', 'en');
    const b = svc.getCardExact('sv1-2', 'en');
    await new Promise((r) => setImmediate(r));
    resolveFetch(jsonResponse(200, { id: 'sv1-2', name: 'Raichu', image: '' }));
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra?.name).toBe('Raichu');
    expect(rb).toBe(ra);
    await svc.getCardExact('sv1-2', 'en');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('envía AbortSignal (timeout) en cada fetch', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, {}));
    const svc = makeService();
    await svc.getCardExact('zz9-1', 'en');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('buildCardLocaleFallbackChain', () => {
  it('keeps preferred locale first and adds regional fallbacks', () => {
    expect(buildCardLocaleFallbackChain('ja')).toEqual(['ja', 'zh-cn', 'en']);
    expect(buildCardLocaleFallbackChain('zh-cn')).toEqual([
      'zh-cn',
      'ja',
      'en',
    ]);
    expect(buildCardLocaleFallbackChain('en')).toEqual(['en', 'ja', 'zh-cn']);
    expect(buildCardLocaleFallbackChain('ko')).toEqual([
      'ko',
      'ja',
      'zh-cn',
      'en',
    ]);
    expect(buildCardLocaleFallbackChain('it')).toEqual([
      'it',
      'en',
      'ja',
      'zh-cn',
    ]);
    expect(buildCardLocaleFallbackChain('es')).toEqual([
      'es',
      'en',
      'ja',
      'zh-cn',
    ]);
  });
});
