import {
  aggregateSalesByVariant,
  buildBenchmarkRows,
  mergeStockByVariant,
  resolveBenchmarkHint,
} from './stock-pvp-benchmark.aggregate';

describe('stock-pvp-benchmark.aggregate', () => {
  it('agrega min/max ventas por variante y owner', () => {
    const map = aggregateSalesByVariant([
      {
        variant_key: 'sv1-1|en|',
        amount_cop: 5000,
        owner: 'pablo',
        created_at: new Date('2026-01-01'),
      },
      {
        variant_key: 'sv1-1|en|',
        amount_cop: 8000,
        owner: 'esteban',
        created_at: new Date('2026-02-01'),
      },
    ]);
    const s = map.get('sv1-1|en|');
    expect(s?.min).toBe(5000);
    expect(s?.max).toBe(8000);
    expect(s?.min_owner).toBe('pablo');
    expect(s?.max_owner).toBe('esteban');
    expect(s?.last_cop).toBe(8000);
  });

  it('merge stock suma unidades y costo', () => {
    const merged = mergeStockByVariant([
      {
        variant_key: 'a|en|',
        card_id: 'a',
        card_name: 'A',
        language: 'en',
        rareza: null,
        image_url: '',
        units: 1,
        card_cost: 1000,
        pvp_current: 2000,
      },
      {
        variant_key: 'a|en|',
        card_id: 'a',
        card_name: 'A',
        language: 'en',
        rareza: null,
        image_url: '',
        units: 2,
        card_cost: 2000,
        pvp_current: 2000,
      },
    ]);
    const row = merged.get('a|en|');
    expect(row?.qty_stock).toBe(3);
    expect(row?.cost_sum).toBe(5000);
  });

  it('hints de PVP vs ventas', () => {
    expect(
      resolveBenchmarkHint({
        pvp_current: 9000,
        sale_min: 5000,
        sale_max: 8000,
        sales_count: 2,
        stock_owner: 'esteban',
        pvp_pablo: null,
        pvp_esteban: 9000,
      }),
    ).toBe('above_max_sale');

    expect(
      resolveBenchmarkHint({
        pvp_current: 4000,
        sale_min: 5000,
        sale_max: 8000,
        sales_count: 2,
        stock_owner: 'esteban',
        pvp_pablo: null,
        pvp_esteban: 4000,
      }),
    ).toBe('below_min_sale');
  });

  it('buildBenchmarkRows incluye PVP de ambos owners', () => {
    const stockByVariant = mergeStockByVariant([
      {
        variant_key: 'c|es|holo',
        card_id: 'c',
        card_name: 'Carta',
        language: 'es',
        rareza: 'holo',
        image_url: 'x',
        units: 1,
        card_cost: 1000,
        pvp_current: 5500,
      },
    ]);
    const rows = buildBenchmarkRows({
      stockByVariant,
      salesByVariant: aggregateSalesByVariant([
        {
          variant_key: 'c|es|holo',
          amount_cop: 5500,
          owner: 'pablo',
          created_at: new Date(),
        },
      ]),
      pvpPablo: new Map([['c|es|holo', 5500]]),
      pvpEsteban: new Map([['c|es|holo', 5500]]),
      stock_owner: 'esteban',
      includePartnerPvp: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].pvp_pablo).toBe(5500);
    expect(rows[0].pvp_esteban).toBe(5500);
    expect(rows[0].hint).toBe('within_sale_range');
  });
});
