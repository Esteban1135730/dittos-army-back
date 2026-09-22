import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CardtraderTransitLineDocument =
  HydratedDocument<CardtraderTransitLine>;

@Schema({ collection: 'cardtrader_transit_lines' })
export class CardtraderTransitLine {
  @Prop({ required: true })
  lot_id: string;

  @Prop({ required: true })
  card_id: string;

  @Prop({ required: true })
  language: string;

  @Prop({ required: true })
  quantity_ordered: number;

  /** Total en moneda FX para esta cantidad (sin envío). */
  @Prop({ required: true })
  fx_total_lot: number;

  @Prop({ required: true })
  fx_unit_price: number;

  @Prop({ required: true })
  unit_cost_cop: number;

  @Prop({ required: true })
  remaining_quantity: number;

  @Prop()
  card_name?: string;

  @Prop()
  image_url?: string;

  @Prop({ type: String, required: false })
  rareza?: string;

  @Prop()
  ct0_item_id?: number;

  /** Product CardTrader del que salió el CT0 box item (vínculo con order_items.product_id). */
  @Prop()
  product_id?: number;

  @Prop()
  blueprint_id?: number;

  @Prop()
  expansion?: string;

  @Prop()
  collector_number?: string;

  /** Marcada manualmente como no llegada (CT0 missing); excluir de Próximamente. */
  @Prop({ required: false })
  not_arrived_at?: Date;

  @Prop({ default: Date.now })
  created_at: Date;
}

export const CardtraderTransitLineSchema = SchemaFactory.createForClass(
  CardtraderTransitLine,
);

CardtraderTransitLineSchema.index({ lot_id: 1 });
