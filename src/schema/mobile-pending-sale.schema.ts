import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { OwnerKey } from '../config/owners.config';

export type MobilePendingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'conflict';

export type MobilePendingSaleDocument = HydratedDocument<MobilePendingSale>;

@Schema({ collection: 'mobile_pending_sales' })
export class MobilePendingSale {
  @Prop({ required: true })
  stock_id: string;

  @Prop({ required: true, enum: ['pablo', 'esteban'] })
  stock_owner: OwnerKey;

  @Prop({ required: true })
  amount_cop: number;

  @Prop({ required: false })
  notes?: string;

  @Prop({ required: true })
  client_sale_id: string;

  @Prop({ required: false })
  card_name?: string;

  @Prop({ required: false })
  image_url?: string;

  @Prop({ required: false })
  card_id?: string;

  @Prop({
    required: true,
    enum: ['pending', 'accepted', 'rejected', 'conflict'],
    default: 'pending',
  })
  status: MobilePendingStatus;

  @Prop({ required: false })
  sale_id?: string;

  @Prop({ required: false })
  conflict_reason?: string;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ required: false })
  resolved_at?: Date;
}

export const MobilePendingSaleSchema =
  SchemaFactory.createForClass(MobilePendingSale);

MobilePendingSaleSchema.index({ client_sale_id: 1 }, { unique: true });
MobilePendingSaleSchema.index(
  { stock_id: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);
MobilePendingSaleSchema.index({ status: 1, created_at: -1 });
