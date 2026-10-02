import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IncomingShipRoundDocument = HydratedDocument<IncomingShipRound>;

export type IncomingShipRoundStatus = 'reviewing' | 'finalized';

@Schema()
export class IncomingShipRound {
  @Prop({ required: true })
  shipping_total_cop: number;

  @Prop({ default: 'reviewing' })
  status: IncomingShipRoundStatus;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop()
  finalized_at?: Date;
}

export const IncomingShipRoundSchema =
  SchemaFactory.createForClass(IncomingShipRound);
IncomingShipRoundSchema.index({ status: 1, created_at: -1 });
