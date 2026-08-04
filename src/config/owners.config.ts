/**
 * Multi-owner config (034). Keep in sync with
 * `dittos-army-front/src/config/owners.ts`.
 */

export type OwnerKey = 'pablo' | 'esteban';

export type FeatureKey =
  | 'inicio'
  | 'agregar-stock'
  | 'stock'
  | 'ventas'
  | 'venta-asistida-qr'
  | 'propiedad'
  | 'clientes'
  | 'cotizar'
  | 'cardtrader'
  | 'incoming'
  | 'export-tienda';

export type OwnerDefinition = {
  key: OwnerKey;
  label: string;
  dbName: string;
  stockQrPrefix: string;
  allowedFeatures: FeatureKey[];
};

export type OwnersConfig = {
  defaultOwner: OwnerKey;
  owners: Record<OwnerKey, OwnerDefinition>;
};

const ALL_FEATURES: FeatureKey[] = [
  'inicio',
  'agregar-stock',
  'stock',
  'ventas',
  'venta-asistida-qr',
  'propiedad',
  'clientes',
  'cotizar',
  'cardtrader',
  'incoming',
  'export-tienda',
];

const ESTEBAN_FEATURES: FeatureKey[] = [
  'inicio',
  'agregar-stock',
  'stock',
  'ventas',
  'venta-asistida-qr',
  'propiedad',
  'clientes',
];

export const OWNERS_CONFIG: OwnersConfig = {
  defaultOwner: 'pablo',
  owners: {
    pablo: {
      key: 'pablo',
      label: 'Pablo',
      dbName: 'test',
      stockQrPrefix: 'DA-STOCK:',
      allowedFeatures: [...ALL_FEATURES],
    },
    esteban: {
      key: 'esteban',
      label: 'Esteban',
      dbName: 'esteban',
      stockQrPrefix: 'ESTEBAN-STOCK:',
      allowedFeatures: [...ESTEBAN_FEATURES],
    },
  },
};

/** NestJS named connection for Esteban DB. */
export const ESTEBAN_CONNECTION_NAME = 'esteban';

export function isOwnerKey(value: unknown): value is OwnerKey {
  return value === 'pablo' || value === 'esteban';
}

export function getOwnerDefinition(key: OwnerKey): OwnerDefinition {
  return OWNERS_CONFIG.owners[key];
}

export function isFeatureAllowed(owner: OwnerKey, feature: FeatureKey): boolean {
  return OWNERS_CONFIG.owners[owner].allowedFeatures.includes(feature);
}

export function ownerKeyFromStockQrPrefix(prefix: string): OwnerKey | null {
  const normalized = prefix.trim().toUpperCase();
  for (const def of Object.values(OWNERS_CONFIG.owners)) {
    if (def.stockQrPrefix.toUpperCase() === normalized) {
      return def.key;
    }
  }
  return null;
}
