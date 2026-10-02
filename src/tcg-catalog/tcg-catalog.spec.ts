import { BadRequestException } from '@nestjs/common';
import { runWithOwner } from '../owner/owner-context';
import { runWithTcg } from '../owner/tcg-context';
import { Stock } from '../schema/stock.schema';
import { CatalogStockService } from './catalog-stock.service';
import { TcgCatalogRegistry } from './tcg-catalog.registry';
import {
  filterCatalogSets,
  findCatalogSet,
  rankCardsByName,
  type CatalogCard,
} from './tcg-catalog.types';

const sets = [
  { code: 'MRD', name: 'Metal Raiders', cardCount: 1, releasedAt: null },
  { code: 'LOB', name: 'Legend of Blue Eyes', cardCount: 1, releasedAt: null },
];

function card(name: string): CatalogCard {
  return {
    id: name,
    name,
    type: '',
    number: '',
    rarity: '',
    setName: '',
    image: '',
    imageLarge: '',
  };
}

describe('tcg-catalog helpers', () => {
  it('filtra sets por nombre o código', () => {
    expect(filterCatalogSets(sets, 'raid').map((s) => s.code)).toEqual(['MRD']);
    expect(filterCatalogSets(sets, 'lob').map((s) => s.code)).toEqual(['LOB']);
    expect(filterCatalogSets(sets, '  ')).toHaveLength(2);
  });

  it('encuentra set por nombre exacto o por código', () => {
    expect(findCatalogSet(sets, 'metal raiders')?.code).toBe('MRD');
    expect(findCatalogSet(sets, 'lob')?.code).toBe('LOB');
    expect(findCatalogSet(sets, 'metal')).toBeUndefined();
  });

  it('ordena cartas exacto → prefijo → contiene y descarta no coincidentes', () => {
    const ranked = rankCardsByName(
      [card('Monkey D. Luffy'), card('Luffy'), card('Luffy & Ace'), card('Zoro')],
      'luffy',
    ).map((c) => c.name);
    expect(ranked).toEqual(['Luffy', 'Luffy & Ace', 'Monkey D. Luffy']);
  });
});

describe('TcgCatalogRegistry', () => {
  const yugioh = { tcg: 'yugioh' };
  const magic = { tcg: 'magic' };
  const onepiece = { tcg: 'onepiece' };
  const registry = new TcgCatalogRegistry(
    yugioh as never,
    magic as never,
    onepiece as never,
  );

  it('devuelve el proveedor del TCG', () => {
    expect(registry.forTcg('yugioh')).toBe(yugioh);
    expect(registry.forTcg('magic')).toBe(magic);
    expect(registry.forTcg('onepiece')).toBe(onepiece);
  });

  it('rechaza Pokémon (usa TCGdex)', () => {
    expect(() => registry.forTcg('pokemon')).toThrow(BadRequestException);
  });
});

describe('CatalogStockService', () => {
  function service() {
    const insertMany = jest.fn().mockResolvedValue([]);
    const find = jest.fn();
    const ownerModels = {
      getModel: jest.fn().mockReturnValue({ insertMany, find }),
    };
    const svc = new CatalogStockService(ownerModels as never);
    return { svc, insertMany, ownerModels };
  }

  it.each([
    ['tefa', 'yugioh'],
    ['pablo-magic', 'magic'],
    ['ali', 'onepiece'],
  ] as const)('guarda N copias en stocks de %s/%s', async (owner, tcg) => {
    const { svc, insertMany, ownerModels } = service();
    const result = await runWithOwner(owner, () =>
      runWithTcg(tcg, () =>
        svc.create({
          card_id: 'X-1',
          card_name: 'Carta',
          unity_cost: 2,
          copies: 2,
          set_code: 'SET',
        }),
      ),
    );
    expect(result).toEqual({ saved: 2 });
    expect(ownerModels.getModel).toHaveBeenCalledWith(Stock.name);
    expect(insertMany.mock.calls[0][0]).toHaveLength(2);
  });

  it('rechaza costo cero', async () => {
    const { svc } = service();
    await expect(
      svc.create({ card_id: '1', card_name: 'X', unity_cost: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
