import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { OWNER_KEYS, type OwnerKey } from '../config/owners.config';

export type ReservaDocument = HydratedDocument<Reserva>;

@Schema()
export class Reserva {
  @Prop({ required: true })
  client_id: string;

  @Prop({ required: true })
  stock_id: string;

  @Prop({ required: true })
  precio: number;

  @Prop({ default: 'COP' })
  currency: string;

  /**
   * Unidades reservadas. Significativo para `product_kind === 'quantity'` (p. ej. bulk).
   * Ausente en documentos unitarios legacy (= 1).
   */
  @Prop({ required: false, default: 1 })
  quantity?: number;

  /** Pedido de stock al que pertenece. Ausente en reservas materializadas de incoming. */
  @Prop({ required: false })
  pedido_id?: string;

  /**
   * Owner de la DB donde vive el stock (044). Opcional en documentos viejos
   * (= owner del request al leer). En altas nuevas siempre se persiste.
   */
  @Prop({ required: false, enum: OWNER_KEYS })
  stock_owner?: OwnerKey;

  /** Fecha de creación; las nuevas reservas la rellena el repositorio. Opcional en documentos antiguos. */
  @Prop({ type: Date, required: false })
  created_at?: Date;

  @Prop({ type: Date, required: false })
  updated_at?: Date;
}

export const ReservaSchema = SchemaFactory.createForClass(Reserva);
ReservaSchema.index({ pedido_id: 1 });
ReservaSchema.index({ client_id: 1, created_at: -1 });
ReservaSchema.index({ stock_id: 1 });
