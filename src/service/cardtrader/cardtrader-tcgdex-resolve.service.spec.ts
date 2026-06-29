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

  it('resuelve Prismatic Evolutions Poké Ball RH por expansion_id', () => {
    const result = service.resolveTcgdexCardId({
      expansionId: 4053,
      collectorNumber: '071',
    });
    expect(result.tcgdex_card_id).toBe('sv08.5-71');
    expect(result.error).toBeNull();
  });

  it('resuelve Inferno X por expansion_id', () => {
    const result = service.resolveTcgdexCardId({
      expansionId: 4313,
      collectorNumber: '083',
    });
    expect(result.tcgdex_card_id).toBe('M2-83');
    expect(result.error).toBeNull();
  });
  it('devuelve error si expansión no está homologada', () => {
    const result = service.resolveTcgdexCardId({
      expansionName: 'Expansion Inventada XYZ',
      collectorNumber: '1',
    });
    expect(result.tcgdex_card_id).toBeNull();
    expect(result.error).toContain('homologación');
  });
});
