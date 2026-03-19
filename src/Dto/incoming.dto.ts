export type IncomingBatchItemInput = {
  card_id: string;
  language: string;
  quantity: number;
  // TOTAL EUR del lote para esa cantidad (SIN envío)
  eur_total_lot: number;
};

export type CreateIncomingBatchDto = {
  items: IncomingBatchItemInput[];
  // TOTAL COP de cartas SOLO (SIN envío) para todo el batch
  total_cop_cards_cost: number;
  // Fecha de compra del lote (ISO date)
  purchase_date: string;
};

export type CreateIncomingRoundDto = {
  // COP total del envío para esta tanda
  shipping_total_cop: number;
};

export type ReviewIncomingRoundDecision = {
  batch_item_id: string;
  arrived_quantity: number;
  novedad_quantity: number;
  novedad_notes?: string;
};

export type ReviewIncomingRoundDto = {
  decisions: ReviewIncomingRoundDecision[];
};

