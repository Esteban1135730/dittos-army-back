import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

const DEFAULT_BASE = 'https://api.cardtrader.com/api/v2';
const REQUEST_TIMEOUT_MS = 25_000;
const POKEMON_GAME_ID = 5;

export type CardTraderAddress = {
  name: string;
  street: string;
  zip: string;
  city: string;
  state_or_province: string;
  country_code: string;
};

export type CardTraderCartAddPayload = {
  product_id: number;
  quantity: number;
  via_cardtrader_zero?: boolean;
  billing_address?: CardTraderAddress;
  shipping_address?: CardTraderAddress;
};

export type CardTraderCartRemovePayload = {
  product_id: number;
  quantity: number;
};

@Injectable()
export class CardTraderService {
  private readonly baseUrl: string;
  private readonly marketplaceProductCache = new Map<number, any>();

  constructor() {
    this.baseUrl = (
      process.env.CARDTRADER_API_BASE_URL ?? DEFAULT_BASE
    ).replace(/\/$/, '');
  }

  private getToken(): string {
    const t = process.env.CARDTRADER_API_TOKEN;
    if (!t?.trim()) {
      throw new ServiceUnavailableException(
        'CardTrader no está configurado: falta CARDTRADER_API_TOKEN en el servidor.',
      );
    }
    return t.trim();
  }

  private mergeDefaultAddresses<T extends CardTraderCartAddPayload>(
    body: T,
  ): T {
    const billing = this.parseEnvAddressJson('CARDTRADER_DEFAULT_BILLING_JSON');
    const shipping = this.parseEnvAddressJson(
      'CARDTRADER_DEFAULT_SHIPPING_JSON',
    );
    if (!billing && !shipping) {
      return body;
    }
    return {
      ...body,
      billing_address: body.billing_address ?? billing,
      shipping_address: body.shipping_address ?? shipping,
    };
  }

  private parseEnvAddressJson(envName: string): CardTraderAddress | undefined {
    const raw = process.env[envName];
    if (!raw?.trim()) return undefined;
    try {
      const v = JSON.parse(raw) as CardTraderAddress;
      if (
        typeof v?.name === 'string' &&
        typeof v.street === 'string' &&
        typeof v.zip === 'string' &&
        typeof v.city === 'string' &&
        typeof v.state_or_province === 'string' &&
        typeof v.country_code === 'string'
      ) {
        return v;
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }

  private async requestJson(
    method: 'GET' | 'POST',
    path: string,
    options?: { query?: Record<string, string | undefined>; body?: unknown },
  ): Promise<unknown> {
    const token = this.getToken();
    const url = new URL(`${this.baseUrl}/${path.replace(/^\//, '')}`);
    if (options?.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== '') {
          url.searchParams.set(k, v);
        }
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        body:
          method === 'POST' && options?.body !== undefined
            ? JSON.stringify(options.body)
            : undefined,
        signal: controller.signal,
      });

      const text = await res.text();
      let parsed: unknown = undefined;
      if (text) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          parsed = text;
        }
      }

      if (res.status === 429) {
        throw new HttpException(
          {
            message:
              'CardTrader: demasiadas peticiones. Espera unos segundos e inténtalo de nuevo.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      if (!res.ok) {
        const message =
          typeof parsed === 'object' &&
          parsed !== null &&
          'error' in parsed &&
          typeof (parsed as { error?: unknown }).error === 'string'
            ? (parsed as { error: string }).error
            : `CardTrader respondió ${res.status}`;
        const status =
          res.status >= 500
            ? HttpStatus.BAD_GATEWAY
            : res.status === 401 || res.status === 403
              ? HttpStatus.UNAUTHORIZED
              : HttpStatus.BAD_GATEWAY;
        throw new HttpException({ message }, status);
      }

      return parsed;
    } catch (e) {
      if (
        e instanceof HttpException ||
        e instanceof ServiceUnavailableException
      ) {
        throw e;
      }
      if (e instanceof Error && e.name === 'AbortError') {
        throw new HttpException(
          { message: 'CardTrader: tiempo de espera agotado.' },
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      throw new HttpException(
        { message: 'CardTrader: error de red o respuesta inválida.' },
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async getExpansions(
    _page?: number,
    _limit?: number,
    _gameId?: number,
  ): Promise<unknown> {
    // CardTrader no está aplicando consistentemente el filtro por query param game_id.
    // Traemos todas las expansiones y filtramos manualmente solo Pokémon (game_id = 5).
    const raw = await this.requestJson('GET', 'expansions');
    if (!Array.isArray(raw)) {
      return [];
    }

    const pokemonExpansions = raw.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const value = (item as { game_id?: unknown }).game_id;
      return typeof value === 'number' && value === POKEMON_GAME_ID;
    });

    return pokemonExpansions;
  }

  /** Descarga imagen de dominios CardTrader para el panel (PDF / caché local). */
  async proxyImage(
    sourceUrl: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      throw new HttpException(
        { message: 'URL de imagen inválida' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (parsed.protocol !== 'https:') {
      throw new HttpException(
        { message: 'Solo se permiten URLs https para imágenes' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('cardtrader')) {
      throw new HttpException(
        { message: 'Host de imagen no permitido' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const token = this.getToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(parsed.toString(), {
        method: 'GET',
        headers: {
          Accept: 'image/*,*/*',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new HttpException(
          { message: `No se pudo obtener la imagen (${res.status})` },
          res.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_GATEWAY,
        );
      }

      const contentType =
        res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0) {
        throw new HttpException(
          { message: 'Imagen vacía' },
          HttpStatus.BAD_GATEWAY,
        );
      }
      return { buffer, contentType };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { message: 'Error al descargar imagen de CardTrader' },
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async getBlueprintsExport(expansionId: number): Promise<unknown> {
    return this.requestJson('GET', 'blueprints/export', {
      query: { expansion_id: String(expansionId) },
    });
  }

  async getBlueprintById(blueprintId: number): Promise<unknown> {
    return this.requestJson('GET', `blueprints/${blueprintId}`);
  }

  async getMarketplaceProducts(params: {
    expansionId?: number;
    blueprintId?: number;
    foil?: boolean;
    language?: string;
  }): Promise<unknown> {
    const query: Record<string, string | undefined> = {};
    if (params.expansionId !== undefined) {
      query.expansion_id = String(params.expansionId);
    }
    if (params.blueprintId !== undefined) {
      query.blueprint_id = String(params.blueprintId);
    }
    if (params.foil !== undefined) {
      query.foil = params.foil ? 'true' : 'false';
    }
    if (params.language) {
      query.language = params.language.trim().toLowerCase();
    }
    const data = await this.requestJson('GET', 'marketplace/products', {
      query,
    });
    this.captureMarketplaceProductsIntoCache(data);
    return data;
  }

  private captureMarketplaceProductsIntoCache(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const groups = Object.values(data as Record<string, unknown>);
    for (const group of groups) {
      if (!Array.isArray(group)) continue;
      for (const product of group) {
        if (!product || typeof product !== 'object') continue;
        const id = (product as { id?: unknown }).id;
        if (typeof id !== 'number') continue;
        this.marketplaceProductCache.set(id, product);
      }
    }
  }

  async getShippingMethods(username: string): Promise<unknown> {
    return this.requestJson('GET', 'shipping_methods', {
      query: { username },
    });
  }

  async getCart(): Promise<unknown> {
    const cart = await this.requestJson('GET', 'cart');
    if (!cart || typeof cart !== 'object') return cart;

    const subcarts = (cart as any).subcarts;
    if (!Array.isArray(subcarts)) return cart;

    for (const subcart of subcarts) {
      const items = subcart?.cart_items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const pid = item?.product?.id;
        const resolvedId =
          typeof pid === 'number'
            ? pid
            : typeof pid === 'string'
              ? Number(pid)
              : NaN;
        if (!Number.isFinite(resolvedId)) continue;
        const cached = this.marketplaceProductCache.get(resolvedId);
        if (!cached) continue;

        // Adjuntamos meta sin romper el shape original de CardTrader.
        item.product = {
          ...(item.product ?? {}),
          marketplace_meta: {
            blueprint_id: cached.blueprint_id,
            expansion: cached.expansion,
            properties_hash: cached.properties_hash,
            user: cached.user,
            on_vacation: cached.on_vacation,
            bundle_size: cached.bundle_size,
            price: cached.price,
          },
        };
      }
    }

    return cart;
  }

  async addToCart(body: CardTraderCartAddPayload): Promise<unknown> {
    const merged = this.mergeDefaultAddresses(body);
    return this.requestJson('POST', 'cart/add', { body: merged });
  }

  async removeFromCart(body: CardTraderCartRemovePayload): Promise<unknown> {
    return this.requestJson('POST', 'cart/remove', { body });
  }

  async getOrders(params: {
    page?: number;
    limit?: number;
    from?: string;
    to?: string;
    fromId?: number;
    toId?: number;
    state?: string;
    orderAs?: 'buyer' | 'seller';
    sort?: string;
  }): Promise<unknown> {
    const query: Record<string, string | undefined> = {
      order_as: params.orderAs ?? 'buyer',
      sort: params.sort ?? 'date.desc',
    };
    if (params.page !== undefined) query.page = String(params.page);
    if (params.limit !== undefined) query.limit = String(params.limit);
    if (params.from) query.from = params.from;
    if (params.to) query.to = params.to;
    if (params.fromId !== undefined) query.from_id = String(params.fromId);
    if (params.toId !== undefined) query.to_id = String(params.toId);
    if (params.state?.trim()) query.state = params.state.trim();
    return this.requestJson('GET', 'orders', { query });
  }

  async getOrderById(orderId: number): Promise<unknown> {
    return this.requestJson('GET', `orders/${orderId}`);
  }

  async getCt0BoxItems(): Promise<unknown> {
    return this.requestJson('GET', 'ct0_box_items');
  }

  async getCt0BoxItemById(itemId: number): Promise<unknown> {
    return this.requestJson('GET', `ct0_box_items/${itemId}`);
  }
}
