import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ClientDocument = HydratedDocument<Client>;

export const CONTACT_METHODS = ['whatsapp', 'facebook'] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

@Schema()
export class Client {
  @Prop({ required: true })
  nombre: string;

  @Prop({ required: true })
  tienda_entrega: string;

  @Prop({ required: false })
  celular?: string;

  /** Nombre de usuario de Facebook (solo texto); obligatorio en validación si `metodo_contacto` es facebook. */
  @Prop({ required: false })
  facebook_usuario?: string;

  @Prop({ required: true, enum: CONTACT_METHODS })
  metodo_contacto: ContactMethod;

  /** Notas internas del operador (preferencias, acuerdos, etc.). */
  @Prop({ required: false })
  notas?: string;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;
}

export const ClientSchema = SchemaFactory.createForClass(Client);
