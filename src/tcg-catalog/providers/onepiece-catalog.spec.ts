import {
  dedupeCardsById,
  mapOnePieceCard,
  mapOnePieceSet,
} from './onepiece-catalog.map';

describe('onepiece catalog map', () => {
  it('mapea boosters y starter decks', () => {
    expect(mapOnePieceSet({ set_id: 'OP-01', set_name: 'Romance Dawn' })).toEqual({
      code: 'OP-01',
      name: 'Romance Dawn',
      cardCount: 0,
      releasedAt: null,
    });
    expect(
      mapOnePieceSet({
        structure_deck_id: 'ST-01',
        structure_deck_name: 'Straw Hat Crew',
      }),
    ).toMatchObject({ code: 'ST-01', name: 'Straw Hat Crew' });
    expect(mapOnePieceSet({ set_name: 'Sin id' })).toBeNull();
  });

  it('usa card_image_id para distinguir arte alternativo', () => {
    const base = {
      card_name: 'Roronoa Zoro',
      card_set_id: 'OP01-025',
      card_type: 'Character',
      rarity: 'SR',
      set_name: 'Romance Dawn',
      card_image: 'https://img/OP01-025.jpg',
    };
    expect(mapOnePieceCard({ ...base, card_image_id: 'OP01-025' })).toMatchObject({
      id: 'OP01-025',
      number: 'OP01-025',
      rarity: 'SR',
    });
    expect(
      mapOnePieceCard({ ...base, card_image_id: 'OP01-025_p1' })?.id,
    ).toBe('OP01-025_p1');
    expect(mapOnePieceCard({ card_set_id: 'OP01-001' })).toBeNull();
  });

  it('deduplica cartas por id conservando la primera', () => {
    const card = mapOnePieceCard({ card_name: 'Luffy', card_image_id: 'OP01-024' })!;
    const dup = { ...card, setName: 'Otro' };
    expect(dedupeCardsById([card, dup])).toEqual([card]);
  });
});
