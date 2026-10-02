import {
  isFeatureAllowed,
  isOwnerKey,
  otherOwner,
  OWNERS_CONFIG,
  getOwnerDefinition,
  databaseNameFor,
  coerceOwnerForTcg,
  defaultOwnerForTcg,
  ownersForTcg,
} from './owners.config';
import {
  getCurrentOwner,
  resolveOwnerFromRequest,
  runWithOwner,
} from '../owner/owner-context';

describe('owners.config', () => {
  it('defaultOwner es pablo; Pokémon y Yu-Gi-Oh (Tefa) con bases correctas', () => {
    expect(OWNERS_CONFIG.defaultOwner).toBe('pablo');
    expect(getOwnerDefinition('pablo').tcg).toBe('pokemon');
    expect(getOwnerDefinition('esteban').tcg).toBe('pokemon');
    expect(getOwnerDefinition('tefa').tcg).toBe('yugioh');
    expect(getOwnerDefinition('pablo').dbName).toBe('test');
    expect(getOwnerDefinition('esteban').dbName).toBe('esteban');
    expect(getOwnerDefinition('tefa').dbName).toBe('yugioh-tefa');
    expect(getOwnerDefinition('pablo').stockQrPrefix).toBe('DA-STOCK:');
    expect(getOwnerDefinition('esteban').stockQrPrefix).toBe('ESTEBAN-STOCK:');
    expect(getOwnerDefinition('tefa').stockQrPrefix).toBe('TEFA-STOCK:');
  });

  it('databaseNameFor sigue la convención {tcg}-{owner}', () => {
    expect(databaseNameFor('pokemon', 'pablo')).toBe('pokemon-pablo');
    expect(databaseNameFor('yugioh', 'tefa')).toBe('yugioh-tefa');
  });

  it('ACL: Esteban con cotizar/cardtrader; sin incoming/export-tienda', () => {
    expect(isFeatureAllowed('esteban', 'cotizar')).toBe(true);
    expect(isFeatureAllowed('esteban', 'cardtrader')).toBe(true);
    expect(isFeatureAllowed('esteban', 'incoming')).toBe(false);
    expect(isFeatureAllowed('esteban', 'export-tienda')).toBe(false);
    expect(isFeatureAllowed('esteban', 'stock')).toBe(true);
    expect(isFeatureAllowed('esteban', 'stock-inventario-fotos')).toBe(true);
    expect(isFeatureAllowed('pablo', 'stock-inventario-fotos')).toBe(true);
    expect(isFeatureAllowed('pablo', 'export-tienda')).toBe(true);
    expect(isFeatureAllowed('tefa', 'stock')).toBe(true);
  });

  it('isOwnerKey', () => {
    expect(isOwnerKey('pablo')).toBe(true);
    expect(isOwnerKey('esteban')).toBe(true);
    expect(isOwnerKey('tefa')).toBe(true);
    expect(isOwnerKey('otro')).toBe(false);
  });

  it('otherOwner intercambia pablo y esteban; tefa sin par', () => {
    expect(otherOwner('pablo')).toBe('esteban');
    expect(otherOwner('esteban')).toBe('pablo');
    expect(otherOwner('tefa')).toBeNull();
  });

  it('ownersForTcg / coerceOwnerForTcg', () => {
    expect(ownersForTcg('pokemon').map((o) => o.key)).toEqual([
      'pablo',
      'esteban',
    ]);
    expect(ownersForTcg('yugioh').map((o) => o.key)).toEqual(['tefa']);
    expect(defaultOwnerForTcg('yugioh')).toBe('tefa');
    expect(coerceOwnerForTcg('pablo', 'yugioh')).toBe('tefa');
    expect(coerceOwnerForTcg('tefa', 'pokemon')).toBe('pablo');
    expect(coerceOwnerForTcg('esteban', 'pokemon')).toBe('esteban');
  });

  it('Magic (Pablo) y One Piece (Ali): bases, QR, ACL y owner por defecto', () => {
    expect(getOwnerDefinition('pablo-magic')).toMatchObject({
      tcg: 'magic',
      label: 'Pablo',
      dbName: 'magic-pablo',
      stockQrPrefix: 'MAGIC-STOCK:',
    });
    expect(getOwnerDefinition('ali')).toMatchObject({
      tcg: 'onepiece',
      dbName: 'onepiece-ali',
      stockQrPrefix: 'ALI-STOCK:',
    });
    expect(defaultOwnerForTcg('magic')).toBe('pablo-magic');
    expect(defaultOwnerForTcg('onepiece')).toBe('ali');
    expect(coerceOwnerForTcg('pablo', 'magic')).toBe('pablo-magic');
    expect(coerceOwnerForTcg('tefa', 'onepiece')).toBe('ali');
    expect(otherOwner('ali')).toBeNull();
    expect(isFeatureAllowed('ali', 'cotizar')).toBe(true);
    expect(isFeatureAllowed('pablo-magic', 'stock')).toBe(true);
  });
});

describe('owner-context routing', () => {
  it('default y header X-Owner', () => {
    expect(resolveOwnerFromRequest({})).toBe('pablo');
    expect(resolveOwnerFromRequest({ header: 'esteban' })).toBe('esteban');
    expect(resolveOwnerFromRequest({ query: 'tefa' })).toBe('tefa');
    expect(resolveOwnerFromRequest({ header: 'pablo', query: 'esteban' })).toBe(
      'pablo',
    );
    expect(resolveOwnerFromRequest({ header: 'invalid' })).toBeNull();
  });

  it('runWithOwner setea ALS; getCurrentOwner refleja owner', () => {
    expect(getCurrentOwner()).toBe('pablo');
    runWithOwner('esteban', () => {
      expect(getCurrentOwner()).toBe('esteban');
    });
    expect(getCurrentOwner()).toBe('pablo');
  });

  it('simula routing de conexión: mutación esteban no usa dbName de pablo', () => {
    const writes: string[] = [];
    const writeForCurrent = () => {
      const owner = getCurrentOwner();
      writes.push(OWNERS_CONFIG.owners[owner].dbName);
    };

    runWithOwner('esteban', writeForCurrent);
    runWithOwner('pablo', writeForCurrent);
    runWithOwner('tefa', writeForCurrent);

    expect(writes).toEqual(['esteban', 'test', 'yugioh-tefa']);
  });
});
