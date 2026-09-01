import {
  googleResultInBogota,
  isLatLngInBogota,
  nominatimHitInBogota,
} from './bogota-geo';

describe('bogota-geo', () => {
  it('bbox incluye Cedritos y excluye Medellín', () => {
    expect(isLatLngInBogota(4.73, -74.04)).toBe(true);
    expect(isLatLngInBogota(6.24, -75.57)).toBe(false);
  });

  it('Google: formatted_address Bogotá aunque el nombre sea un mall', () => {
    expect(
      googleResultInBogota({
        formatted_address: 'Centro Comercial Unicentro, Bogotá, Colombia',
        geometry: { location: { lat: 4.686, lng: -74.042 } },
      }),
    ).toBe(true);
  });

  it('Google: Medellín no entra', () => {
    expect(
      googleResultInBogota({
        formatted_address: 'Unicentro, Medellín, Antioquia, Colombia',
        geometry: { location: { lat: 6.24, lng: -75.57 } },
      }),
    ).toBe(false);
  });

  it('Nominatim: display_name con Bogotá', () => {
    expect(
      nominatimHitInBogota({
        lat: '4.65',
        lon: '-74.08',
        display_name: 'Calle 100, Bogotá, Colombia',
      }),
    ).toBe(true);
  });
});
