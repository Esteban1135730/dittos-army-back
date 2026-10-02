import { mapYugiohCard, mapYugiohSet } from './yugioh-catalog.map';

describe('yugioh catalog map', () => {
  it('mapea un set de YGOPRODeck y descarta filas vacías', () => {
    expect(
      mapYugiohSet({
        set_name: 'Metal Raiders',
        set_code: 'MRD',
        num_of_cards: 144,
        tcg_date: '2002-06-26',
      }),
    ).toEqual({
      code: 'MRD',
      name: 'Metal Raiders',
      cardCount: 144,
      releasedAt: '2002-06-26',
    });
    expect(mapYugiohSet({ set_name: 'Solo nombre' })).toBeNull();
  });

  it('toma número y rareza del set pedido', () => {
    const card = mapYugiohCard(
      {
        id: 89631139,
        name: 'Blue-Eyes White Dragon',
        type: 'Normal Monster',
        card_sets: [
          {
            set_name: 'Legend of Blue Eyes White Dragon',
            set_code: 'LOB-001',
            set_rarity: 'Ultra Rare',
          },
          { set_name: 'Metal Raiders', set_code: 'MRD-000', set_rarity: 'Ultra Rare' },
        ],
        card_images: [
          { image_url: 'https://img/large.jpg', image_url_small: 'https://img/small.jpg' },
        ],
      },
      'Legend of Blue Eyes White Dragon',
    );
    expect(card).toMatchObject({
      id: '89631139',
      number: 'LOB-001',
      rarity: 'Ultra Rare',
      image: 'https://img/small.jpg',
    });
  });
});
