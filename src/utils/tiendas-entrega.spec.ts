import {
  TIENDAS_ENTREGA,
  getTiendaEntrega,
  isCiudadBogota,
  isTiendaEntregaId,
  matchTiendaEntregaFromLegacy,
} from './tiendas-entrega';

describe('tiendas-entrega', () => {
  it('expone 8 ids estables', () => {
    expect(TIENDAS_ENTREGA.map((t) => t.id)).toEqual([
      'hidden-tcg-store',
      'draco-hobby-center',
      'unlimited-hobby-center',
      'lx-store',
      'play4cards',
      'tokyo-hobby-nations',
      'valhalla',
      'real-burgers',
    ]);
  });

  it('isTiendaEntregaId / getTiendaEntrega', () => {
    expect(isTiendaEntregaId('valhalla')).toBe(true);
    expect(isTiendaEntregaId('no-existe')).toBe(false);
    expect(getTiendaEntrega('hidden-tcg-store')?.address).toContain('52');
    expect(getTiendaEntrega('lx-store')?.address).toContain('47a');
    expect(getTiendaEntrega('real-burgers')?.address).toContain('19A');
    expect(getTiendaEntrega('x')).toBeUndefined();
  });

  it('match fuzzy de nombres legado', () => {
    expect(matchTiendaEntregaFromLegacy('Hidden TCG Store')?.id).toBe(
      'hidden-tcg-store',
    );
    expect(matchTiendaEntregaFromLegacy('hidden')?.id).toBe('hidden-tcg-store');
    expect(matchTiendaEntregaFromLegacy('DRACO hobby')?.id).toBe(
      'draco-hobby-center',
    );
    expect(matchTiendaEntregaFromLegacy('Unlimited Hobby Center')?.id).toBe(
      'unlimited-hobby-center',
    );
    expect(matchTiendaEntregaFromLegacy('Tokyo Hobby Nations')?.id).toBe(
      'tokyo-hobby-nations',
    );
    expect(matchTiendaEntregaFromLegacy('Valhalla Cedritos')?.id).toBe(
      'valhalla',
    );
    expect(matchTiendaEntregaFromLegacy('play4cards')?.id).toBe('play4cards');
    expect(matchTiendaEntregaFromLegacy('LX Store')?.id).toBe('lx-store');
    expect(matchTiendaEntregaFromLegacy('Real Burgers')?.id).toBe(
      'real-burgers',
    );
    expect(matchTiendaEntregaFromLegacy('real burguers')?.id).toBe(
      'real-burgers',
    );
  });

  it('no inventa tienda si el texto es una dirección de envío', () => {
    expect(
      matchTiendaEntregaFromLegacy('Calle 100 #15-20 apto 301'),
    ).toBeNull();
    expect(matchTiendaEntregaFromLegacy('')).toBeNull();
    expect(matchTiendaEntregaFromLegacy(undefined)).toBeNull();
  });

  it('cada ítem tiene lat/lng finitos dentro del bbox de Bogotá', () => {
    expect(TIENDAS_ENTREGA).toHaveLength(8);
    for (const t of TIENDAS_ENTREGA) {
      expect(Number.isFinite(t.lat)).toBe(true);
      expect(Number.isFinite(t.lng)).toBe(true);
      expect(t.lat).toBeGreaterThanOrEqual(4.4);
      expect(t.lat).toBeLessThanOrEqual(4.9);
      expect(t.lng).toBeGreaterThanOrEqual(-74.3);
      expect(t.lng).toBeLessThanOrEqual(-73.9);
    }
  });

  it('isCiudadBogota reconoce variantes y rechaza otras ciudades', () => {
    expect(isCiudadBogota('Bogotá')).toBe(true);
    expect(isCiudadBogota('bogota')).toBe(true);
    expect(isCiudadBogota('BOGOTÁ D.C.')).toBe(true);
    expect(isCiudadBogota('Medellín')).toBe(false);
    expect(isCiudadBogota('')).toBe(false);
  });
});
