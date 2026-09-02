import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PedidoAbonoDocument = HydratedDocument<PedidoAbono>;

/** Abono de capital (COP) contra un pedido de stock. */
@Schema({ collection: 'pedido_abono' })
export class PedidoAbono {
  @Prop({ required: true })
  pedido_id: string;

  @Prop({ required: true, min: 1 })
  amount_cop: number;

  @Prop({ default: Date.now })
  created_at: Date;
}

export const PedidoAbonoSchema = SchemaFactory.createForClass(PedidoAbono);

PedidoAbonoSchema.index({ pedido_id: 1, created_at: -1 });
