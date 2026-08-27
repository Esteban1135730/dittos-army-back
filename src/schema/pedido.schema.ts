import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PedidoDocument = HydratedDocument<Pedido>;

export const PEDIDO_STATUSES = ['reservado', 'pagado', 'entregado'] as const;
export type PedidoStatus = (typeof PEDIDO_STATUSES)[number];

@Schema({ _id: false })
export class PedidoLineSnapshot {
  @Prop({ required: true })
  stock_id: string;

  @Prop({ required: true })
  card_id: string;

  @Prop({ required: false })
  card_name?: string;

  @Prop({ required: true })
  precio: number;

  @Prop({ default: 'COP' })
  currency: string;

  @Prop({ required: false })
  image_url?: string;

  /** Unidades de la línea (bulk). Ausente en unitarios legacy (= 1). */
  @Prop({ required: false })
  quantity?: number;
}

export const PedidoLineSnapshotSchema =
  SchemaFactory.createForClass(PedidoLineSnapshot);

@Schema({ collection: 'pedidos' })
export class Pedido {
  @Prop({ required: true, index: true })
  client_id: string;

  @Prop({ required: true, enum: PEDIDO_STATUSES })
  status: PedidoStatus;

  @Prop({ required: true })
  entrega_en_tienda: boolean;

  @Prop({ required: false })
  store_id?: string;

  @Prop({ required: false })
  store_name?: string;

  @Prop({ required: false })
  store_address?: string;

  @Prop({ required: false })
  ciudad?: string;

  @Prop({ required: false })
  direccion_o_punto?: string;

  @Prop({ required: false })
  notas_entrega?: string;

  @Prop({ type: Date, required: false })
  fecha_tentativa_entrega?: Date;

  @Prop({ type: Date, required: false })
  paid_at?: Date;

  @Prop({ type: Date, required: false })
  delivered_at?: Date;

  @Prop({ type: [PedidoLineSnapshotSchema], required: false, default: [] })
  lines_snapshot?: PedidoLineSnapshot[];

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;
}

export const PedidoSchema = SchemaFactory.createForClass(Pedido);
PedidoSchema.index({ client_id: 1, status: 1 });
PedidoSchema.index({ client_id: 1, created_at: -1 });
