import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CardStockTagDocument = HydratedDocument<CardStockTag>;

/** Tags operativos por carta (TCG `card_id`), no por línea de stock. */
@Schema({ collection: 'card_stock_tags' })
export class CardStockTag {
  @Prop({ required: true, unique: true })
  card_id: string;

  @Prop({ type: [String], default: [] })
  tags: string[];
}

export const CardStockTagSchema = SchemaFactory.createForClass(CardStockTag);
