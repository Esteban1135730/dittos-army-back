import type { Sale } from '../schema/sale.schema';
import type { Stock } from '../schema/stock.schema';
import { stockLineCostCop } from './stock-line-cost-cop';
import { resolveStockReceivedAt } from './stock-received-at';

export type EnrichSaleSnapshotOpts = {
  /** PVP en COP si se resolvió en el flujo. */
  pvp_cop_snapshot?: number;
  /** Tags operativos de la carta al vender (vintage/bulk/jugable/brillo). */
  tags_snapshot?: string[];
};

/**
 * Enriquece el payload de creación de Sale (tipo venta) con snapshots
 * de costo, recepción y metadatos del stock al momento de la venta.
 */
export function enrichSaleCreatePayload(
  base: Partial<Sale>,
  stock: Pick<
    Stock,
    | 'shipment'
    | 'unity_cost'
    | 'cards_in_shipmet'
    | 'currency'
    | 'product_kind'
    | 'rareza'
    | 'stocked_at'
  > & { _id?: unknown },
  opts?: EnrichSaleSnapshotOpts,
): Partial<Sale> {
  const cost = stockLineCostCop(stock);
  const received = resolveStockReceivedAt(stock);
  const payload: Partial<Sale> = {
    ...base,
    cost_cop_snapshot: Number.isFinite(cost) ? cost : 0,
  };
  if (received.date) {
    payload.received_at_snapshot = received.date;
  }
  if (stock.product_kind != null && String(stock.product_kind).trim() !== '') {
    payload.product_kind_snapshot = String(stock.product_kind);
  }
  if (stock.rareza != null && String(stock.rareza).trim() !== '') {
    payload.rareza_snapshot = String(stock.rareza);
  }
  if (
    opts?.pvp_cop_snapshot != null &&
    Number.isFinite(opts.pvp_cop_snapshot)
  ) {
    payload.pvp_cop_snapshot = Math.round(opts.pvp_cop_snapshot);
  }
  if (opts?.tags_snapshot) {
    payload.tags_snapshot = [...opts.tags_snapshot];
  }
  return payload;
}
