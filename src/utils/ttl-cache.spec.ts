import { InFlightDedupe, TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  it('expira entradas pasado el TTL', () => {
    let now = 1000;
    const cache = new TtlCache<number>({
      ttlMs: 100,
      maxEntries: 10,
      now: () => now,
    });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    now += 101;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('respeta TTL por entrada', () => {
    let now = 0;
    const cache = new TtlCache<string>({
      ttlMs: 1000,
      maxEntries: 10,
      now: () => now,
    });
    cache.set('short', 'x', 10);
    cache.set('long', 'y');
    now = 50;
    expect(cache.get('short')).toBeUndefined();
    expect(cache.get('long')).toBe('y');
  });

  it('expulsa la entrada menos usada al superar maxEntries', () => {
    const cache = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('getOrLoad deduplica cargas concurrentes y cachea', async () => {
    const cache = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 10 });
    const loader = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    const [a, b] = await Promise.all([
      cache.getOrLoad('k', loader),
      cache.getOrLoad('k', loader),
    ]);
    expect([a, b]).toEqual([42, 42]);
    await expect(cache.getOrLoad('k', loader)).resolves.toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('getOrLoad no cachea rechazos ni valores excluidos por shouldCache', async () => {
    const cache = new TtlCache<number | null>({
      ttlMs: 10_000,
      maxEntries: 10,
    });
    const failing = jest.fn(() => Promise.reject(new Error('x')));
    await expect(cache.getOrLoad('e', failing)).rejects.toThrow('x');
    await expect(cache.getOrLoad('e', failing)).rejects.toThrow('x');
    expect(failing).toHaveBeenCalledTimes(2);

    const nullLoader = jest.fn(async () => null);
    await cache.getOrLoad('n', nullLoader, (v) => v != null);
    await cache.getOrLoad('n', nullLoader, (v) => v != null);
    expect(nullLoader).toHaveBeenCalledTimes(2);
  });

  it('getOrLoad libera la clave si el loader lanza de forma síncrona', async () => {
    const cache = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 10 });
    const sync = (): Promise<number> => {
      throw new Error('sync');
    };
    await expect(cache.getOrLoad('s', sync)).rejects.toThrow('sync');
    await expect(cache.getOrLoad('s', async () => 7)).resolves.toBe(7);
  });

  it('clear() descarta cargas en vuelo iniciadas antes (no guarda datos viejos)', async () => {
    const cache = new TtlCache<string>({ ttlMs: 10_000, maxEntries: 10 });
    let release!: (v: string) => void;
    const stale = cache.getOrLoad(
      'k',
      () => new Promise<string>((r) => (release = r)),
    );
    await Promise.resolve();
    cache.clear();
    const fresh = cache.getOrLoad('k', async () => 'nuevo');
    release('viejo');
    await expect(stale).resolves.toBe('viejo');
    await expect(fresh).resolves.toBe('nuevo');
    expect(cache.get('k')).toBe('nuevo');
  });
});

describe('InFlightDedupe', () => {
  it('comparte la promesa mientras está en vuelo y luego vuelve a ejecutar', async () => {
    const dedupe = new InFlightDedupe<number>();
    let calls = 0;
    const fn = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 2));
      return calls;
    };
    const [a, b] = await Promise.all([
      dedupe.run('k', fn),
      dedupe.run('k', fn),
    ]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    await expect(dedupe.run('k', fn)).resolves.toBe(2);
  });
});
