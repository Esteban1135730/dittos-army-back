import { getClientContactValidationError } from './client-contact';

describe('getClientContactValidationError', () => {
  it('permite whatsapp sin facebook_usuario', () => {
    expect(
      getClientContactValidationError({
        nombre: 'a',
        tienda_entrega: 'b',
        metodo_contacto: 'whatsapp',
      }),
    ).toBeNull();
  });

  it('exige facebook_usuario cuando metodo es facebook', () => {
    expect(
      getClientContactValidationError({
        nombre: 'a',
        tienda_entrega: 'b',
        metodo_contacto: 'facebook',
      }),
    ).toMatch(/facebook_usuario/);
    expect(
      getClientContactValidationError({
        nombre: 'a',
        tienda_entrega: 'b',
        metodo_contacto: 'facebook',
        facebook_usuario: '   ',
      }),
    ).toMatch(/facebook_usuario/);
  });

  it('acepta facebook con usuario no vacío', () => {
    expect(
      getClientContactValidationError({
        nombre: 'a',
        tienda_entrega: 'b',
        metodo_contacto: 'facebook',
        facebook_usuario: 'mi.usuario',
      }),
    ).toBeNull();
  });
});
