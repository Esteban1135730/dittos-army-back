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

  /** @deprecated En runtime los tags viven en `card_stock_tags` por `card_id`. Puede existir en documentos legacy hasta migrar. */
  @Prop({ type: [String], default: [] })
  tags?: string[];

  /** `'unit'` (legacy / default) | `'quantity'` (SKU con existencias, p. ej. bulk). */
  @Prop({ type: String, required: false })
  product_kind?: string;

  /** Existencias restantes; significativo solo si `product_kind === 'quantity'`. */
  @Prop({ type: Number, required: false })
  quantity?: number;

  /** Fecha de ingreso a inventario (analítica 036). */
  @Prop({ required: false, type: Date })
  stocked_at?: Date;

  /** Momento de baja por pérdida. */
  @Prop({ required: false, type: Date })
  lost_at?: Date;

  /** Costo COP al marcar pérdida. */
  @Prop({ required: false, type: Number })
  lost_cost_cop?: number;
}

export const StockSchema = SchemaFactory.createForClass(Stock);
