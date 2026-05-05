export type ContactMethod = 'whatsapp' | 'facebook';

export type ClientDto = {
  id?: string;
  nombre: string;
  tienda_entrega: string;
  celular?: string;
  /** Obligatorio (no vacío) cuando `metodo_contacto` es `facebook`. */
  facebook_usuario?: string;
  metodo_contacto: ContactMethod;
  /** Notas internas; opcional. */
  notas?: string;
};
