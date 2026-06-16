import { normalizeStockLanguage } from './stock-language';
import { resolveHomologNovedadUnitCostCop } from './homolog-novedad-pricing';

describe('stock-language', () => {
  it('normaliza jp y kr a ja y ko', () => {
    expect(normalizeStockLanguage('JP')).toBe('ja');
    expect(normalizeStockLanguage('korean')).toBe('ko');
    expect(normalizeStockLanguage('zh-CN')).toBe('zh-cn');
  });
});

describe('homolog-novedad-pricing', () => {
  it('calcula COP con TRM USD', () => {
    const cop = resolveHomologNovedadUnitCostCop(
      {
        unit_price_fx: 2,
        price_currency: 'USD',
        unit_cost_cop: null,
      },
      { usd_to_cop: 4000, euro_to_cop: 4500 },
    );
    expect(cop).toBe(8000);
  });
});
