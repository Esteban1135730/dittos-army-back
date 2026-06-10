import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SaleDocument = HydratedDocument<Sale>;

@Schema()
export class Sale {
  @Prop({ required: true })
  stock_id: string;

  @Prop({ required: true })
  card_id: string;

  @Prop({ required: true })
  type: 'venta' | 'reserva' | 'propiedad';

  @Prop({ required: true })
  amount_cop: number;

  @Prop()
  notes: string;

  /** Cliente MongoDB (hex); solo ventas finalizadas desde reserva / flujos que lo rellenen. */
  @Prop({ required: false })
  client_id?: string;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ required: false })
  cycle_closed_at?: Date;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);
