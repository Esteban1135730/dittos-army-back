export type MetricsAnalyticsResponse = {
  generated_at: string;
  period: { from: string; to: string };
  summary: {
    units_sold: number;
    revenue_cop: number;
    cost_cop: number;
    gross_profit_cop: number;
    gross_margin_pct: number | null;
    aov_cop: number | null;
    tickets_count: number;
    cost_data_quality: {
      with_snapshot: number;
      with_fallback: number;
    };
    /** Calidad de fechas recepción → venta (parcial con ObjectId OK). */
    timing_data_quality: {
      with_sale_created_at: number;
      reception_from_snapshot: number;
      reception_from_stocked_at: number;
      reception_from_objectid: number;
      reception_missing: number;
      tags_from_snapshot: number;
      tags_from_card_map: number;
    };
  };
  top_sellers_by_units: Array<{
    card_id: string;
    card_name: string | null;
    image_url: string | null;
    units: number;
    revenue_cop: number;
  }>;
  top_sellers_by_revenue: Array<{
    card_id: string;
    card_name: string | null;
    image_url: string | null;
    units: number;
    revenue_cop: number;
  }>;
  top_profit: Array<{
    card_id: string;
    card_name: string | null;
    image_url: string | null;
    units: number;
    revenue_cop: number;
    cost_cop: number;
    profit_cop: number;
  }>;
  top_loss_sales: Array<{
    card_id: string;
    card_name: string | null;
    image_url: string | null;
    units: number;
    revenue_cop: number;
    cost_cop: number;
    profit_cop: number;
  }>;
  velocity_by_product_kind: Array<{
    product_kind: string;
    samples: number;
    avg_days_to_sell: number | null;
    median_days_to_sell: number | null;
    approximate: boolean;
  }>;
  fastest_kinds: Array<{
    product_kind: string;
    samples: number;
    avg_days_to_sell: number | null;
    median_days_to_sell: number | null;
    approximate: boolean;
  }>;
  slowest_kinds: Array<{
    product_kind: string;
    samples: number;
    avg_days_to_sell: number | null;
    median_days_to_sell: number | null;
    approximate: boolean;
  }>;
  sales_by_day: Array<{
    date: string;
    units: number;
    revenue_cop: number;
    profit_cop: number;
  }>;
  sales_by_cycle: Array<{
    cycle_key: string;
    cycle_closed_at: string | null;
    units: number;
    revenue_cop: number;
    profit_cop: number;
  }>;
  /** Ventas por tag operativo (una venta puede contar en varios tags). */
  sales_by_tag: Array<{
    tag: string;
    label: string;
    units: number;
    revenue_cop: number;
    profit_cop: number;
    avg_days_to_sell: number | null;
    approximate: boolean;
  }>;
  inventory_losses: {
    lines_count: number;
    cost_cop: number;
    items: Array<{
      stock_id: string;
      card_id: string;
      card_name: string | null;
      cost_cop: number;
      lost_at: string | null;
    }>;
  };
  dead_stock: {
    lines_count: number;
    /** Grupos por carta (tras agregación). */
    cards_count: number;
    cost_cop: number;
    items: Array<{
      /** Representativo: primer stock_id del grupo. */
      stock_id: string;
      card_id: string;
      card_name: string | null;
      image_url: string | null;
      /** Unidades/líneas de stock agrupadas. */
      stock_lines: number;
      cost_cop: number;
      stocked_at: string | null;
      /** Máximo días entre las líneas del grupo. */
      days_in_stock: number | null;
      priority: 'alta' | 'media' | 'baja';
      reasons: string[];
      reason_codes: string[];
      pvp_cop: number | null;
      potential_margin_cop: number | null;
      potential_margin_pct: number | null;
      sales_in_period: number;
      is_vintage: boolean;
      type_median_days_to_sell?: number | null;
      /** Unidades aún vendibles del mismo card_id. */
      type_remaining_units?: number;
      /** Vendidas / (vendidas + restantes) del tipo en el periodo, 0–100. */
      type_sell_through_pct?: number | null;
      /** Restantes / (vendidas + restantes) del tipo, 0–100. */
      type_stuck_pct?: number | null;
    }>;
  };
  kpis: {
    sell_through_pct: number | null;
    sell_through_approximate: boolean;
    inventory_turnover_approximate: number | null;
    gmroi_approximate: number | null;
  };
};
