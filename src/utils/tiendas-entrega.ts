export type TiendaEntrega = {
  id: string;
  name: string;
  address: string;
  /** WGS84. Fuente: Nominatim/OSM sobre la dirección del catálogo (ver comentarios). */
  lat: number;
  lng: number;
};

/** Catálogo fijo de puntos de entrega en Bogotá (snapshot en cada pedido). */
export const TIENDAS_ENTREGA: readonly TiendaEntrega[] = [
  {
    id: 'hidden-tcg-store',
    name: 'Hidden TCG Store',
    address: 'Cl. 52 #24-18, Bogotá',
    // Nominatim OSM: punto "24-20, Calle 52, Galerías" (contiguo a #24-18)
    lat: 4.6408977,
    lng: -74.0744131,
  },
  {
    id: 'draco-hobby-center',
    name: 'Draco Hobby Center',
    address: 'Cra. 16 #76-27 Piso 2, Bogotá',
    // Nominatim: Calle 76, Chapinero (viewbox Cra. 16 × Cl. 76)
    lat: 4.6615085,
    lng: -74.0570226,
  },
  {
    id: 'unlimited-hobby-center',
    name: 'Unlimited Hobby Center',
    address: 'Cra. 13 #46-64 Piso 2, Chapinero, Bogotá',
    // Nominatim: Calle 46, Chapinero (viewbox Cra. 13 × Cl. 46)
    lat: 4.6329019,
    lng: -74.0651325,
  },
  {
    id: 'lx-store',
    name: 'LX Store',
    address: 'Cra. 47a #98-47, Barrios Unidos, Bogotá',
    // Nominatim: Carrera 47A, La Castellana, Barrios Unidos
    lat: 4.6856758,
    lng: -74.0600917,
  },
  {
    id: 'play4cards',
    name: 'Play4Cards',
    address: 'Cra. 62 #99-87, Barrio Los Andes, Bogotá',
    // Nominatim: Carrera 62, Los Andes, Barrios Unidos
    lat: 4.688954,
    lng: -74.0674244,
  },
  {
    id: 'tokyo-hobby-nations',
    name: 'Tokyo Hobby Nations',
    address: 'Cl. 53 #70-18, Bogotá',
    // Nominatim: Avenida Calle 53, Normandía, Engativá
    lat: 4.6702688,
    lng: -74.1056903,
  },
  {
    id: 'valhalla',
    name: 'Valhalla',
    address: 'Cl. 150 #16-56 local 2074, CC Cedritos, Bogotá',
    // Nominatim POI: Centro Comercial Cedritos, Calle 151
    lat: 4.7318253,
    lng: -74.0420361,
  },
  {
    id: 'real-burgers',
    name: 'Real Burgers',
    address: 'Cra. 19A #162-27, Bogotá',
    // Nominatim: Carrera 19A, Las Orquídeas, Usaquén
    lat: 4.7418166,
    lng: -74.0431816,
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

/** Ciudad Bogotá: sin tildes, minúsculas; igual a `bogota` o la contiene. */
export function isCiudadBogota(ciudad: string | null | undefined): boolean {
  const n = normalizeTiendaText(ciudad ?? '');
  if (!n) return false;
  return n === 'bogota' || n.includes('bogota');
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
