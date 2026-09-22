import {
  findLegacyItemByCardName,
  unitCostCopFromLegacyItemRuleOfThree,
} from './incoming-batch-item-pricing';

describe('incoming-batch-item-pricing', () => {
  it('regla de tres: ctFx × (legacyCop / legacyFx)', () => {
    const cop = unitCostCopFromLegacyItemRuleOfThree(
      0.89,
      { unit_cost_cop: 2231, eur_unit_price: 0.89 },
      4000,
    );
    expect(cop).toBeCloseTo(2231, 5);
  });

  it('usa tasa del lote si falta ítem legacy', () => {
    expect(unitCostCopFromLegacyItemRuleOfThree(1, {}, 2500)).toBe(2500);
  });

  it('encuentra ítem legacy por nombre aproximado', () => {
    const item = findLegacyItemByCardName('Petrel', [
      {
        card_name: 'Petrel del Team Rocket',
        unit_cost_cop: 2231,
        eur_unit_price: 0.89,
      },
    ]);
    expect(item?.unit_cost_cop).toBe(2231);
  });
});
