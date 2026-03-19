export type StockDto = {
  id?: string;
  card_id: string;
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
};
