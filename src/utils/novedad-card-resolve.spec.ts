import {
  blueprintIdFromTemporaryCardId,
  buildNovedadTcgdexResolveInput,
  isTemporaryNovedadCardId,
  readBlueprintImageUrl,
  readCollectorNumberFromBlueprint,
  readExpansionIdFromBlueprint,
} from './novedad-card-resolve';

describe('novedad-card-resolve', () => {
  it('detecta IDs temporales de novedad', () => {
    expect(isTemporaryNovedadCardId('ct-bp-317780')).toBe(true);
    expect(isTemporaryNovedadCardId('novedad-order-1-2#0')).toBe(true);
    expect(isTemporaryNovedadCardId('sv03-86')).toBe(false);
  });

  it('extrae blueprint_id de ct-bp-*', () => {
    expect(blueprintIdFromTemporaryCardId('ct-bp-317780')).toBe(317780);
    expect(blueprintIdFromTemporaryCardId('sv03-86')).toBeNull();
  });

  it('lee collector_number y expansion_id del blueprint', () => {
    const bp = {
      expansion_id: 4312,
      fixed_properties: { collector_number: '004' },
      image_url: '/img/preview_foo.jpg',
    };
    expect(readCollectorNumberFromBlueprint(bp)).toBe('004');
    expect(readExpansionIdFromBlueprint(bp)).toBe(4312);
    expect(readBlueprintImageUrl(bp)).toContain('show_foo.jpg');
  });

  it('lee collector_number del campo version del blueprint', () => {
    expect(
      readCollectorNumberFromBlueprint({
        version: 'Poké Ball Reverse Holo | 071/131',
      }),
    ).toBe('071');
    expect(
      readCollectorNumberFromBlueprint({
        version: 'Illustration Rare | 083/080',
      }),
    ).toBe('083');
  });

  it('arma input de resolución TCGdex priorizando catálogo y completando con blueprint', () => {
    const input = buildNovedadTcgdexResolveInput({
      expansionName: 'Paldea Evolved',
      collectorNumber: null,
      blueprint: {
        expansion_id: 9999,
        fixed_properties: { collector_number: '086' },
      },
    });
    expect(input.expansionName).toBe('Paldea Evolved');
    expect(input.expansionId).toBe(9999);
    expect(input.collectorNumber).toBe('086');
  });
});
