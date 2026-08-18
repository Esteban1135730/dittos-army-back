export type ReservaDto = {
  id?: string;
  client_id: string;
  stock_id: string;
  precio: number;
  currency?: string;
  /** Unidades; solo aplica a productos `quantity` (p. ej. bulk). Default 1. */
  quantity?: number;
  pedido_id?: string;
};
