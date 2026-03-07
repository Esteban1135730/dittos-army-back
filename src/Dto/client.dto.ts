export type ContactMethod = 'whatsapp' | 'facebook';

export type ClientDto = {
  id?: string;
  nombre: string;
  tienda_entrega: string;
  celular?: string;
  metodo_contacto: ContactMethod;
};
