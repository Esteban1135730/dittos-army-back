import { BadRequestException } from '@nestjs/common';
import { YUGIOH_ESTEBAN_DB, YUGIOH_PABLO_DB } from './yugioh.constants';
import {
  filterYugiohSets,
  mapYugiohCard,
  mapYugiohSet,
} from './yugioh-catalog.map';
import { YugiohStockService } from './yugioh-stock.service';
import { runWithOwner } from '../owner/owner-context';
import { runWithTcg } from '../owner/tcg-context';
import { Stock } from '../schema/stock.schema';

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

  it('filtra sets por nombre o código', () => {
    const sets = [
      { code: 'MRD', name: 'Metal Raiders', cardCount: 1, releasedAt: null },
      { code: 'LOB', name: 'Legend of Blue Eyes', cardCount: 1, releasedAt: null },
    ];
    expect(filterYugiohSets(sets, 'raid').map((s) => s.code)).toEqual(['MRD']);
    expect(filterYugiohSets(sets, 'lob').map((s) => s.code)).toEqual(['LOB']);
  });

  it('nombra las bases yugioh-{owner}', () => {
    expect(YUGIOH_PABLO_DB).toBe('yugioh-pablo');
    expect(YUGIOH_ESTEBAN_DB).toBe('yugioh-esteban');
  });
});

describe('YugiohStockService', () => {
  function service() {
    const insertMany = jest.fn().mockResolvedValue([]);
    const find = jest.fn();
    const ownerModels = {
      getModel: jest.fn().mockReturnValue({ insertMany, find }),
    };
    const svc = new YugiohStockService(ownerModels as never);
    return { svc, insertMany, find, ownerModels };
  }

  it('guarda N copias en stocks del owner/TCG activo', async () => {
    const { svc, insertMany, ownerModels } = service();
    const result = await runWithOwner('esteban', () =>
      runWithTcg('yugioh', () =>
        svc.create({
          card_id: '89631139',
          card_name: 'Blue-Eyes White Dragon',
          unity_cost: 2,
          copies: 2,
          set_code: 'LOB',
        }),
      ),
    );
    expect(result).toEqual({ saved: 2 });
    expect(ownerModels.getModel).toHaveBeenCalledWith(Stock.name);
    expect(insertMany).toHaveBeenCalledTimes(1);
    expect(insertMany.mock.calls[0][0]).toHaveLength(2);
  });

  it('rechaza costo cero', async () => {
    const { svc } = service();
    await expect(
      svc.create({ card_id: '1', card_name: 'X', unity_cost: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
