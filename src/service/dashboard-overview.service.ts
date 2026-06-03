import { Injectable } from '@nestjs/common';
import { StockRepository } from '../repository/stock.repository';
import { SaleRepository } from '../repository/sale.repository';
import { ClientRepository } from '../repository/client.repository';
import { ReservaRepository } from '../repository/reserva.repository';
import { ReservaIncomingRepository } from '../repository/reserva-incoming.repository';
import { IncomingBatchRepository } from '../repository/incoming-batch.repository';
import { IncomingBatchItemRepository } from '../repository/incoming-batch-item.repository';
import { PvpRepository } from '../repository/pvp.repository';
import {
  effectiveOperationalRarezaFromStock,
  groupPvpsByCardId,
  resolvePvpForLine,
} from '../utils/pvp-resolve';
import type { Stock } from '../schema/stock.schema';
import type { SaleDocument } from '../schema/sale.schema';

const NON_INVENTORY_STATES = new Set(['vendida', 'propiedad']);

export type DashboardOverviewResponse = {
  generated_at: string;
  highlights: {
    capital_engaged_cop: number;
    pending_revenue_cop: number;
    inventory_margin_potential_cop: number;
    combined_estimated_profit_cop: number;
  };
  stock: {
    total_lines: number;
    by_state: Record<string, number>;
    sellable_lines: number;
    inventory_cost_cop: number;
    inventory_pvp_cop: number;
  };
  sales: {
    active_count: number;
    active_amount_cop: number;
    active_estimated_profit_cop: number;
    closed_last_30_days_count: number;
    closed_last_30_days_amount_cop: number;
    consistency_issue_count: number;
  };
  clients_reservations: {
    clients_count: number;
    reservas_stock_count: number;
    ventas_esperadas_cop: number;
    ganancia_estimada_cop: number;
    reservas_incoming_units: number;
    reservas_incoming_client_count: number;
  };
  incoming: {
    open_batches_count: number;
    units_in_transit: number;
    estimated_cost_cop: number;
  };
  charts: {
    sales_by_month: Array<{ month: string; count: number; amount_cop: number }>;
    stock_by_state: Array<{ state: string; count: number }>;
    money_flow: Array<{ key: string; label: string; value_cop: number }>;
  };
};

const SALES_CHART_MONTHS = 6;

function amountToCop(amount: number, currency: string): number {
  if (currency === 'COP') return Math.round(amount);
  if (currency === 'EUR') {
    const rate = parseFloat(process.env.EUR_TO_COP || '0') || 5000;
    return Math.round(amount * rate);
  }
  if (currency === 'USD') {
    const rate = parseFloat(process.env.USD_TO_COP || '0') || 4500;
    return Math.round(amount * rate);
  }
  return Math.round(amount);
}

function pvpToCop(pvp: number, currency: string): number {
  return amountToCop(pvp, currency);
}

function stockLineCostCop(stock: Stock): number {
  const cardsInShipment = stock.cards_in_shipmet || 1;
  const unitCost =
    (stock.shipment ?? 0) / cardsInShipment + (stock.unity_cost ?? 0);
  return amountToCop(unitCost, stock.currency ?? 'COP');
}

function stockStateKey(stock: Stock): string {
  const raw = stock.card_state ?? 'sin_estado';
  return String(raw).toLowerCase();
}

function stockDocId(stock: Stock & { _id?: { toString(): string } }): string {
  return stock._id?.toString?.() ?? '';
}

function monthKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildLastNMonthKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    keys.push(monthKeyLocal(d));
  }
  return keys;
}

function buildSalesByMonth(
  activeSales: SaleDocument[],
  historicalSales: SaleDocument[],
  monthKeys: string[],
): Array<{ month: string; count: number; amount_cop: number }> {
  const bucket = new Map<string, { count: number; amount_cop: number }>();
  for (const key of monthKeys) {
    bucket.set(key, { count: 0, amount_cop: 0 });
  }
  const [firstYear, firstMonth] = monthKeys[0].split('-').map(Number);
  const earliest = new Date(firstYear, firstMonth - 1, 1);

  for (const sale of [...activeSales, ...historicalSales]) {
    const created = (sale as SaleDocument).created_at;
    if (!created || created < earliest) continue;
    const key = monthKeyLocal(new Date(created));
    const row = bucket.get(key);
    if (!row) continue;
    row.count += 1;
    row.amount_cop += sale.amount_cop ?? 0;
  }

  return monthKeys.map((month) => {
    const row = bucket.get(month)!;
    return { month, count: row.count, amount_cop: row.amount_cop };
  });
}

@Injectable()
export class DashboardOverviewService {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly saleRepository: SaleRepository,
    private readonly clientRepository: ClientRepository,
    private readonly reservaRepository: ReservaRepository,
    private readonly reservaIncomingRepository: ReservaIncomingRepository,
    private readonly incomingBatchRepository: IncomingBatchRepository,
    private readonly incomingBatchItemRepository: IncomingBatchItemRepository,
    private readonly pvpRepository: PvpRepository,
  ) {}

  async getOverview(): Promise<DashboardOverviewResponse> {
    const [
      stockItems,
      activeSales,
      historicalSales,
      clients,
      reservas,
      reservasIncoming,
      openBatches,
    ] = await Promise.all([
      this.stockRepository.findAll(),
      this.saleRepository.findActiveVentas(),
      this.saleRepository.findHistoricalVentas(),
      this.clientRepository.findAll(),
      this.reservaRepository.findAll(),
      this.reservaIncomingRepository.findAll(),
      this.incomingBatchRepository.findOpenBatches(),
    ]);

    const stockById = new Map<string, Stock>();
    for (const s of stockItems) {
      const id = stockDocId(s as Stock & { _id?: { toString(): string } });
      if (id) stockById.set(id, s);
    }

    const by_state: Record<string, number> = {};
    let sellable_lines = 0;
    let inventory_cost_cop = 0;
    let inventory_pvp_cop = 0;

    const sellableCardIds = new Set<string>();
    for (const stock of stockItems) {
      const state = stockStateKey(stock);
      by_state[state] = (by_state[state] ?? 0) + 1;
      if (!NON_INVENTORY_STATES.has(state)) {
        sellable_lines += 1;
        inventory_cost_cop += stockLineCostCop(stock);
        sellableCardIds.add(stock.card_id);
      }
    }

    const pvps = await this.pvpRepository.findByCardIds([...sellableCardIds]);
    const pvpByCard = groupPvpsByCardId(pvps);

    for (const stock of stockItems) {
      const state = stockStateKey(stock);
      if (NON_INVENTORY_STATES.has(state)) continue;
      const rareza = effectiveOperationalRarezaFromStock(stock);
      const resolved = resolvePvpForLine(pvpByCard.get(stock.card_id) ?? [], rareza);
      if (resolved) {
        inventory_pvp_cop += pvpToCop(resolved.pvp, resolved.pvp_currency);
      }
    }

    let active_amount_cop = 0;
    let active_estimated_profit_cop = 0;
    for (const sale of activeSales) {
      active_amount_cop += sale.amount_cop ?? 0;
      const stock = stockById.get(sale.stock_id);
      const costCop = stock ? stockLineCostCop(stock) : 0;
      active_estimated_profit_cop += (sale.amount_cop ?? 0) - costCop;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    let closed_last_30_days_count = 0;
    let closed_last_30_days_amount_cop = 0;
    for (const sale of historicalSales) {
      const closedAt = (sale as SaleDocument).cycle_closed_at;
      if (closedAt && closedAt >= thirtyDaysAgo) {
        closed_last_30_days_count += 1;
        closed_last_30_days_amount_cop += sale.amount_cop ?? 0;
      }
    }

    const consistency_issue_count = this.countConsistencyIssues(
      stockItems,
      activeSales,
    );

    let ventas_esperadas_cop = 0;
    let ganancia_estimada_cop = 0;
    for (const reserva of reservas) {
      const precioCop = amountToCop(
        reserva.precio,
        reserva.currency ?? 'COP',
      );
      ventas_esperadas_cop += precioCop;
      const stock = stockById.get(reserva.stock_id);
      const costCop = stock ? stockLineCostCop(stock) : 0;
      ganancia_estimada_cop += precioCop - costCop;
    }

    let reservas_incoming_units = 0;
    const incomingClientIds = new Set<string>();
    for (const ri of reservasIncoming) {
      reservas_incoming_units += ri.quantity ?? 0;
      if (ri.client_id) incomingClientIds.add(ri.client_id);
    }

    const openBatchIds = openBatches.map((b) =>
      (b as { _id?: { toString(): string } })._id?.toString?.() ?? '',
    ).filter(Boolean);

    let units_in_transit = 0;
    let estimated_cost_cop = 0;
    if (openBatchIds.length > 0) {
      const itemGroups = await Promise.all(
        openBatchIds.map((id) =>
          this.incomingBatchItemRepository.findByBatchId(id),
        ),
      );
      for (const items of itemGroups) {
        for (const item of items) {
          const remaining = item.remaining_quantity ?? 0;
          units_in_transit += remaining;
          estimated_cost_cop += remaining * (item.unit_cost_cop ?? 0);
        }
      }
    }

    const roundedTransitCost = Math.round(estimated_cost_cop);
    const pending_revenue_cop = active_amount_cop + ventas_esperadas_cop;
    const capital_engaged_cop = inventory_cost_cop + roundedTransitCost;
    const inventory_margin_potential_cop = Math.max(
      0,
      inventory_pvp_cop - inventory_cost_cop,
    );
    const combined_estimated_profit_cop =
      active_estimated_profit_cop + ganancia_estimada_cop;

    const salesMonthKeys = buildLastNMonthKeys(SALES_CHART_MONTHS);
    const sales_by_month = buildSalesByMonth(
      activeSales,
      historicalSales,
      salesMonthKeys,
    );

    const stock_by_state = Object.entries(by_state)
      .filter(([, count]) => count > 0)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);

    const money_flow = [
      {
        key: 'inventory',
        label: 'Inventario (costo)',
        value_cop: inventory_cost_cop,
      },
      {
        key: 'transit',
        label: 'En tránsito',
        value_cop: roundedTransitCost,
      },
      {
        key: 'active_sales',
        label: 'Ventas activas',
        value_cop: active_amount_cop,
      },
      {
        key: 'reservations',
        label: 'Pedidos reservados',
        value_cop: ventas_esperadas_cop,
      },
    ].filter((row) => row.value_cop > 0);

    return {
      generated_at: new Date().toISOString(),
      highlights: {
        capital_engaged_cop,
        pending_revenue_cop,
        inventory_margin_potential_cop,
        combined_estimated_profit_cop,
      },
      stock: {
        total_lines: stockItems.length,
        by_state,
        sellable_lines,
        inventory_cost_cop,
        inventory_pvp_cop,
      },
      sales: {
        active_count: activeSales.length,
        active_amount_cop,
        active_estimated_profit_cop,
        closed_last_30_days_count,
        closed_last_30_days_amount_cop,
        consistency_issue_count,
      },
      clients_reservations: {
        clients_count: clients.length,
        reservas_stock_count: reservas.length,
        ventas_esperadas_cop,
        ganancia_estimada_cop,
        reservas_incoming_units,
        reservas_incoming_client_count: incomingClientIds.size,
      },
      incoming: {
        open_batches_count: openBatches.length,
        units_in_transit,
        estimated_cost_cop: roundedTransitCost,
      },
      charts: {
        sales_by_month,
        stock_by_state,
        money_flow,
      },
    };
  }

  private countConsistencyIssues(
    stockItems: Stock[],
    activeSales: SaleDocument[],
  ): number {
    const stockVendidaIds = new Set(
      stockItems
        .filter((s) => stockStateKey(s) === 'vendida')
        .map((s) => stockDocId(s as Stock & { _id?: { toString(): string } }))
        .filter(Boolean),
    );
    const saleStockIds = new Set(activeSales.map((s) => s.stock_id));

    let onlyInStock = 0;
    for (const id of stockVendidaIds) {
      if (!saleStockIds.has(id)) onlyInStock += 1;
    }
    let onlyInSales = 0;
    for (const id of saleStockIds) {
      if (!stockVendidaIds.has(id)) onlyInSales += 1;
    }
    return onlyInStock + onlyInSales;
  }
}
