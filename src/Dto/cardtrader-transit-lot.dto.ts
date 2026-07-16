export type CardtraderTransitLineInput = {
  card_id: string;
  language: string;
  quantity: number;
  fx_total_lot: number;
  rareza?: string | null;
  card_name?: string;
  image_url?: string;
  ct0_item_id?: number;
  product_id?: number;
  blueprint_id?: number;
  expansion?: string;
  collector_number?: string;
};

export type CreateCardtraderTransitLotDto = {
  items: CardtraderTransitLineInput[];
  total_cop_cards_cost: number;
  purchase_date: string;
  cards_cost_currency?: string;
  source?: 'ct0' | 'manual';
  ct0_package_key?: string;
  legacy_incoming_batch_id?: string;
  legacy_incoming_cop_hint?: number;
  /** Respaldo si el batch legacy no se encuentra en BD. */
  legacy_basis_total_fx_cards_cost?: number;
  legacy_basis_total_cop_cards_cost?: number;
  legacy_basis_real_fx_rate_cop?: number;
  legacy_basis_cards_cost_currency?: string;
};

export type UpdateCardtraderTransitLotDto = {
  purchase_date?: string;
  total_cop_cards_cost?: number;
  cards_cost_currency?: string;
};
