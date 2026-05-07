/** Línea de carta para alta masiva desde producto sellado abierto. */
export type FromOpenedSealedLineDto = {
  card_id: string;
  card_name: string;
  language: string;
  image_url?: string;
  rareza?: string | null;
  holofoil?: boolean;
  league_card?: boolean;
};

/** Body JSON para POST /stock/from-opened-sealed */
export type FromOpenedSealedBodyDto = {
  product_cost_cop: number;
  lines: FromOpenedSealedLineDto[];
  /** Parte del costo que no entra al inventario (default 0.3). Debe cumplir 0 ≤ x < 1. */
  non_stock_fraction?: number;
  /** Texto opcional incluido en incoming_notes */
  source_label?: string;
};
