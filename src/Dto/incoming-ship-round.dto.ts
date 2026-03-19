export type CreateIncomingShipRoundDto = {
  shipping_total_cop: number;
};

export type ReviewIncomingShipRoundDecision = {
  batch_item_id: string;
  arrived_quantity: number;
  novedad_quantity: number;
  novedad_notes?: string;
};

export type ReviewIncomingShipRoundDto = {
  decisions: ReviewIncomingShipRoundDecision[];
};

