import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { StockTag } from '../constants/stock-tags';

export type StockReviewSessionDocument =
  HydratedDocument<StockReviewSession>;

export type StockReviewOutcome =
  | 'perdida'
  | 'propiedad'
  | 'vendida'
  | 'en_stock';

export type StockReviewSessionStatus =
  | 'en_verificacion'
  | 'pendiente_resolucion'
  | 'completada'
  | 'cancelada';

export type StockReviewScope = 'all' | 'tag';

@Schema({ _id: false })
export class StockReviewSessionItem {
  @Prop({ required: true })
  stock_id: string;

  @Prop({ required: true })
  card_id: string;

  @Prop({ default: '' })
  card_name: string;

  @Prop()
  image_url?: string;

  @Prop({ required: true })
  card_state_snapshot: string;

  @Prop()
  language?: string;

  @Prop({ type: String, required: false, default: null })
  rareza?: string | null;

  @Prop({ default: false })
  verified: boolean;

  @Prop()
  verified_at?: Date;

  @Prop({ type: String, required: false })
  outcome?: StockReviewOutcome;

  @Prop()
  resolved_at?: Date;

  @Prop({ default: false })
  obsolete?: boolean;
}

export const StockReviewSessionItemSchema = SchemaFactory.createForClass(
  StockReviewSessionItem,
);

@Schema({ collection: 'stock_review_sessions' })
export class StockReviewSession {
  /** `all` = todo el stock elegible; `tag` = filtrado por tag. Legacy sin campo → `tag`. */
  @Prop({ type: String, required: false, default: 'tag' })
  scope?: StockReviewScope;

  /** Tag si scope=tag; null si scope=all. Legacy: siempre string. */
  @Prop({ type: String, required: false, default: null })
  tag: StockTag | null;

  @Prop({ required: true, type: String })
  status: StockReviewSessionStatus;

  @Prop({ type: [StockReviewSessionItemSchema], default: [] })
  items: StockReviewSessionItem[];

  @Prop({ default: () => new Date() })
  created_at: Date;

  @Prop({ default: () => new Date() })
  updated_at: Date;

  @Prop()
  completed_at?: Date;
}

export const StockReviewSessionSchema =
  SchemaFactory.createForClass(StockReviewSession);

StockReviewSessionSchema.index({ status: 1 });
