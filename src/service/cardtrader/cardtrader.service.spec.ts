import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { CardTraderService } from './cardtrader.service';

describe('CardTraderService', () => {
  let service: CardTraderService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.CARDTRADER_API_TOKEN = 'test-token';
    service = new CardTraderService();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    delete process.env.CARDTRADER_API_TOKEN;
    fetchSpy.mockRestore();
  });

  it('sin token lanza ServiceUnavailableException', async () => {
    delete process.env.CARDTRADER_API_TOKEN;
    const s = new CardTraderService();
    await expect(s.getCart()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('getCart reenvía Authorization Bearer', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"id": 99}',
    });
    const data = await service.getCart();
    expect(data).toEqual({ id: 99 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-token',
    });
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/cart');
  });

  it('429 upstream se mapea a HttpException 429', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"error":"Too many requests"}',
    });
    let err: unknown;
    try {
      await service.getBlueprintsExport(1);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
  });

  it('addToCart POST incluye cuerpo JSON', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    });
    await service.addToCart({
      product_id: 10,
      quantity: 2,
      via_cardtrader_zero: true,
    });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(
      JSON.stringify({
        product_id: 10,
        quantity: 2,
        via_cardtrader_zero: true,
      }),
    );
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/cart/add');
  });

  it('proxyImage rechaza hosts no CardTrader', async () => {
    await expect(
      service.proxyImage('https://evil.example/x.png'),
    ).rejects.toBeInstanceOf(HttpException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('proxyImage descarga bytes de URL CardTrader', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => (h === 'content-type' ? 'image/png' : null),
      },
      arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer,
    });
    const result = await service.proxyImage(
      'https://cdn.cardtrader.com/test.png',
    );
    expect(result.contentType).toBe('image/png');
    expect(result.buffer.length).toBe(4);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      'https://cdn.cardtrader.com/test.png',
    );
  });

  it('getMarketplaceProducts arma query blueprint_id', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    });
    await service.getMarketplaceProducts({ blueprintId: 327, language: 'en' });
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain('blueprint_id=327');
    expect(url).toContain('language=en');
  });

  it('getOrders usa order_as=buyer por defecto', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '[]',
    });
    await service.getOrders({});
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain('/orders');
    expect(url).toContain('order_as=buyer');
    expect(url).toContain('sort=date.desc');
  });

  it('getOrderById consulta /orders/:id', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"id":123}',
    });
    const data = await service.getOrderById(123);
    expect(data).toEqual({ id: 123 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/orders/123');
  });

  it('getCt0BoxItems consulta /ct0_box_items', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '[]',
    });
    await service.getCt0BoxItems();
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/ct0_box_items');
  });

  it('getBlueprintById consulta /blueprints/:id', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"id":317780}',
    });
    await service.getBlueprintById(317780);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/blueprints/317780');
  });
});
