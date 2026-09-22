import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IncomingBatchNovedadDocument =
  HydratedDocument<IncomingBatchNovedad>;

export type IncomingBatchNovedadSource = 'homolog_sent' | 'homolog_panel';

@Schema({ collection: 'incoming_batch_novedades' })
export class IncomingBatchNovedad {
  @Prop({ required: true })
  batch_item_id: string;

  @Prop({ required: true })
  batch_id: string;

  @Prop({ type: String, default: null })
  session_id: string | null;

  @Prop({ type: String, default: null })
  sent_unit_key: string | null;

  @Prop({ required: true })
  card_id: string;

  @Prop({ default: '' })
  card_name: string;

  @Prop({ required: true, type: String })
  source: IncomingBatchNovedadSource;

  @Prop({ default: '' })
  notes: string;

  @Prop({ default: false })
  resolved: boolean;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;
}

export const IncomingBatchNovedadSchema =
  SchemaFactory.createForClass(IncomingBatchNovedad);

IncomingBatchNovedadSchema.index({ batch_item_id: 1, resolved: 1 });
