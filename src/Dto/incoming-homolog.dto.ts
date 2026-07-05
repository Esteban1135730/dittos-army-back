export type VerifyHomologUnitDto = {
  /** Línea en tránsito CardTrader (flujo actual). */
  transit_line_id: string;
  match_score?: number;
  /** @deprecated Solo sesiones legacy. */
  batch_item_id?: string;
};

export type NovedadHomologUnitDto = {
  notes: string;
  transit_line_id?: string;
  batch_item_id?: string;
};

export type CreateHomologTandaDto = {
  shipping_total_cop: number;
  cards: Array<{
    sent_unit_key: string;
    transit_line_id?: string;
    /** @deprecated Solo sesiones legacy. */
    batch_item_id?: string;
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

export type MaterializeNovedadStockDto = {
  session_id?: string;
  euro_to_cop: number;
  usd_to_cop: number;
};

export type UndoNovedadStockDto = {
  session_id?: string;
  tracking_ids?: string[];
};
