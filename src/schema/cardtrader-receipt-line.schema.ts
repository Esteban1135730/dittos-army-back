import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CardtraderReceiptLineDocument =
  HydratedDocument<CardtraderReceiptLine>;

@Schema({ collection: 'cardtrader_receipt_lines' })
export class CardtraderReceiptLine {
  @Prop({ required: true })
  session_id: string;

  @Prop({ required: true })
  transit_line_id: string;

  @Prop({ required: true })
  transit_lot_id: string;

  @Prop({ required: true })
  card_id: string;

  @Prop({ default: '' })
  card_name: string;

  @Prop({ default: '' })
  image_url: string;

  @Prop({ default: '' })
  language: string;

  @Prop({ type: String, default: null })
  rareza: string | null;

  @Prop({ type: String, default: null })
  collector_number: string | null;

  @Prop({ type: String, default: null })
  expansion: string | null;

  /** Snapshot CT blueprint (agrupar UI recepción por carta, no por lote). */
  @Prop({ type: Number, required: false, default: null })
  blueprint_id?: number | null;

  /** Snapshot de remaining_quantity al abrir sesión. */
  @Prop({ required: true })
  quantity_expected: number;

  @Prop({ required: true, type: Number })
  fx_unit_price: number;

  @Prop({ required: true, type: Number })
  unit_cost_cop: number;

  @Prop({ required: true, type: String })
  status: 'pending' | 'received' | 'inconsistency';

  @Prop({ type: Number, default: null })
  received_qty: number | null;

  @Prop({ type: String, default: null })
  inconsistency_type: 'not_arrived' | 'wrong_quantity' | 'wrong_card' | null;

  @Prop({ default: '' })
  notes: string;

  /** Rellenado en finalize con el _id del Stock creado. */
  @Prop({ type: String, default: null })
  stock_id: string | null;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;
}

export const CardtraderReceiptLineSchema = SchemaFactory.createForClass(
  CardtraderReceiptLine,
);

CardtraderReceiptLineSchema.index({ session_id: 1 });
CardtraderReceiptLineSchema.index({ transit_line_id: 1 });
