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

  @Prop({ required: true, enum: CONTACT_METHODS })
  metodo_contacto: ContactMethod;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;
}

export const ClientSchema = SchemaFactory.createForClass(Client);
