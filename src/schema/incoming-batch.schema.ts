import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IncomingBatchDocument = HydratedDocument<IncomingBatch>;

export type IncomingBatchStatus = 'open' | 'completed';

@Schema()
export class IncomingBatch {
  @Prop({ required: true })
  status: IncomingBatchStatus;

  // Fecha de compra definida por usuario para identificar el lote
  @Prop({ required: true })
  purchase_date: Date;

  // Sumatoria de costos SOLO de cartas (sin envío) en EUR para todo el batch.
  @Prop({ required: true })
  total_eur_cards_cost: number;

  // Sumatoria del costo real de cartas SOLO en COP (sin envío) para todo el batch.
  @Prop({ required: true })
  total_cop_cards_cost: number;

  // COP por 1 EUR calculado como: total_cop_cards_cost / total_eur_cards_cost
  @Prop({ required: true })
  real_euro_rate_cop_per_eur: number;

  @Prop({ default: Date.now })
  created_at: Date;
}

export const IncomingBatchSchema = SchemaFactory.createForClass(IncomingBatch);
