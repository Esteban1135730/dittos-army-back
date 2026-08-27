export type PedidoCreateDto = {
  client_id: string;
  entrega_en_tienda: boolean;
  store_id?: string;
  ciudad?: string;
  direccion_o_punto?: string;
  notas_entrega?: string;
  fecha_tentativa_entrega: string;
};

export type PedidoPatchDto = {
  entrega_en_tienda?: boolean;
  store_id?: string;
  ciudad?: string;
  direccion_o_punto?: string;
  notas_entrega?: string;
  fecha_tentativa_entrega?: string;
};

export type PedidoLineDto = {
  stock_id: string;
  card_id: string;
  card_name?: string;
  precio: number;
  currency: string;
  image_url?: string;
  quantity?: number;
};

export type PedidoResponseDto = {
  id: string;
  _id: string;
  client_id: string;
  status: 'reservado' | 'pagado' | 'entregado';
  entrega_en_tienda: boolean;
  store_id?: string;
  store_name?: string;
  store_address?: string;
  ciudad?: string;
  direccion_o_punto?: string;
  notas_entrega?: string;
  fecha_tentativa_entrega: string | null;
  paid_at?: string | null;
  delivered_at?: string | null;
  lines: PedidoLineDto[];
  created_at: string;
  updated_at: string;
};
