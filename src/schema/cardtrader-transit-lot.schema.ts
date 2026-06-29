import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CardtraderTransitLotDocument =
  HydratedDocument<CardtraderTransitLot>;

export type CardtraderTransitLotStatus = 'open' | 'completed';

export type CardtraderTransitLotSource = 'ct0' | 'manual';

@Schema({ collection: 'cardtrader_transit_lots' })
export class CardtraderTransitLot {
  @Prop({ required: true })
  status: CardtraderTransitLotStatus;

  /** Origen del lote (CT Zero, manual, etc.). */
  @Prop({ required: true, default: 'ct0' })
  source: CardtraderTransitLotSource;

  /** Clave de checkout CT Zero (`paid_at` ISO). Evita duplicados. */
  @Prop({ required: false, sparse: true, unique: true })
  ct0_package_key?: string;

  @Prop({ required: true })
  purchase_date: Date;

  /** Suma costos de cartas en moneda FX (USD/EUR), sin envío. Con legacy = total original del batch. */
  @Prop({ required: true })
  total_fx_cards_cost: number;

  /** Suma FX de las líneas registradas en este lote (subset CT0). */
  @Prop()
  registered_items_fx_subtotal?: number;

  @Prop({ required: true })
  total_cop_cards_cost: number;

  /** COP por 1 unidad de moneda FX: total_cop / total_fx. */
  @Prop({ required: true })
  real_fx_rate_cop: number;

  @Prop({ default: 'USD' })
  cards_cost_currency: string;

  /** Referencia opcional al lote legacy (compras en camino antiguas). */
  @Prop()
  legacy_incoming_batch_id?: string;

  @Prop()
  legacy_incoming_cop_hint?: number;

  @Prop({ default: Date.now })
  created_at: Date;
}

export const CardtraderTransitLotSchema =
  SchemaFactory.createForClass(CardtraderTransitLot);

CardtraderTransitLotSchema.index(
  { ct0_package_key: 1 },
  { unique: true, sparse: true },
);
