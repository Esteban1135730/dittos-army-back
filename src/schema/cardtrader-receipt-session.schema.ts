import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CardtraderReceiptSessionDocument =
  HydratedDocument<CardtraderReceiptSession>;

@Schema({ collection: 'cardtrader_receipt_sessions' })
export class CardtraderReceiptSession {
  @Prop({ required: true, type: String })
  status: 'open' | 'finalized' | 'cancelled';

  @Prop({ type: [String], default: [] })
  lot_ids: string[];

  @Prop({ type: Number, default: null })
  shipping_total_cop: number | null;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ type: Date, default: null })
  finalized_at: Date | null;
}

export const CardtraderReceiptSessionSchema =
  SchemaFactory.createForClass(CardtraderReceiptSession);

CardtraderReceiptSessionSchema.index({ status: 1 });
