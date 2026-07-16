export type ReceiveLineDto = {
  received_qty: number;
  notes?: string;
};

export type InconsistencyLineDto = {
  type: 'not_arrived' | 'wrong_quantity' | 'wrong_card';
  notes: string;
};

export type FinalizeReceiptDto = {
  shipping_total_cop: number;
};
