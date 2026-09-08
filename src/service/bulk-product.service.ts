import { Injectable } from '@nestjs/common';
import {
  BULK_CARD_ID,
  BULK_CARD_NAME,
  BULK_DEFAULT_PVP_COP,
  BULK_DEFAULT_QUANTITY,
  BULK_IMAGE_URL,
  effectiveProductKind,
  isQuantityKind,
} from 'src/constants/bulk-product';
import { PvpRepository } from 'src/repository/pvp.repository';
import { StockRepository } from 'src/repository/stock.repository';
import { Stock } from 'src/schema/stock.schema';

export type EnsureBulkResult = {
  stock_id: string;
  card_id: string;
  card_name: string;
  product_kind: 'quantity';
  quantity: number;
  created: boolean;
  pvp_ensured: boolean;
};

@Injectable()
export class BulkProductService {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly pvpRepository: PvpRepository,
  ) {}

  isQuantityProduct(stock: {
    product_kind?: string | null;
  }): boolean {
    return isQuantityKind(stock.product_kind);
  }

  /**
   * Seed idempotente del SKU `bulk`: no duplica, no resetea quantity,
   * asegura PVP base 2000 COP solo si falta.
   */
  async ensureBulk(): Promise<EnsureBulkResult> {
    const existing = await this.stockRepository.findOneByCardId(BULK_CARD_ID);
    let stock: Stock;
    let created = false;

    if (existing) {
      stock = existing;
      // Reparar kind/image/name si un doc legacy incompleto; nunca resetear qty.
      const patch: Partial<{
        product_kind: string;
        card_name: string;
        image_url: string;
        card_state: string;
      }> = {};
      if (!isQuantityKind((existing as any).product_kind)) {
        patch.product_kind = 'quantity';
      }
      if (!(existing as any).card_name) {
        patch.card_name = BULK_CARD_NAME;
      }
      if (!(existing as any).image_url) {
        patch.image_url = BULK_IMAGE_URL;
      }
      const state = String((existing as any).card_state ?? '').trim();
      // SKU único quantity: debe quedar disponible (venta/reserva no marcan
      // vendida mientras qty > 0). Restaura vendida/reserva/vacío sin tocar qty.
      if (state !== 'disponible') {
        patch.card_state = 'disponible';
      }
      if (Object.keys(patch).length > 0) {
        const id = String((existing as any)._id);
        const updated = await this.stockRepository.updateById(id, patch as any);
        if (updated) stock = updated;
      }
    } else {
      stock = await this.stockRepository.create({
        card_id: BULK_CARD_ID,
        card_name: BULK_CARD_NAME,
        shipment: 0,
        unity_cost: 0,
        cards_in_shipmet: 1,
        image_url: BULK_IMAGE_URL,
        card_state: 'disponible',
        currency: 'COP',
        product_kind: 'quantity',
        quantity: BULK_DEFAULT_QUANTITY,
      });
      created = true;
    }

    const stockId = String((stock as any)._id);
    const quantity =
      typeof (stock as any).quantity === 'number'
        ? (stock as any).quantity
        : BULK_DEFAULT_QUANTITY;

    const pvp_ensured = await this.ensureDefaultPvp();

    return {
      stock_id: stockId,
      card_id: BULK_CARD_ID,
      card_name: BULK_CARD_NAME,
      product_kind: 'quantity',
      quantity,
      created,
      pvp_ensured,
    };
  }

  private async ensureDefaultPvp(): Promise<boolean> {
    const existing = await this.pvpRepository.findBaseByCardId(BULK_CARD_ID);
    if (existing && existing.pvp != null && existing.pvp > 0) {
      return false;
    }
    if (existing) {
      await this.pvpRepository.update({
        card_id: BULK_CARD_ID,
        pvp: BULK_DEFAULT_PVP_COP,
        currency: 'COP',
        rareza: null,
      });
    } else {
      await this.pvpRepository.create({
        card_id: BULK_CARD_ID,
        pvp: BULK_DEFAULT_PVP_COP,
        currency: 'COP',
        rareza: null,
      });
    }
    return true;
  }
}

export { effectiveProductKind };
