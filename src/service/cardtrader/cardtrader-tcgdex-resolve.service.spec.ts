import { CardTraderTcgdexResolveService } from './cardtrader-tcgdex-resolve.service';

describe('CardTraderTcgdexResolveService', () => {
  let service: CardTraderTcgdexResolveService;

  beforeEach(() => {
    service = new CardTraderTcgdexResolveService();
  });

  it('resuelve tcgdex_card_id por nombre de expansión y collector_number', () => {
    const result = service.resolveTcgdexCardId({
      expansionName: 'Base Set',
      collectorNumber: '004',
    });
    expect(result.tcgdex_set_id).toBe('base1');
    expect(result.tcgdex_card_id).toBe('base1-4');
    expect(result.error).toBeNull();
  });

  it('resuelve por expansion_id de CardTrader', () => {
    const result = service.resolveTcgdexCardId({
      expansionId: 1472,
      collectorNumber: '58',
    });
    expect(result.tcgdex_card_id).toBe('base1-58');
    expect(result.error).toBeNull();
  });

  it('devuelve error si falta collector_number', () => {
    const result = service.resolveTcgdexCardId({
      expansionName: 'Base Set',
    });
    expect(result.tcgdex_card_id).toBeNull();
    expect(result.error).toContain('collector_number');
  });

  it('resolveTcgdexCardIdBatch resuelve múltiples líneas', () => {
    const results = service.resolveTcgdexCardIdBatch([
      { expansionName: 'Base Set', collectorNumber: '004' },
      { expansionName: 'Expansion Inventada XYZ', collectorNumber: '1' },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].tcgdex_card_id).toBe('base1-4');
    expect(results[1].tcgdex_card_id).toBeNull();
  });
});
