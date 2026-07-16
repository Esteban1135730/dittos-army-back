import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IncomingHomologSessionDocument =
  HydratedDocument<IncomingHomologSession>;

export type IncomingHomologUnitStatus = 'pending' | 'verified' | 'novedad';

export type IncomingHomologSessionStatus =
  | 'in_progress'
  | 'ready'
  | 'converted'
  | 'cancelled';

@Schema({ _id: false })
export class IncomingHomologUnit {
  @Prop({ required: true })
  sent_unit_key: string;

  @Prop({ required: true })
  line_key: string;

  @Prop({ required: true })
  unit_index: number;

  @Prop({ required: true })
  order_id: number;

  @Prop({ required: true })
  order_code: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  expansion: string;

  @Prop({ default: '' })
  language: string;

  @Prop({ default: 0 })
  blueprint_id: number;

  /** Product CardTrader del order_item (match 1:1 con transit_lines.product_id). */
  @Prop({ type: Number, default: null })
  product_id: number | null;

  @Prop({ type: Number, default: null })
  unit_price_eur: number | null;

  @Prop({ type: Number, default: null })
  unit_price_fx: number | null;

  @Prop({ default: 'USD' })
  price_currency: string;

  @Prop({ type: String, default: null })
  paid_at: string | null;

  @Prop({ type: String, default: null })
  rareza: string | null;

  @Prop({ required: true, type: String })
  status: IncomingHomologUnitStatus;

  @Prop({ type: String, default: null })
  batch_item_id: string | null;

  @Prop({ type: String, default: null })
  batch_id: string | null;

  @Prop({ type: String, default: null })
  batch_item_card_id: string | null;

  @Prop({ type: String, default: null })
  batch_item_card_name: string | null;

  /** Línea en cardtrader_transit_lines (flujo CT). */
  @Prop({ type: String, default: null })
  transit_line_id: string | null;

  @Prop({ type: String, default: null })
  transit_lot_id: string | null;

  @Prop({ type: String, default: null })
  transit_line_card_id: string | null;

  @Prop({ type: String, default: null })
  transit_line_card_name: string | null;

  @Prop({ type: Number, default: null })
  unit_cost_cop: number | null;

  @Prop({ type: Number, default: null })
  purchase_price_eur: number | null;

  @Prop({ type: Number, default: null })
  purchase_price_fx: number | null;

  @Prop({ type: String, default: null })
  purchase_price_currency: string | null;

  @Prop({ type: Number, default: null })
  match_score: number | null;

  @Prop({ default: '' })
  novedad_notes: string;

  @Prop()
  verified_at?: Date;
}

export const IncomingHomologUnitSchema =
  SchemaFactory.createForClass(IncomingHomologUnit);

@Schema({ collection: 'incoming_homolog_sessions' })
export class IncomingHomologSession {
  @Prop({ required: true, type: String })
  status: IncomingHomologSessionStatus;

  @Prop({ type: Number, default: null })
  shipping_total_cop: number | null;

  @Prop({ type: String, default: null })
  ship_round_id: string | null;

  @Prop({ type: [IncomingHomologUnitSchema], default: [] })
  units: IncomingHomologUnit[];

  @Prop({ default: Date.now })
  cardtrader_synced_at: Date;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;

  @Prop()
  converted_at?: Date;
}

export const IncomingHomologSessionSchema = SchemaFactory.createForClass(
  IncomingHomologSession,
);

IncomingHomologSessionSchema.index({ status: 1 });
