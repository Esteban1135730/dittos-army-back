import { mapCardFromApi } from './card.dto';

describe('mapCardFromApi setEnglishName', () => {
  it('propaga englishName del set brief al DTO', () => {
    const dto = mapCardFromApi({
      id: 'SV5a-001',
      localId: '001',
      name: 'Test',
      set: {
        id: 'SV5a',
        name: 'クリムゾンヘイズ',
        englishName: 'Crimson Haze',
        cardCount: { official: 1, total: 1 },
      },
    });
    expect(dto.set).toBe('SV5a(クリムゾンヘイズ)');
    expect(dto.setEnglishName).toBe('Crimson Haze');
  });

  it('usa arte oficial pokemon.com si TCGdex no trae image', () => {
    const dto = mapCardFromApi({
      id: 'mep-080',
      localId: '080',
      name: 'Fennekin',
      set: {
        id: 'mep',
        name: 'MEP Black Star Promos',
        cardCount: { official: 0, total: 89 },
      },
    });
    expect(dto.image).toBe(
      'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_80.png',
    );
  });

  it('omite setEnglishName si el brief no lo trae', () => {
    const dto = mapCardFromApi({
      id: 'sv8-001',
      localId: '001',
      name: 'Test',
      set: {
        id: 'sv8',
        name: 'Surging Sparks',
        cardCount: { official: 1, total: 1 },
      },
    });
    expect(dto.setEnglishName).toBeUndefined();
  });
});
