import { NotFoundException } from '@nestjs/common';
import {
  IncomingHomologService,
  TCGDEX_CDN_MISS_TTL_MS,
  TCGDEX_CDN_NO_IMAGE_TTL_MS,
} from './incoming-homolog.service';
import { getCurrentOwner } from '../owner/owner-context';
import type { IncomingHomologUnit } from '../schema/incoming-homolog-session.schema';

describe('IncomingHomologService auto-verify / verifyUnit', () => {
  const sessionId = 'sess-1';
  const paidAt = new Date('2026-01-10T00:00:00Z');

  type Line = {
    _id: { toString(): string };
    lot_id: string;
    card_id: string;
    card_name: string;
    language: string;
    product_id?: number;
    blueprint_id?: number;
    remaining_quantity: number;
    quantity_ordered: number;
    fx_unit_price: number;
    fx_total_lot: number;
    unit_cost_cop: number;
  };

  let sessionState: {
    _id: { toString(): string };
    status: string;
    units: IncomingHomologUnit[];
  };
  let lines: Line[];

  const lot = {
    _id: { toString: () => 'lot-1' },
    owner: 'pablo',
    purchase_date: new Date('2026-01-01T00:00:00Z'),
    total_fx_cards_cost: 10,
    total_cop_cards_cost: 40000,
    real_fx_rate_cop: 4000,
    cards_cost_currency: 'USD',
  };

  const cloneSession = () => ({
    ...sessionState,
    units: sessionState.units.map((u) => ({ ...u })),
  });

  const sessionRepo = {
    findById: jest.fn(async () => cloneSession()),
    updateUnitBySentKey: jest.fn(
      async (_id: string, key: string, patch: Record<string, unknown>) => {
        sessionState.units = sessionState.units.map((u) =>
          u.sent_unit_key === key
            ? ({ ...u, ...patch } as IncomingHomologUnit)
            : u,
        );
        return cloneSession();
      },
    ),
    updateStatus: jest.fn(async (_id: string, status: string) => {
      sessionState.status = status;
      return cloneSession();
    }),
  };

  const onlyPablo = <T>(value: T, empty: T): T =>
    getCurrentOwner() === 'pablo' ? value : empty;

  const transitLineRepo = {
    findMissingProductIdWithCt0ItemId: jest.fn(async () => []),
    findByRemainingQuantityGreaterThanZero: jest.fn(async () =>
      lines.map((l) => ({ ...l })),
    ),
    findByRemainingQuantityGreaterThanZeroLean: jest.fn(async () =>
      onlyPablo(
        lines.map((l) => ({ ...l })),
        [],
      ),
    ),
    findById: jest.fn(async (id: string) =>
      onlyPablo(lines.find((l) => l._id.toString() === id) ?? null, null),
    ),
    findByLotIdsLean: jest.fn(async (ids: string[]) =>
      lines.filter((l) => ids.includes(l.lot_id)),
    ),
  };

  const transitLotRepo = {
    findById: jest.fn(async (id: string) =>
      onlyPablo(id === 'lot-1' ? lot : null, null),
    ),
    findByIds: jest.fn(async (ids: string[]) =>
      onlyPablo(ids.includes('lot-1') ? [lot] : [], []),
    ),
    findOpenLots: jest.fn(async () => onlyPablo([lot], [])),
  };

  function makeService() {
    return new IncomingHomologService(
      {} as any,
      { findByUnitKeys: jest.fn(async () => []) } as any,
      sessionRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      transitLineRepo as any,
      transitLotRepo as any,
      {} as any,
    );
  }

  function unit(
    key: string,
    extra: Partial<IncomingHomologUnit>,
  ): IncomingHomologUnit {
    return {
      sent_unit_key: key,
      status: 'pending',
      unit_price_fx: 1,
      price_currency: 'USD',
      paid_at: paidAt,
      ...extra,
    } as IncomingHomologUnit;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    sessionState = {
      _id: { toString: () => sessionId },
      status: 'in_progress',
      units: [
        unit('u1', { product_id: 100 }),
        unit('u2', { product_id: 100 }),
        unit('u3', { blueprint_id: 7 }),
        unit('u4', { product_id: 999 }),
      ],
    };
    lines = [
      {
        _id: { toString: () => 'tl-1' },
        lot_id: 'lot-1',
        card_id: 'sv1-1',
        card_name: 'Pikachu',
        language: 'EN',
        product_id: 100,
        remaining_quantity: 2,
        quantity_ordered: 2,
        fx_unit_price: 1,
        fx_total_lot: 2,
        unit_cost_cop: 4000,
      },
      {
        _id: { toString: () => 'tl-2' },
        lot_id: 'lot-1',
        card_id: 'sv1-2',
        card_name: 'Raichu',
        language: 'EN',
        blueprint_id: 7,
        remaining_quantity: 1,
        quantity_ordered: 1,
        fx_unit_price: 1,
        fx_total_lot: 1,
        unit_cost_cop: 4000,
      },
    ];
  });

  it('autoVerifyExact verifica varias unidades y reconstruye panel/resumen una sola vez', async () => {
    const service = makeService();
    const panelSpy = jest.spyOn(service as any, 'loadPanelItems');
    const summarySpy = jest.spyOn(service as any, 'loadBatchesSummary');

    const result = await service.autoVerifyExact(sessionId);

    expect(result.auto_verified).toBe(3);
    expect(result.by_product_id).toBe(2);
    expect(result.by_blueprint_id).toBe(1);
    expect(result.product_ids_backfilled).toBe(0);

    const byKey = new Map(sessionState.units.map((u) => [u.sent_unit_key, u]));
    expect(byKey.get('u1')).toMatchObject({
      status: 'verified',
      transit_line_id: 'tl-1',
      transit_lot_id: 'lot-1',
      unit_cost_cop: 4000,
      match_score: 0,
    });
    expect(byKey.get('u2')).toMatchObject({
      status: 'verified',
      transit_line_id: 'tl-1',
    });
    expect(byKey.get('u3')).toMatchObject({
      status: 'verified',
      transit_line_id: 'tl-2',
    });
    expect(byKey.get('u4')?.status).toBe('pending');
    expect(sessionRepo.updateUnitBySentKey).toHaveBeenCalledTimes(3);

    expect(panelSpy).toHaveBeenCalledTimes(1);
    expect(summarySpy).toHaveBeenCalledTimes(1);
    // Una consulta por owner (5) solo en la reconstrucción final.
    expect(
      transitLineRepo.findByRemainingQuantityGreaterThanZeroLean,
    ).toHaveBeenCalledTimes(5);
    expect(transitLotRepo.findOpenLots).toHaveBeenCalledTimes(5);

    expect(result.panel_items).toEqual([
      expect.objectContaining({
        transit_line_id: 'tl-1',
        assigned_in_session: 2,
        available_in_session: 0,
        owner: 'pablo',
        lot_purchase_date: lot.purchase_date,
      }),
      expect.objectContaining({
        transit_line_id: 'tl-2',
        assigned_in_session: 1,
        available_in_session: 0,
        owner: 'pablo',
      }),
    ]);
    expect(result.batches_summary).toEqual([
      {
        lot_id: 'lot-1',
        purchase_date: lot.purchase_date,
        total_fx_cards_cost: 10,
        total_cop_cards_cost: 40000,
        real_fx_rate_cop: 4000,
        cards_cost_currency: 'USD',
        remaining_total_quantity: 3,
        open_items_count: 2,
      },
    ]);
    expect(result.session.summary).toEqual({
      total: 4,
      pending: 1,
      verified: 3,
      novedad: 0,
    });
  });

  it('verifyUnit devuelve sesión + panel + resumen (cada uno construido una vez)', async () => {
    const service = makeService();
    const panelSpy = jest.spyOn(service as any, 'loadPanelItems');
    const summarySpy = jest.spyOn(service as any, 'loadBatchesSummary');

    const result = await service.verifyUnit(sessionId, 'u1', 'tl-1', 0.9);

    expect(sessionState.units[0]).toMatchObject({
      status: 'verified',
      transit_line_id: 'tl-1',
      match_score: 0.9,
    });
    expect(panelSpy).toHaveBeenCalledTimes(1);
    expect(summarySpy).toHaveBeenCalledTimes(1);
    expect(result.panel_items).toHaveLength(2);
    expect(result.batches_summary).toHaveLength(1);
    expect(result.session.summary.verified).toBe(1);
  });

  it('busca la línea en todos los owners y respeta el orden (primer owner con resultado)', async () => {
    const owners: string[] = [];
    transitLineRepo.findById.mockImplementation(async (id: string) => {
      const owner = getCurrentOwner();
      owners.push(owner);
      if (owner === 'tefa') throw new Error('tefa db down');
      if (owner === 'esteban' || owner === 'ali') {
        return lines.find((l) => l._id.toString() === id) ?? null;
      }
      return null;
    });

    const result = await makeService().verifyUnit(sessionId, 'u1', 'tl-1');

    expect(owners.sort()).toEqual(
      ['ali', 'esteban', 'pablo', 'pablo-magic', 'tefa'].sort(),
    );
    expect(result.session.summary.verified).toBe(1);
  });

  it('propaga el error de un owner previo al primer resultado', async () => {
    transitLineRepo.findById.mockImplementation(async (id: string) => {
      const owner = getCurrentOwner();
      if (owner === 'pablo') throw new Error('pablo db down');
      return lines.find((l) => l._id.toString() === id) ?? null;
    });

    await expect(
      makeService().verifyUnit(sessionId, 'u1', 'tl-1'),
    ).rejects.toThrow('pablo db down');
  });

  describe('fetchTcgdexCdnImageUrl (caché + dedupe)', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('cachea 404 y aciertos, deduplica concurrentes y no cachea 5xx', async () => {
      const fetchMock = jest.fn(async (url: string) => {
        if (url.includes('missing')) return { ok: false, status: 404 };
        if (url.includes('flaky')) return { ok: false, status: 503 };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            image: 'https://assets.tcgdex.net/en/sv/sv1/1',
          }),
        };
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      const service = makeService() as any;

      const [a, b] = await Promise.all([
        service.fetchTcgdexCdnImageUrl('sv1-1', 'en'),
        service.fetchTcgdexCdnImageUrl('sv1-1', 'EN'),
      ]);
      expect(a).toBe(b);
      expect(a).toContain('assets.tcgdex.net');
      await service.fetchTcgdexCdnImageUrl('sv1-1', 'en');

      expect(await service.fetchTcgdexCdnImageUrl('missing', 'en')).toBe('');
      expect(await service.fetchTcgdexCdnImageUrl('missing', 'en')).toBe('');
      expect(await service.fetchTcgdexCdnImageUrl('flaky', 'en')).toBe('');
      expect(await service.fetchTcgdexCdnImageUrl('flaky', 'en')).toBe('');

      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.filter((u) => u.includes('sv1-1'))).toHaveLength(1);
      expect(calls.filter((u) => u.includes('missing'))).toHaveLength(1);
      expect(calls.filter((u) => u.includes('flaky'))).toHaveLength(2);
      expect(
        (fetchMock.mock.calls[0] as unknown[])[1] as { signal?: unknown },
      ).toEqual(expect.objectContaining({ signal: expect.anything() }));
    });

    it('negativos expiran: 404 a los 20 min, carta sin imagen a los 5 min', async () => {
      expect(TCGDEX_CDN_MISS_TTL_MS).toBe(20 * 60 * 1000);
      expect(TCGDEX_CDN_NO_IMAGE_TTL_MS).toBe(5 * 60 * 1000);
      let now = 1_000_000;
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
      try {
        const fetchMock = jest.fn(async (url: string) => {
          if (url.includes('missing')) return { ok: false, status: 404 };
          return { ok: true, status: 200, json: async () => ({ image: '' }) };
        });
        global.fetch = fetchMock as unknown as typeof fetch;
        const service = makeService() as any;
        const count = (part: string) =>
          fetchMock.mock.calls.filter((c) => String(c[0]).includes(part))
            .length;

        await service.fetchTcgdexCdnImageUrl('missing', 'en');
        await service.fetchTcgdexCdnImageUrl('noimg', 'en');

        now += TCGDEX_CDN_NO_IMAGE_TTL_MS + 1;
        await service.fetchTcgdexCdnImageUrl('missing', 'en');
        await service.fetchTcgdexCdnImageUrl('noimg', 'en');
        expect(count('missing')).toBe(1);
        expect(count('noimg')).toBe(2);

        now += TCGDEX_CDN_MISS_TTL_MS;
        await service.fetchTcgdexCdnImageUrl('missing', 'en');
        expect(count('missing')).toBe(2);
      } finally {
        nowSpy.mockRestore();
      }
    });
  });

  it('sin línea en ningún owner lanza NotFound', async () => {
    transitLineRepo.findById.mockResolvedValue(null);
    await expect(
      makeService().verifyUnit(sessionId, 'u1', 'tl-x'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
