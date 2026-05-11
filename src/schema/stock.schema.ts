import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StockDocument = HydratedDocument<Stock>;

@Schema()
export class Stock {

  @Prop()
  card_id: string;

  @Prop()
  shipment: number;

  @Prop()
  unity_cost: number;

  @Prop()
  cards_in_shipmet: number;

  @Prop()
  image_url: string;

  @Prop()
  card_state: string;

  @Prop()
  languaje: string;

  @Prop()
  language: string;

  @Prop()
  holofoil: boolean;

  @Prop()
  league_card: boolean;

  @Prop({ default: '' })
  card_name: string;

  @Prop()
  currency: string;

  // Notas provenientes del flujo "compras en camino" (novedad/cambio)
  @Prop({ required: false })
  incoming_notes?: string;

  /** Variante del lote / manual: hollow, foil, pokeball, masterball, first edition, holofoil, league card */
  @Prop({ type: String, required: false })
  rareza?: string;

  /** Etiquetas de filtro operativo (vintage, bulk, jugable); independientes de rareza y card_state */
  @Prop({ type: [String], default: [] })
  tags?: string[];
}

export const StockSchema = SchemaFactory.createForClass(Stock);
