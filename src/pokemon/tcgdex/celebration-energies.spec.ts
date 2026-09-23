import {
  appendCelebrationEnergies,
  celebrationEnergyDetail,
  celebrationEnergiesMatchingName,
  resolve30thCelebrationBasicEnergy,
} from './celebration-energies';

describe('celebration energies', () => {
  it('añade MEE 009-016 al set 30th y a mee si TCGdex no las trae', () => {
    const appended = appendCelebrationEnergies(
      '30th',
      [{ id: '30th-001', localId: '001', name: 'Exeggcute' }],
      'es',
    );
    expect(appended.map((card) => card.id)).toEqual([
      '30th-001',
      'mee-009',
      'mee-010',
      'mee-011',
      'mee-012',
      'mee-013',
      'mee-014',
      'mee-015',
      'mee-016',
    ]);
    expect(appended.find((card) => card.id === 'mee-009')?.name).toBe(
      'Energía Básica Planta',
    );

    const mee = appendCelebrationEnergies(
      'mee',
      [{ id: 'mee-001', localId: '001', name: 'Grass Energy' }],
      'en',
    );
    expect(mee[1]?.id).toBe('mee-009');
    expect(mee[1]?.name).toBe('Basic Grass Energy');
  });

  it('no duplica una energía que ya venga de TCGdex', () => {
    const cards = appendCelebrationEnergies(
      'mee',
      [{ id: 'mee-009', localId: '009', name: 'Basic Grass Energy' }],
      'en',
    );
    expect(cards.filter((card) => card.id === 'mee-009')).toHaveLength(1);
  });

  it('no altera otros sets', () => {
    const cards = [{ id: 'sv1-1', localId: '001', name: 'Sprigatito' }];
    expect(appendCelebrationEnergies('sv1', cards, 'en')).toBe(cards);
  });

  it('encuentra por nombre en español o inglés', () => {
    expect(celebrationEnergiesMatchingName('básica planta', 'es').map((c) => c.id)).toEqual([
      'mee-009',
    ]);
    expect(celebrationEnergiesMatchingName('metal energy', 'en').map((c) => c.id)).toEqual([
      'mee-016',
    ]);
    expect(celebrationEnergiesMatchingName('pikachu', 'en')).toEqual([]);
  });

  it('homologa energías de 30th Celebration sin número de colección', () => {
    expect(
      resolve30thCelebrationBasicEnergy({
        expansionName: '30th Celebration',
        cardName: 'Basic Darkness Energy',
      }),
    ).toBe('mee-015');
    expect(
      resolve30thCelebrationBasicEnergy({
        setId: '30th',
        cardName: 'Energía Básica Planta',
      }),
    ).toBe('mee-009');
    expect(
      resolve30thCelebrationBasicEnergy({
        expansionName: '30th Classic Collection',
        cardName: 'Basic Fire Energy',
      }),
    ).toBeNull();
    expect(
      resolve30thCelebrationBasicEnergy({
        expansionName: '30th Celebration',
        cardName: 'Pikachu',
      }),
    ).toBeNull();
  });

  it('devuelve el detalle para inventario', () => {
    const card = celebrationEnergyDetail('mee-012', 'es');
    expect(card?.name).toBe('Energía Básica Rayo');
    expect(card?.category).toBe('Energy');
    expect(card?.energyType).toBe('Normal');
    expect(card?.illustrator).toBe('YOSHIROTTEN');
    expect(card?.set).toBe('mee(Megaevolución Energía)');
    expect(card?.setEnglishName).toBe('Mega Evolution Energy');
    expect(celebrationEnergyDetail('mee-001', 'en')).toBeUndefined();
  });
});
