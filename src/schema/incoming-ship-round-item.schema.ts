import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IncomingShipRoundItemDocument =
  HydratedDocument<IncomingShipRoundItem>;

@Schema()
export class IncomingShipRoundItem {
  @Prop({ required: true })
  ship_round_id: string;

  @Prop({ required: true })
  batch_item_id: string;

  @Prop({ default: 0 })
  arrived_quantity: number;

  // Subconjunto de arrived_quantity
  @Prop({ default: 0 })
  novedad_quantity: number;

  @Prop({ default: '' })
  novedad_notes: string;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;
}

export const IncomingShipRoundItemSchema = SchemaFactory.createForClass(
  IncomingShipRoundItem,
);
IncomingShipRoundItemSchema.index({ ship_round_id: 1, batch_item_id: 1 });
