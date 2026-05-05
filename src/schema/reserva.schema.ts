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

  /** Fecha de creación; las nuevas reservas la rellena el repositorio. Opcional en documentos antiguos. */
  @Prop({ type: Date, required: false })
  created_at?: Date;

  @Prop({ type: Date, required: false })
  updated_at?: Date;
}

export const ReservaSchema = SchemaFactory.createForClass(Reserva);
