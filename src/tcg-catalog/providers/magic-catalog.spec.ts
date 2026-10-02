import { mapMagicCard, mapMagicSet } from './magic-catalog.map';

describe('magic catalog map', () => {
  it('mapea sets físicos de Scryfall', () => {
    expect(
      mapMagicSet({
        code: 'lea',
        name: 'Limited Edition Alpha',
        card_count: 295,
        released_at: '1993-08-05',
        set_type: 'core',
      }),
    ).toEqual({
      code: 'LEA',
      name: 'Limited Edition Alpha',
      cardCount: 295,
      releasedAt: '1993-08-05',
    });
  });

  it('descarta sets digitales, tokens y vacíos', () => {
    expect(
      mapMagicSet({ code: 'ymid', name: 'Alchemy', card_count: 10, digital: true }),
    ).toBeNull();
    expect(
      mapMagicSet({ code: 'tlea', name: 'Tokens', card_count: 3, set_type: 'token' }),
    ).toBeNull();
    expect(mapMagicSet({ code: 'x', name: 'Empty', card_count: 0 })).toBeNull();
  });

  it('usa set + collector_number como id y capitaliza rareza', () => {
    expect(
      mapMagicCard({
        name: 'Lightning Bolt',
        set: 'LEA',
        set_name: 'Limited Edition Alpha',
        collector_number: '161',
        rarity: 'common',
        type_line: 'Instant',
        image_uris: { small: 's.jpg', normal: 'n.jpg' },
      }),
    ).toEqual({
      id: 'lea-161',
      name: 'Lightning Bolt',
      type: 'Instant',
      number: '161',
      rarity: 'Common',
      setName: 'Limited Edition Alpha',
      image: 's.jpg',
      imageLarge: 'n.jpg',
    });
  });

  it('toma la imagen de la primera cara en cartas dobles', () => {
    const card = mapMagicCard({
      name: 'Delver of Secrets // Insectile Aberration',
      set: 'isd',
      collector_number: '51',
      card_faces: [{ image_uris: { small: 'front-s.jpg', normal: 'front-n.jpg' } }],
    });
    expect(card?.image).toBe('front-s.jpg');
    expect(card?.imageLarge).toBe('front-n.jpg');
  });
});
