/**
 * Entrada HTTP para crear/actualizar stock.
 * `card_name` debe enviarse siempre (cadena vacía solo para datos legados / migraciones).
 */
export type StockDto = {
  id?: string;
  card_id: string;
  card_name: string;
  shipment: number;
  unity_cost: number;
  cards_in_shipmet: number;
  image_url: string;
  card_state?: string;
  language?: string;
  holofoil?: boolean;
  league_card?: boolean;
  currency: string;
  incoming_notes?: string;
  /** Variante operativa (mismo catálogo que incoming / PVP); null en update = sin variante */
  rareza?: string | null;
  /** Tags de clasificación; catálogo cerrado en backend */
  tags?: string[];
};
