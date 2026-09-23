import { CardTraderYugiohSearchService } from './cardtrader-yugioh-search.service';

describe('CardTraderYugiohSearchService', () => {
  it('resuelve nombre parcial vía catálogo y consulta CT con nombres canónicos', async () => {
    const cardTrader = {
      searchBlueprintsByName: jest
        .fn()
        .mockResolvedValueOnce({ items: [] }) // exact "Ash Blossom"
        .mockResolvedValueOnce({
          items: [
            {
              blueprint_id: 1,
              expansion_id: 10,
              name: 'Ash Blossom & Joyous Spring',
            },
          ],
        }),
    };
    const yugiohCatalog = {
      searchByName: jest.fn().mockResolvedValue([
        { name: 'Ash Blossom & Joyous Spring' },
      ]),
    };
    const svc = new CardTraderYugiohSearchService(
      cardTrader as never,
      yugiohCatalog as never,
    );

    const { items } = await svc.searchBlueprintsByName('Ash Blossom');
    expect(yugiohCatalog.searchByName).toHaveBeenCalledWith('Ash Blossom');
    expect(cardTrader.searchBlueprintsByName).toHaveBeenCalledWith(
      'Ash Blossom',
      4,
    );
    expect(cardTrader.searchBlueprintsByName).toHaveBeenCalledWith(
      'Ash Blossom & Joyous Spring',
      4,
    );
    expect(items).toEqual([
      {
        blueprint_id: 1,
        expansion_id: 10,
        name: 'Ash Blossom & Joyous Spring',
      },
    ]);
  });

  it('si YGOPRODeck falla, intenta solo el query en CT', async () => {
    const cardTrader = {
      searchBlueprintsByName: jest.fn().mockResolvedValue({
        items: [{ blueprint_id: 2, expansion_id: 3, name: 'Pot of Greed' }],
      }),
    };
    const yugiohCatalog = {
      searchByName: jest.fn().mockRejectedValue(new Error('down')),
    };
    const svc = new CardTraderYugiohSearchService(
      cardTrader as never,
      yugiohCatalog as never,
    );

    const { items } = await svc.searchBlueprintsByName('Pot of Greed');
    expect(cardTrader.searchBlueprintsByName).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(1);
  });
});
