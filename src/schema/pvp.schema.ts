import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PvpDocument = HydratedDocument<Pvp>;

@Schema()
export class Pvp {
  @Prop({ required: true })
  card_id: string;

  @Prop({ required: true })
  pvp: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;
}

export const PvpSchema = SchemaFactory.createForClass(Pvp);

