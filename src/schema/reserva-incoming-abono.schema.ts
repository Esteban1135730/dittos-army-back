import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReservaIncomingAbonoDocument =
  HydratedDocument<ReservaIncomingAbono>;

/** Abono de capital (COP) contra la reserva en camino de un cliente. */
@Schema({ collection: 'reserva_incoming_abono' })
export class ReservaIncomingAbono {
  @Prop({ required: true })
  client_id: string;

  @Prop({ required: true, min: 1 })
  amount_cop: number;

  @Prop({ default: Date.now })
  created_at: Date;
}

export const ReservaIncomingAbonoSchema =
  SchemaFactory.createForClass(ReservaIncomingAbono);

ReservaIncomingAbonoSchema.index({ client_id: 1, created_at: -1 });
