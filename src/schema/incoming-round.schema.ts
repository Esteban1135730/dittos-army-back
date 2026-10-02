import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IncomingRoundDocument = HydratedDocument<IncomingRound>;

export type IncomingRoundStatus = 'reviewing' | 'finalized';

@Schema()
export class IncomingRound {
  @Prop({ required: true })
  batch_id: string;

  @Prop({ required: true })
  round_index: number;

  // COP total del envío para esta tanda (se reparte SOLO entre arribadas de esta tanda)
  @Prop({ required: true })
  shipping_total_cop: number;

  @Prop({ default: 'reviewing' })
  status: IncomingRoundStatus;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop()
  finalized_at?: Date;
}

export const IncomingRoundSchema = SchemaFactory.createForClass(IncomingRound);
IncomingRoundSchema.index({ batch_id: 1 });
