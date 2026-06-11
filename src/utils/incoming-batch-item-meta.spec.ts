import {
  cardIdsNeedingTcgDexEnrichment,
  resolveIncomingBatchItemCardName,
  resolveIncomingBatchItemImageUrl,
} from './incoming-batch-item-meta';

describe('incoming-batch-item-meta', () => {
  it('prioriza card_name del cliente sobre TCGdex', () => {
    expect(
      resolveIncomingBatchItemCardName(
        { card_name: 'Ralts' },
        { name: 'ラルトス' },
      ),
    ).toBe('Ralts');
  });

  it('usa TCGdex solo si falta card_name del cliente', () => {
    expect(
      resolveIncomingBatchItemCardName({ card_name: '' }, { name: 'Pikachu' }),
    ).toBe('Pikachu');
  });

  it('prioriza image_url del cliente sobre TCGdex', () => {
    expect(
      resolveIncomingBatchItemImageUrl(
        { image_url: 'https://client/img.webp' },
        { image: 'https://tcgdex/img.webp' },
      ),
    ).toBe('https://client/img.webp');
  });

  it('no pide TCGdex si el ítem ya trae nombre e imagen', () => {
    expect(
      cardIdsNeedingTcgDexEnrichment([
        {
          card_id: 'sv8-001',
          language: 'ja',
          quantity: 1,
          eur_total_lot: 1,
          card_name: 'Ralts',
          image_url: 'https://x/y.webp',
        },
      ]),
    ).toEqual([]);
  });

  it('pide TCGdex si falta nombre o imagen', () => {
    expect(
      cardIdsNeedingTcgDexEnrichment([
        {
          card_id: 'a',
          language: 'en',
          quantity: 1,
          eur_total_lot: 1,
          card_name: 'Charizard',
        },
        {
          card_id: 'b',
          language: 'ja',
          quantity: 1,
          eur_total_lot: 1,
          image_url: 'https://x/y.webp',
        },
      ]),
    ).toEqual(['a', 'b']);
  });
});
