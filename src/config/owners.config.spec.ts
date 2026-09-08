import {
  isFeatureAllowed,
  isOwnerKey,
  otherOwner,
  OWNERS_CONFIG,
  getOwnerDefinition,
} from './owners.config';
import {
  getCurrentOwner,
  resolveOwnerFromRequest,
  runWithOwner,
} from '../owner/owner-context';

describe('owners.config', () => {
  it('defaultOwner es pablo y dbNames correctos', () => {
    expect(OWNERS_CONFIG.defaultOwner).toBe('pablo');
    expect(getOwnerDefinition('pablo').dbName).toBe('test');
    expect(getOwnerDefinition('esteban').dbName).toBe('esteban');
    expect(getOwnerDefinition('pablo').stockQrPrefix).toBe('DA-STOCK:');
    expect(getOwnerDefinition('esteban').stockQrPrefix).toBe('ESTEBAN-STOCK:');
  });

  it('ACL: Esteban con cotizar/cardtrader; sin incoming/export-tienda', () => {
    expect(isFeatureAllowed('esteban', 'cotizar')).toBe(true);
    expect(isFeatureAllowed('esteban', 'cardtrader')).toBe(true);
    expect(isFeatureAllowed('esteban', 'incoming')).toBe(false);
    expect(isFeatureAllowed('esteban', 'export-tienda')).toBe(false);
    expect(isFeatureAllowed('esteban', 'stock')).toBe(true);
    expect(isFeatureAllowed('pablo', 'export-tienda')).toBe(true);
  });

  it('isOwnerKey', () => {
    expect(isOwnerKey('pablo')).toBe(true);
    expect(isOwnerKey('esteban')).toBe(true);
    expect(isOwnerKey('otro')).toBe(false);
  });

  it('otherOwner intercambia pablo y esteban', () => {
    expect(otherOwner('pablo')).toBe('esteban');
    expect(otherOwner('esteban')).toBe('pablo');
  });
});

describe('owner-context routing', () => {
  it('default y header X-Owner', () => {
    expect(resolveOwnerFromRequest({})).toBe('pablo');
    expect(resolveOwnerFromRequest({ header: 'esteban' })).toBe('esteban');
    expect(resolveOwnerFromRequest({ query: 'esteban' })).toBe('esteban');
    expect(
      resolveOwnerFromRequest({ header: 'pablo', query: 'esteban' }),
    ).toBe('pablo');
    expect(resolveOwnerFromRequest({ header: 'invalid' })).toBeNull();
  });

  it('runWithOwner setea ALS; getCurrentOwner refleja owner', () => {
    expect(getCurrentOwner()).toBe('pablo');
    runWithOwner('esteban', () => {
      expect(getCurrentOwner()).toBe('esteban');
    });
    expect(getCurrentOwner()).toBe('pablo');
  });

  it('simula routing de conexión: mutación esteban no usa dbName test', () => {
    const writes: string[] = [];
    const writeForCurrent = () => {
      const owner = getCurrentOwner();
      writes.push(OWNERS_CONFIG.owners[owner].dbName);
    };

    runWithOwner('esteban', writeForCurrent);
    runWithOwner('pablo', writeForCurrent);

    expect(writes).toEqual(['esteban', 'test']);
  });
});
