import { buildEnvioGeocodeQuery } from './envio-geocode-query';

describe('buildEnvioGeocodeQuery', () => {
  it('junta dirección, notas y ciudad sin duplicar', () => {
    expect(
      buildEnvioGeocodeQuery({
        direccion_o_punto: 'Unicentro local 203',
        notas_entrega: 'Portería',
        ciudad: 'Bogotá',
      }),
    ).toBe('Unicentro local 203, Portería, Bogotá');
  });

  it('omite vacíos y colapsa espacios', () => {
    expect(
      buildEnvioGeocodeQuery({
        direccion_o_punto: '  Calle 100   #15-20  ',
        notas_entrega: '   ',
        ciudad: undefined,
      }),
    ).toBe('Calle 100 #15-20');
  });
});
