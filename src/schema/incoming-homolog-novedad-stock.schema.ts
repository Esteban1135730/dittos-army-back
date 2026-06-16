import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IncomingHomologNovedadStockDocument =
  HydratedDocument<IncomingHomologNovedadStock>;

export type HomologNovedadStockStatus = 'pending' | 'in_stock' | 'resolved';

@Schema({ collection: 'incoming_homolog_novedad_stock' })
export class IncomingHomologNovedadStock {
  @Prop({ required: true })
  session_id: string;

  @Prop({ required: true, unique: true })
  sent_unit_key: string;

  @Prop({ type: String, default: null })
  stock_id: string | null;

  @Prop({ required: true })
  card_name: string;

  @Prop({ default: '' })
  card_id: string;

  @Prop({ default: '' })
  expansion: string;

  @Prop({ default: '' })
  language: string;

  @Prop({ default: 0 })
  blueprint_id: number;

  @Prop({ type: String, default: null })
  rareza: string | null;

  @Prop({ default: '' })
  order_code: string;

  @Prop({ type: Number, default: null })
  purchase_price_fx: number | null;

  @Prop({ default: 'USD' })
  price_currency: string;

  @Prop({ type: Number, default: null })
  unit_cost_cop: number | null;

  @Prop({ default: '' })
  novedad_notes: string;

  @Prop({ default: '' })
  image_url: string;

  @Prop({ required: true, type: String })
  status: HomologNovedadStockStatus;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;

  @Prop({ type: Date, default: null })
  stock_created_at: Date | null;

  @Prop({ type: Date, default: null })
  resolved_at: Date | null;
}

export const IncomingHomologNovedadStockSchema = SchemaFactory.createForClass(
  IncomingHomologNovedadStock,
);

IncomingHomologNovedadStockSchema.index({ status: 1, created_at: -1 });
IncomingHomologNovedadStockSchema.index({ session_id: 1 });
