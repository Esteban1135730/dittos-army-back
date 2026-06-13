export type VerifyHomologUnitDto = {
  batch_item_id: string;
  match_score?: number;
};

export type NovedadHomologUnitDto = {
  notes: string;
  batch_item_id?: string;
};

export type CreateHomologTandaDto = {
  shipping_total_cop: number;
  cards: Array<{
    sent_unit_key: string;
    batch_item_id: string;
    purchase_price_eur: number;
    unit_cost_cop: number;
    is_novedad?: boolean;
    novedad_notes?: string;
  }>;
};

export type CreateBatchNovedadDto = {
  batch_item_id: string;
  notes: string;
  sent_unit_key?: string;
  session_id?: string;
};
