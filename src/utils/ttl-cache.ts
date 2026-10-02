type Entry<V> = { value: V; expiresAt: number };

/**
 * Caché en memoria con TTL por entrada y tamaño máximo (expulsa la entrada
 * usada menos recientemente). Incluye deduplicación de promesas en vuelo por
 * clave para `getOrLoad`.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly inFlight = new Map<string, Promise<V>>();
  /** Se incrementa en `clear()`: las cargas iniciadas antes no se guardan. */
  private generation = 0;

  constructor(
    private readonly opts: {
      ttlMs: number;
      maxEntries: number;
      now?: () => number;
    },
  ) {}

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  get size(): number {
    return this.entries.size;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  get(key: string): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, ttlMs?: number): void {
    this.entries.delete(key);
    this.entries.set(key, {
      value,
      expiresAt: this.now() + (ttlMs ?? this.opts.ttlMs),
    });
    while (this.entries.size > Math.max(1, this.opts.maxEntries)) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.generation += 1;
    this.entries.clear();
    this.inFlight.clear();
  }

  /**
   * Devuelve el valor cacheado o ejecuta `loader` una sola vez por clave aunque
   * haya llamadas concurrentes. Los rechazos no se cachean.
   * `shouldCache` permite omitir el guardado de ciertos resultados.
   */
  async getOrLoad(
    key: string,
    loader: () => Promise<V>,
    shouldCache: (value: V) => boolean = () => true,
  ): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const generation = this.generation;
    const p: Promise<V> = Promise.resolve()
      .then(loader)
      .then((value) => {
        if (generation === this.generation && shouldCache(value)) {
          this.set(key, value);
        }
        return value;
      })
      .finally(() => {
        if (this.inFlight.get(key) === p) this.inFlight.delete(key);
      });
    this.inFlight.set(key, p);
    return p;
  }
}

/** Deduplica promesas concurrentes con la misma clave (sin cachear el resultado). */
export class InFlightDedupe<V> {
  private readonly pending = new Map<string, Promise<V>>();

  run(key: string, fn: () => Promise<V>): Promise<V> {
    const existing = this.pending.get(key);
    if (existing) return existing;
    const p = Promise.resolve()
      .then(fn)
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, p);
    return p;
  }
}
