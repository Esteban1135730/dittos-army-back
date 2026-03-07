import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReservaDocument = HydratedDocument<Reserva>;

@Schema()
export class Reserva {
  @Prop({ required: true })
  client_id: string;

  @Prop({ required: true })
  stock_id: string;

  @Prop({ required: true })
  precio: number;

  @Prop({ default: 'COP' })
  currency: string;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;
}

export const ReservaSchema = SchemaFactory.createForClass(Reserva);
