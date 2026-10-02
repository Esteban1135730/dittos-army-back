import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SaleDocument = HydratedDocument<Sale>;

@Schema()
export class Sale {
  @Prop({ required: true })
  stock_id: string;

  @Prop({ required: true })
  card_id: string;

  @Prop({ required: true })
  type: 'venta' | 'reserva' | 'propiedad';

  @Prop({ required: true })
  amount_cop: number;

  @Prop()
  notes: string;

  /** Cliente MongoDB (hex); solo ventas finalizadas desde reserva / flujos que lo rellenen. */
  @Prop({ required: false })
  client_id?: string;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ required: false })
  cycle_closed_at?: Date;

  /** Costo COP de la línea al momento de la venta (analítica 036). */
  @Prop({ required: false })
  cost_cop_snapshot?: number;

  /** PVP COP si se resolvió en el flujo de venta. */
  @Prop({ required: false })
  pvp_cop_snapshot?: number;

  @Prop({ required: false })
  product_kind_snapshot?: string;

  @Prop({ required: false })
  rareza_snapshot?: string;

  /**
   * Tags operativos al momento de la venta (vintage/bulk/jugable/brillo).
   * Preferido en métricas frente al mapa vivo `card_stock_tags`.
   */
  @Prop({ type: [String], required: false })
  tags_snapshot?: string[];

  /**
   * Fecha de recepción/ingreso a inventario al vender
   * (`stocked_at` o timestamp ObjectId del stock).
   */
  @Prop({ required: false })
  received_at_snapshot?: Date;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);
SaleSchema.index({ type: 1, created_at: 1 });
SaleSchema.index({ stock_id: 1 });
SaleSchema.index({ client_id: 1, created_at: -1 });
SaleSchema.index({ type: 1, cycle_closed_at: -1, created_at: -1 });
