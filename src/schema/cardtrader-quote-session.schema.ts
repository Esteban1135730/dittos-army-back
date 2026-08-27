import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CardtraderQuoteSessionDocument =
  HydratedDocument<CardtraderQuoteSession>;

export type QuoteSessionStatus = 'in_progress' | 'completed' | 'cancelled';
export type QuoteSessionSource = 'whatsapp' | 'urls';
export type QuoteSessionLineStatus = 'pending' | 'picked' | 'skipped';
export type QuoteSessionResolveStatus = 'matched' | 'ambiguous' | 'not_found';

@Schema({ _id: false })
export class QuoteSessionBlueprintRef {
  @Prop({ required: true })
  blueprint_id: number;

  @Prop({ required: true })
  expansion_id: number;

  @Prop({ default: '' })
  expansion_name: string;

  @Prop({ default: '' })
  name: string;

  @Prop({ default: '' })
  collector_number: string;

  @Prop({ type: String, default: null })
  image_url: string | null;
}

export const QuoteSessionBlueprintRefSchema = SchemaFactory.createForClass(
  QuoteSessionBlueprintRef,
);

@Schema({ _id: false })
export class QuoteSessionLine {
  @Prop({ required: true })
  index: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  expansion: string;

  @Prop({ required: true })
  collector_number: string;

  @Prop({ type: String, default: null })
  language_label: string | null;

  @Prop({ type: String, default: null })
  condition_label: string | null;

  @Prop({ type: Object, required: true })
  resolve: Record<string, unknown>;

  @Prop({ type: QuoteSessionBlueprintRefSchema, default: null })
  selected_blueprint: QuoteSessionBlueprintRef | null;

  @Prop({ required: true, type: String })
  line_status: QuoteSessionLineStatus;
}

export const QuoteSessionLineSchema =
  SchemaFactory.createForClass(QuoteSessionLine);

@Schema({ collection: 'cardtrader_quote_sessions', timestamps: true })
export class CardtraderQuoteSession {
  @Prop({ required: true, type: String })
  status: QuoteSessionStatus;

  @Prop({ required: true, type: String })
  source: QuoteSessionSource;

  @Prop({ required: true })
  raw_paste: string;

  @Prop({ default: 0 })
  active_index: number;

  @Prop({ type: [QuoteSessionLineSchema], default: [] })
  lines: QuoteSessionLine[];
}

export const CardtraderQuoteSessionSchema = SchemaFactory.createForClass(
  CardtraderQuoteSession,
);

CardtraderQuoteSessionSchema.index({ status: 1, createdAt: -1 });
