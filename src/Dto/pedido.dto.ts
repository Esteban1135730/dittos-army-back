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

export type PedidoMapaDto =
  | { kind: 'tienda'; store_id: string; lat: number; lng: number }
  | { kind: 'domicilio_bogota' }
  | { kind: 'omitido'; reason: 'fuera_bogota' | 'sin_direccion' };

export type PedidoCalendarioItemDto = {
  id: string;
  client_id: string;
  client_name: string;
  status: 'reservado' | 'pagado';
  entrega_en_tienda: boolean;
  store_id?: string;
  store_name?: string;
  store_address?: string;
  ciudad?: string;
  direccion_o_punto?: string;
  notas_entrega?: string;
  fecha_tentativa_entrega: string;
  overdue: boolean;
  mapa: PedidoMapaDto;
};

export type PedidoCalendarioResponseDto = {
  from: string;
  to: string;
  today: string;
  items: PedidoCalendarioItemDto[];
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
