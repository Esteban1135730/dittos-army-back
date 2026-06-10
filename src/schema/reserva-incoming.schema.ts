import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReservaIncomingDocument = HydratedDocument<ReservaIncoming>;

/** Reserva pendiente sobre una línea de lote incoming (sin precio hasta materializar en stock). */
@Schema({ collection: 'reserva_incoming' })
export class ReservaIncoming {
  @Prop({ required: true })
  client_id: string;

  @Prop({ required: true })
  batch_item_id: string;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;
}

export const ReservaIncomingSchema =
  SchemaFactory.createForClass(ReservaIncoming);

ReservaIncomingSchema.index(
  { client_id: 1, batch_item_id: 1 },
  { unique: true },
);
ReservaIncomingSchema.index({ batch_item_id: 1, created_at: 1 });
