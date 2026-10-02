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

  // COP por 1 unidad de moneda de compra (EUR o USD): total_cop / total_fx_cards_cost
  @Prop({ required: true })
  real_euro_rate_cop_per_eur: number;

  /** Moneda en la que se registraron los costos de cartas (eur_* almacenan esa moneda). */
  @Prop({ default: 'EUR' })
  cards_cost_currency: string;

  @Prop({ default: Date.now })
  created_at: Date;
}

export const IncomingBatchSchema = SchemaFactory.createForClass(IncomingBatch);
IncomingBatchSchema.index({ status: 1, created_at: -1 });
