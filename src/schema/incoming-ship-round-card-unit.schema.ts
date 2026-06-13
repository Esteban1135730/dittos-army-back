import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IncomingShipRoundCardUnitDocument =
  HydratedDocument<IncomingShipRoundCardUnit>;

/** Precio individual por carta física al crear tanda desde homologación v2. */
@Schema({ collection: 'incoming_ship_round_card_units' })
export class IncomingShipRoundCardUnit {
  @Prop({ required: true })
  ship_round_id: string;

  @Prop({ required: true })
  batch_item_id: string;

  @Prop({ required: true })
  sent_unit_key: string;

  @Prop({ type: Number, required: true })
  purchase_price_eur: number;

  @Prop({ type: Number, required: true })
  unit_cost_cop: number;

  @Prop({ default: '' })
  novedad_notes: string;

  @Prop({ default: false })
  is_novedad: boolean;

  @Prop({ default: Date.now })
  created_at: Date;
}

export const IncomingShipRoundCardUnitSchema = SchemaFactory.createForClass(
  IncomingShipRoundCardUnit,
);

IncomingShipRoundCardUnitSchema.index({ ship_round_id: 1 });
