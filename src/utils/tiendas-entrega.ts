export type TiendaEntrega = {
  id: string;
  name: string;
  address: string;
};

/** Catálogo fijo de puntos de entrega en Bogotá (snapshot en cada pedido). */
export const TIENDAS_ENTREGA: readonly TiendaEntrega[] = [
  {
    id: 'hidden-tcg-store',
    name: 'Hidden TCG Store',
    address: 'Cl. 52 #24-18, Bogotá',
  },
  {
    id: 'draco-hobby-center',
    name: 'Draco Hobby Center',
    address: 'Cra. 16 #76-27 Piso 2, Bogotá',
  },
  {
    id: 'unlimited-hobby-center',
    name: 'Unlimited Hobby Center',
    address: 'Cra. 13 #46-64 Piso 2, Chapinero, Bogotá',
  },
  {
    id: 'lx-store',
    name: 'LX Store',
    address: 'Cra. 99a #66a-85, Bogotá',
  },
  {
    id: 'play4cards',
    name: 'Play4Cards',
    address: 'Cra. 62 #99-87, Barrio Los Andes, Bogotá',
  },
  {
    id: 'tokyo-hobby-nations',
    name: 'Tokyo Hobby Nations',
    address: 'Cl. 53 #70-18, Bogotá',
  },
  {
    id: 'valhalla',
    name: 'Valhalla',
    address: 'Cl. 150 #16-56 local 2074, CC Cedritos, Bogotá',
  },
  {
    id: 'real-burgers',
    name: 'Real Burgers',
    address: 'Cra. 19A #162-27, Bogotá',
  },
] as const;

const BY_ID = new Map(TIENDAS_ENTREGA.map((t) => [t.id, t]));

export function isTiendaEntregaId(id: string | null | undefined): boolean {
  return typeof id === 'string' && BY_ID.has(id);
}

export function getTiendaEntrega(
  id: string | null | undefined,
): TiendaEntrega | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}

export function normalizeTiendaText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ALIASES: { needles: string[]; id: string }[] = [
  { needles: ['hidden'], id: 'hidden-tcg-store' },
  { needles: ['draco'], id: 'draco-hobby-center' },
  { needles: ['unlimited'], id: 'unlimited-hobby-center' },
  { needles: ['lx store', 'lxstore'], id: 'lx-store' },
  { needles: ['play4cards', 'play 4 cards', 'play4 cards'], id: 'play4cards' },
  { needles: ['tokyo'], id: 'tokyo-hobby-nations' },
  { needles: ['valhalla'], id: 'valhalla' },
  { needles: ['real burgers', 'real burguers', 'realburgers'], id: 'real-burgers' },
];

/** Empareja el texto legado `Client.tienda_entrega` con el catálogo. */
export function matchTiendaEntregaFromLegacy(
  text: string | null | undefined,
): TiendaEntrega | null {
  const n = normalizeTiendaText(text ?? '');
  if (!n) return null;

  for (const t of TIENDAS_ENTREGA) {
    const name = normalizeTiendaText(t.name);
    const idSpaces = t.id.replace(/-/g, ' ');
    if (n === name || n === idSpaces) return t;
    if (n.includes(name) || name.includes(n)) return t;
    if (n.includes(idSpaces)) return t;
  }

  for (const alias of ALIASES) {
    if (alias.needles.some((needle) => n.includes(needle))) {
      return getTiendaEntrega(alias.id) ?? null;
    }
  }

  return null;
}
