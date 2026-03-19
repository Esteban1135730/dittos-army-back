import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IncomingBatchItemDocument = HydratedDocument<IncomingBatchItem>;

@Schema()
export class IncomingBatchItem {
  @Prop({ required: true })
  batch_id: string;

  @Prop({ required: true })
  card_id: string;

  // Idioma del ítem que se compró (no el idioma del título en UI)
  @Prop({ required: true })
  language: string;

  // Cantidad de cartas compradas para este card_id+language
  @Prop({ required: true })
  quantity_ordered: number;

  // Total EUR del lote para esta cantidad (sin envío)
  @Prop({ required: true })
  eur_total_lot: number;

  // EUR unitario calculado como eur_total_lot / quantity_ordered
  @Prop({ required: true })
  eur_unit_price: number;

  // Costo unitario real COP para cartas (sin envío)
  @Prop({ required: true })
  unit_cost_cop: number;

  // Se irá decrementando con cada finalize de round
  @Prop({ required: true })
  remaining_quantity: number;

  // Enriquecimiento para UI
  @Prop()
  card_name?: string;

  @Prop()
  image_url?: string;

  @Prop({ default: Date.now })
  created_at: Date;
}

export const IncomingBatchItemSchema = SchemaFactory.createForClass(
  IncomingBatchItem,
);

