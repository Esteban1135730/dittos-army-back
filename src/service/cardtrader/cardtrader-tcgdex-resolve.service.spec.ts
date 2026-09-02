import { CardTraderTcgdexResolveService } from './cardtrader-tcgdex-resolve.service';

describe('CardTraderTcgdexResolveService', () => {
  let service: CardTraderTcgdexResolveService;

  beforeEach(() => {
    service = new CardTraderTcgdexResolveService();
  });

  it('resuelve Lost Origin #TG23 → swsh11.5tg-TG23', async () => {
    const byName = await service.resolveTcgdexCardId({
      expansionName: 'Lost Origin',
      collectorNumber: 'TG23',
      language: 'it',
    });
    expect(byName.tcgdex_set_id).toBe('swsh11.5tg');
    expect(byName.tcgdex_card_id).toBe('swsh11.5tg-TG23');
    expect(byName.error).toBeNull();

    const regular = await service.resolveTcgdexCardId({
      expansionName: 'Lost Origin',
      collectorNumber: '075',
      language: 'it',
    });
    expect(regular.tcgdex_card_id).toBe('swsh11-75');
  });

  it('resuelve Crown Zenith #GG64 → swsh12.5gg-GG64', async () => {
    const hit = await service.resolveTcgdexCardId({
      expansionName: 'Crown Zenith',
      collectorNumber: 'GG64',
      language: 'it',
    });
    expect(hit.tcgdex_set_id).toBe('swsh12.5gg');
    expect(hit.tcgdex_card_id).toBe('swsh12.5gg-GG64');
    expect(hit.error).toBeNull();
  });

  it('resuelve EX Dragon Frontiers (it) #047 → ex15-47', async () => {
    const byName = await service.resolveTcgdexCardId({
      expansionName: 'EX Dragon Frontiers',
      collectorNumber: '047',
      language: 'it',
    });
    expect(byName.tcgdex_set_id).toBe('ex15');
    expect(byName.tcgdex_card_id).toBe('ex15-47');
    expect(byName.error).toBeNull();

    const byId = await service.resolveTcgdexCardId({
      expansionId: 1514,
      collectorNumber: '047',
      language: 'it',
    });
    expect(byId.tcgdex_card_id).toBe('ex15-47');
    expect(byId.error).toBeNull();
  });

  it('resuelve tcgdex_card_id por nombre de expansión y collector_number', async () => {
    const result = await service.resolveTcgdexCardId({
      expansionName: 'Base Set',
      collectorNumber: '004',
    });
    expect(result.tcgdex_set_id).toBe('base1');
    expect(result.tcgdex_card_id).toBe('base1-4');
    expect(result.error).toBeNull();
  });

  it('resuelve por expansion_id de CardTrader', async () => {
    const result = await service.resolveTcgdexCardId({
      expansionId: 1472,
      collectorNumber: '58',
    });
    expect(result.tcgdex_card_id).toBe('base1-58');
    expect(result.error).toBeNull();
  });

  it('devuelve error si falta collector_number', async () => {
    const result = await service.resolveTcgdexCardId({
      expansionName: 'Base Set',
    });
    expect(result.tcgdex_card_id).toBeNull();
    expect(result.error).toContain('collector_number');
  });

  it('resuelve Prismatic Evolutions Poké Ball RH por expansion_id', async () => {
    const result = await service.resolveTcgdexCardId({
      expansionId: 4053,
      collectorNumber: '071',
    });
    expect(result.tcgdex_card_id).toBe('sv08.5-071');
    expect(result.error).toBeNull();
  });

  it('resuelve Inferno X por expansion_id con localId de 3 dígitos', async () => {
    const result = await service.resolveTcgdexCardId({
      expansionId: 4313,
      collectorNumber: '083',
      language: 'jp',
    });
    expect(result.tcgdex_card_id).toBe('M2-083');
    expect(result.tcgdex_set_id).toBe('M2');
    expect(result.locale).toBe('ja');
    expect(result.error).toBeNull();
  });

  it('resuelve SV Black Star Promos EN → svp (no Svpromo JA)', async () => {
    const byName = await service.resolveTcgdexCardId({
      expansionName: 'SV Black Star Promos',
      collectorNumber: '145',
      language: 'en',
    });
    expect(byName.tcgdex_set_id).toBe('svp');
    expect(byName.tcgdex_card_id).toBe('svp-145');

    const byId = await service.resolveTcgdexCardId({
      expansionId: 3221,
      collectorNumber: '012',
      language: 'en',
    });
    expect(byId.tcgdex_set_id).toBe('svp');
    expect(byId.tcgdex_card_id).toBe('svp-12');
  });

  it('resuelve CSV5 zh-cn → CSV5C-134', async () => {
    const result = await service.resolveTcgdexCardId({
      expansionName: 'CSV5: Dark Crystal Blaze',
      collectorNumber: '134',
      language: 'zh',
    });
    expect(result.tcgdex_set_id).toBe('CSV5C');
    expect(result.tcgdex_card_id).toBe('CSV5C-134');
  });

  it('resuelve Gem Pack CBB1C con collector 03-06/09', async () => {
    const result = await service.resolveTcgdexCardId({
      expansionName: 'Gem Pack Vol.1',
      collectorNumber: '03-06/09',
      language: 'zh',
    });
    expect(result.tcgdex_set_id).toBe('CBB1C');
    expect(result.tcgdex_card_id).toBe('CBB1C-03-06_09');
  });

  it('resuelve sets japoneses por alias CardTrader en inglés', async () => {
    const result = await service.resolveTcgdexCardId({
      expansionName: 'MEGA Dream ex',
      collectorNumber: '211',
      language: 'jp',
    });
    expect(result.tcgdex_set_id).toBe('M2a');
    expect(result.tcgdex_card_id).toBe('M2a-211');
    expect(result.error).toBeNull();
  });

  it('desambigua M2a-205 Mimikyu IR vs accesorios con blueprint_id', async () => {
    const tcg = {
      getCardExact: jest.fn(async (id: string) => {
        if (id === 'M2a-205_360075') {
          return { id: 'M2a-205_360075', name: "Team Rocket's Mimikyu" };
        }
        return undefined;
      }),
    };
    const withProbe = new CardTraderTcgdexResolveService(
      tcg as never,
    );

    const mimikyu = await withProbe.resolveTcgdexCardId({
      expansionName: 'MEGA Dream ex',
      collectorNumber: '205',
      language: 'zh',
      blueprint_id: 360075,
    });
    expect(mimikyu.tcgdex_card_id).toBe('M2a-205_360075');
    expect(mimikyu.tcgdex_set_id).toBe('M2a');

    const sleeves = await withProbe.resolveTcgdexCardId({
      expansionName: 'MEGA Dream ex',
      collectorNumber: '205',
      language: 'zh',
      blueprint_id: 359507,
    });
    expect(sleeves.tcgdex_card_id).toBe('M2a-205');

    const noBlueprint = await service.resolveTcgdexCardId({
      expansionName: 'MEGA Dream ex',
      collectorNumber: '205',
      language: 'zh',
    });
    expect(noBlueprint.tcgdex_card_id).toBe('M2a-205');
  });

  it('resuelve Ancient Mew Miscellaneous Promos #011 → miscp-001', async () => {
    const byName = await service.resolveTcgdexCardId({
      expansionName: 'Miscellaneous Promos',
      collectorNumber: '011',
      language: 'en',
    });
    expect(byName.tcgdex_set_id).toBe('miscp');
    expect(byName.tcgdex_card_id).toBe('miscp-001');
    expect(byName.error).toBeNull();

    const byBlueprint = await service.resolveTcgdexCardId({
      expansionName: 'Miscellaneous Promos',
      collectorNumber: '011',
      language: 'en',
      blueprint_id: 152261,
    });
    expect(byBlueprint.tcgdex_card_id).toBe('miscp-001');

    const otherPromo = await service.resolveTcgdexCardId({
      expansionName: 'Miscellaneous Promos',
      collectorNumber: '001',
      language: 'en',
    });
    expect(otherPromo.tcgdex_card_id).not.toBe('miscp-001');
  });

  it('devuelve error si expansión no está homologada', async () => {
    const result = await service.resolveTcgdexCardId({
      expansionName: 'Expansion Inventada XYZ',
      collectorNumber: '1',
    });
    expect(result.tcgdex_card_id).toBeNull();
    expect(result.error).toContain('homologación');
  });

  it('expone cobertura amplia del índice de homologación', () => {
    const stats = service.getIndexStats();
    expect(stats.expansionNames).toBeGreaterThan(500);
    expect(stats.localeAliases).toBeGreaterThan(500);
    expect(stats.expansionIds).toBeGreaterThan(200);
  });

  it('resuelve set por nombre japonés del catálogo', async () => {
    const result = await service.resolveTcgdexCardId({
      expansionName: 'メガロキャノン',
      collectorNumber: '001',
      language: 'jp',
    });
    expect(result.tcgdex_set_id).toBe('BW9');
    expect(result.tcgdex_card_id).toBe('BW9-001');
  });

  it('resuelve Surging Sparks JP vía set_locale_map', async () => {
    const result = await service.resolveTcgdexCardId({
      expansionName: 'Surging Sparks',
      collectorNumber: '108',
      language: 'jp',
    });
    expect(result.tcgdex_set_id).toBe('SV8');
    expect(result.tcgdex_card_id).toBe('SV8-108');
  });

  it('resuelve CSM2.5 Striking Competition zh (código CT csm25)', async () => {
    const result = await service.resolveTcgdexCardId({
      expansionName: 'CSM2.5: Striking Competition',
      collectorNumber: '044',
      language: 'zh',
    });
    expect(result.tcgdex_set_id).toBe('CSM2.5');
    expect(result.tcgdex_card_id).toBe('CSM2.5-044');
    expect(result.error).toBeNull();
  });

  it('resuelve CSM2a / CSM2c zh con casing canónico', async () => {
    const a = await service.resolveTcgdexCardId({
      expansionName: 'CSM2a: Shining Synergy - Shower',
      collectorNumber: '112',
      language: 'zh',
    });
    expect(a.tcgdex_set_id).toBe('CSM2a');
    expect(a.tcgdex_card_id).toBe('CSM2a-112');

    const c = await service.resolveTcgdexCardId({
      expansionName: 'CSM2c: Shining Synergy - Summon',
      collectorNumber: '046',
      language: 'zh',
    });
    expect(c.tcgdex_set_id).toBe('CSM2c');
    expect(c.tcgdex_card_id).toBe('CSM2c-046');
  });

  it('resolveTcgdexCardIdBatch resuelve múltiples líneas', async () => {
    const results = await service.resolveTcgdexCardIdBatch([
      { expansionName: 'Base Set', collectorNumber: '004' },
      { expansionName: 'Expansion Inventada XYZ', collectorNumber: '1' },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].tcgdex_card_id).toBe('base1-4');
    expect(results[1].tcgdex_card_id).toBeNull();
  });
});
