/**
 * Multi-owner config (034). Keep in sync with
 * `dittos-army-front/src/config/owners.ts`.
 *
 * Pokémon: Pablo (`test`) y Esteban (`esteban`).
 * Yu-Gi-Oh: Tefa (`yugioh-tefa`).
 * Magic: Pablo (`magic-pablo`, owner interno `pablo-magic`).
 * One Piece: Ali (`onepiece-ali`).
 */

export const OWNER_KEYS = [
  'pablo',
  'esteban',
  'tefa',
  'pablo-magic',
  'ali',
] as const;

export type OwnerKey = (typeof OWNER_KEYS)[number];

export const TCG_KEYS = ['pokemon', 'yugioh', 'magic', 'onepiece'] as const;

/** TCG slug for path and DB naming (`pokemon` legacy DBs; others → `{tcg}-{owner}`). */
export type TcgKey = (typeof TCG_KEYS)[number];

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
  | 'export-tienda'
  | 'stock-inventario-fotos';

export type OwnerDefinition = {
  key: OwnerKey;
  label: string;
  /** TCG this owner operates. */
  tcg: TcgKey;
  /** Physical Mongo DB name used by Mongoose. */
  dbName: string;
  /**
   * Previous physical name when `dbName` follows `{tcg}-{owner}`.
   * Undefined when still on the legacy name.
   */
  legacyDbName?: string;
  stockQrPrefix: string;
  allowedFeatures: FeatureKey[];
};

export type OwnersConfig = {
  /** Default for Pokémon panel. */
  defaultOwner: OwnerKey;
  owners: Record<OwnerKey, OwnerDefinition>;
};

const ALL_FEATURES: FeatureKey[] = [
  'inicio',
  'agregar-stock',
  'stock',
  'stock-inventario-fotos',
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
  'stock-inventario-fotos',
  'ventas',
  'venta-asistida-qr',
  'propiedad',
  'clientes',
  'cotizar',
  'cardtrader',
];

/**
 * Convention for NEW TCG/owner databases: `{tcg}-{owner}`.
 * Pablo and Esteban stay on `test` and `esteban` (see OWNERS_CONFIG).
 */
export function databaseNameFor(tcg: string, owner: string): string {
  return `${tcg}-${owner}`;
}

/** Pokémon physical DB for Pablo. Data is in `test`, not `pokemon-pablo`. */
const PABLO_DB_NAME = 'test';
/** Pokémon physical DB for Esteban. Data is in `esteban`, not `pokemon-esteban`. */
const ESTEBAN_DB_NAME = 'esteban';

export const OWNERS_CONFIG: OwnersConfig = {
  defaultOwner: 'pablo',
  owners: {
    pablo: {
      key: 'pablo',
      label: 'Pablo',
      tcg: 'pokemon',
      dbName: PABLO_DB_NAME,
      stockQrPrefix: 'DA-STOCK:',
      allowedFeatures: [...ALL_FEATURES],
    },
    esteban: {
      key: 'esteban',
      label: 'Esteban',
      tcg: 'pokemon',
      dbName: ESTEBAN_DB_NAME,
      stockQrPrefix: 'ESTEBAN-STOCK:',
      allowedFeatures: [...ESTEBAN_FEATURES],
    },
    tefa: {
      key: 'tefa',
      label: 'Tefa',
      tcg: 'yugioh',
      dbName: databaseNameFor('yugioh', 'tefa'),
      stockQrPrefix: 'TEFA-STOCK:',
      allowedFeatures: [...ALL_FEATURES],
    },
    'pablo-magic': {
      key: 'pablo-magic',
      label: 'Pablo',
      tcg: 'magic',
      dbName: databaseNameFor('magic', 'pablo'),
      stockQrPrefix: 'MAGIC-STOCK:',
      allowedFeatures: [...ALL_FEATURES],
    },
    ali: {
      key: 'ali',
      label: 'Ali',
      tcg: 'onepiece',
      dbName: databaseNameFor('onepiece', 'ali'),
      stockQrPrefix: 'ALI-STOCK:',
      allowedFeatures: [...ALL_FEATURES],
    },
  },
};

/**
 * Mongoose connection name per owner. Pablo uses the default (unnamed)
 * connection; the rest use their dbName (`esteban`, `yugioh-tefa`, …).
 */
export function connectionNameFor(owner: OwnerKey): string | undefined {
  if (owner === OWNERS_CONFIG.defaultOwner) return undefined;
  return OWNERS_CONFIG.owners[owner].dbName;
}

export function isOwnerKey(value: unknown): value is OwnerKey {
  return (OWNER_KEYS as readonly unknown[]).includes(value);
}

export function isTcgKey(value: unknown): value is TcgKey {
  return (TCG_KEYS as readonly unknown[]).includes(value);
}

export function ownersForTcg(tcg: TcgKey): OwnerDefinition[] {
  return Object.values(OWNERS_CONFIG.owners).filter((o) => o.tcg === tcg);
}

const DEFAULT_OWNER_BY_TCG: Record<TcgKey, OwnerKey> = {
  pokemon: 'pablo',
  yugioh: 'tefa',
  magic: 'pablo-magic',
  onepiece: 'ali',
};

export function defaultOwnerForTcg(tcg: TcgKey): OwnerKey {
  return DEFAULT_OWNER_BY_TCG[tcg];
}

/** If owner does not belong to `tcg`, returns the default owner for that TCG. */
export function coerceOwnerForTcg(owner: OwnerKey, tcg: TcgKey): OwnerKey {
  return getOwnerDefinition(owner).tcg === tcg
    ? owner
    : defaultOwnerForTcg(tcg);
}

/**
 * Complementary Pokémon owner (pablo ↔ esteban).
 * Single-owner TCGs (Tefa, Pablo Magic, Ali) have no pair → `null`.
 */
export function otherOwner(owner: OwnerKey): OwnerKey | null {
  if (owner === 'pablo') return 'esteban';
  if (owner === 'esteban') return 'pablo';
  return null;
}

export function getOwnerDefinition(key: OwnerKey): OwnerDefinition {
  return OWNERS_CONFIG.owners[key];
}

export function isFeatureAllowed(
  owner: OwnerKey,
  feature: FeatureKey,
): boolean {
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
