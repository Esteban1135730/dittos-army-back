import { CardTraderCatalogSearchService } from './cardtrader-catalog-search.service';

function setup(
  cardTrader: { searchBlueprintsByName: jest.Mock },
  catalog: { searchByName: jest.Mock },
) {
  const registry = { forTcg: jest.fn().mockReturnValue(catalog) };
  const svc = new CardTraderCatalogSearchService(
    cardTrader as never,
    registry as never,
  );
  return { svc, registry };
}

describe('CardTraderCatalogSearchService', () => {
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
    const catalog = {
      searchByName: jest.fn().mockResolvedValue([
        { name: 'Ash Blossom & Joyous Spring' },
      ]),
    };
    const { svc, registry } = setup(cardTrader, catalog);

    const { items } = await svc.searchBlueprintsByName('Ash Blossom', 'yugioh');
    expect(registry.forTcg).toHaveBeenCalledWith('yugioh');
    expect(catalog.searchByName).toHaveBeenCalledWith('Ash Blossom');
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

  it.each([
    ['magic', 1],
    ['onepiece', 15],
  ] as const)('usa el game_id CT de %s', async (tcg, gameId) => {
    const cardTrader = {
      searchBlueprintsByName: jest.fn().mockResolvedValue({ items: [] }),
    };
    const catalog = { searchByName: jest.fn().mockResolvedValue([]) };
    const { svc } = setup(cardTrader, catalog);

    await svc.searchBlueprintsByName('Lightning Bolt', tcg);
    expect(cardTrader.searchBlueprintsByName).toHaveBeenCalledWith(
      'Lightning Bolt',
      gameId,
    );
  });

  it('si el catálogo falla, intenta solo el query en CT', async () => {
    const cardTrader = {
      searchBlueprintsByName: jest.fn().mockResolvedValue({
        items: [{ blueprint_id: 2, expansion_id: 3, name: 'Pot of Greed' }],
      }),
    };
    const catalog = {
      searchByName: jest.fn().mockRejectedValue(new Error('down')),
    };
    const { svc } = setup(cardTrader, catalog);

    const { items } = await svc.searchBlueprintsByName('Pot of Greed', 'yugioh');
    expect(cardTrader.searchBlueprintsByName).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(1);
  });
});
