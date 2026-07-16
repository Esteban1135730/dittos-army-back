import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CardtraderSentUnitDocument = HydratedDocument<CardtraderSentUnit>;

@Schema({ collection: 'cardtrader_sent_units' })
export class CardtraderSentUnit {
  @Prop({ required: true, unique: true })
  unit_key: string;

  @Prop({ required: true })
  line_key: string;

  @Prop({ required: true })
  unit_index: number;

  @Prop({ required: true })
  order_id: number;

  @Prop({ required: true })
  order_code: string;

  @Prop({ required: true })
  order_item_id: number;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  expansion: string;

  @Prop({ default: '' })
  language: string;

  @Prop({ default: 0 })
  blueprint_id: number;

  @Prop({ type: Number, default: null })
  product_id: number | null;

  @Prop({ type: String, default: null })
  collector_number: string | null;

  @Prop({ type: String, default: null })
  rareza: string | null;

  @Prop({ type: Number, default: null })
  unit_price_eur: number | null;

  @Prop({ default: 'EUR' })
  price_currency: string;

  @Prop({ default: 0 })
  unit_price_raw: number;

  @Prop({ required: true })
  paid_at: string;

  @Prop({ type: String, default: null })
  sent_at: string | null;

  @Prop({ default: 'sent' })
  order_state: string;

  @Prop({ type: Object, default: {} })
  properties: Record<string, unknown>;

  @Prop({ default: Date.now })
  first_seen_at: Date;

  @Prop({ default: Date.now })
  last_synced_at: Date;
}

export const CardtraderSentUnitSchema =
  SchemaFactory.createForClass(CardtraderSentUnit);
