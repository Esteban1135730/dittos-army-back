import { Injectable } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { isQuantityKind } from 'src/constants/bulk-product';
import type { OwnerKey } from 'src/config/owners.config';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { SaleRepository } from 'src/repository/sale.repository';
import { StockRepository } from 'src/repository/stock.repository';
import type { Stock } from 'src/schema/stock.schema';
import { enrichSaleCreatePayload } from 'src/utils/sale-cost-snapshot';

export type SaleBatchItemInput = {
  stock_id: string;
  amount_cop: number;
  notes?: string;
};

export type SaleBatchItemResult = {
  stock_id: string;
  success: boolean;
  message?: string;
  owner: OwnerKey;
  card_id?: string;
  sale_id?: string;
};

/**
 * Unit sale used by `POST /sales/sell-batch` and mobile-pending accept.
 * Keeps 032 (quantity) and 034 (owner ALS) in one place.
 */
@Injectable()
export class SaleBatchService {
  constructor(
    private readonly saleRepository: SaleRepository,
    private readonly stockRepository: StockRepository,
    private readonly reservaRepository: ReservaRepository,
    private readonly cardStockTagRepository: CardStockTagRepository,
  ) {}

  private async tagsForCard(cardId: string): Promise<string[]> {
    const map = await this.cardStockTagRepository.findMapByCardIds([cardId]);
    return map.get(String(cardId ?? '').trim()) ?? [];
  }

  private async enrichVenta(
    base: Parameters<typeof enrichSaleCreatePayload>[0],
    stock: Stock & { _id?: unknown },
    opts?: Parameters<typeof enrichSaleCreatePayload>[2],
  ) {
    const tags_snapshot = await this.tagsForCard(stock.card_id);
    return enrichSaleCreatePayload(base, stock, {
      ...opts,
      tags_snapshot,
    });
  }

  async sellOneItem(
    item: SaleBatchItemInput,
    owner: OwnerKey,
    remainingQtyByStockOwner: Map<string, number>,
  ): Promise<SaleBatchItemResult> {
    const stockId = item.stock_id?.trim() ?? '';
    if (!stockId || !isValidObjectId(stockId)) {
      return {
        stock_id: stockId || '(vacío)',
        success: false,
        message: 'stock_id inválido',
        owner,
      };
    }
    if (item.amount_cop == null || item.amount_cop <= 0) {
      return {
        stock_id: stockId,
        success: false,
        message: 'amount_cop debe ser mayor a 0',
        owner,
      };
    }

    const stock = await this.stockRepository.findById(stockId);
    if (!stock) {
      return {
        stock_id: stockId,
        success: false,
        message: 'Stock no encontrado',
        owner,
      };
    }

    const cardState = (stock as { card_state?: string }).card_state ?? '';
    const productKind = (stock as { product_kind?: string }).product_kind;
    const isQty = isQuantityKind(productKind);
    const qtyKey = `${owner}:${stockId}`;

    if (!isQty && cardState === 'vendida') {
      return {
        stock_id: stockId,
        success: false,
        message: 'La carta ya está vendida',
        owner,
      };
    }
    if (cardState === 'propiedad') {
      return {
        stock_id: stockId,
        success: false,
        message: 'La carta está en propiedad',
        owner,
      };
    }
    if (
      cardState !== 'disponible' &&
      cardState !== 'en_stock_colombia' &&
      cardState !== 'reserva'
    ) {
      return {
        stock_id: stockId,
        success: false,
        message: 'Estado de stock no vendible',
        owner,
      };
    }

    if (isQty) {
      if (!remainingQtyByStockOwner.has(qtyKey)) {
        const q =
          typeof (stock as { quantity?: number }).quantity === 'number'
            ? (stock as { quantity: number }).quantity
            : 0;
        remainingQtyByStockOwner.set(qtyKey, q);
      }
      const remaining = remainingQtyByStockOwner.get(qtyKey) ?? 0;
      if (remaining < 1) {
        return {
          stock_id: stockId,
          success: false,
          message: 'Stock insuficiente',
          owner,
        };
      }

      try {
        const updated = await this.stockRepository.decrementQuantityAtomic(
          stockId,
          1,
        );
        if (!updated) {
          remainingQtyByStockOwner.set(qtyKey, 0);
          return {
            stock_id: stockId,
            success: false,
            message: 'Stock insuficiente',
            owner,
          };
        }
        remainingQtyByStockOwner.set(
          qtyKey,
          typeof (updated as { quantity?: number }).quantity === 'number'
            ? (updated as { quantity: number }).quantity
            : remaining - 1,
        );
        const created = await this.saleRepository.create(
          await this.enrichVenta(
            {
              stock_id: stockId,
              card_id: stock.card_id,
              type: 'venta',
              amount_cop: Math.round(item.amount_cop),
              notes: item.notes ?? 'Venta asistida QR',
            },
            stock,
          ),
        );
        return {
          stock_id: stockId,
          success: true,
          owner,
          card_id: stock.card_id,
          sale_id: idOf(created),
        };
      } catch {
        return {
          stock_id: stockId,
          success: false,
          message: 'Error al registrar la venta',
          owner,
        };
      }
    }

    try {
      const created = await this.saleRepository.create(
        await this.enrichVenta(
          {
            stock_id: stockId,
            card_id: stock.card_id,
            type: 'venta',
            amount_cop: Math.round(item.amount_cop),
            notes: item.notes ?? 'Venta asistida QR',
          },
          stock,
        ),
      );
      await this.stockRepository.updateCardState(stockId, 'vendida');
      if (cardState === 'reserva') {
        await this.reservaRepository.deleteByStockId(stockId);
      }
      return {
        stock_id: stockId,
        success: true,
        owner,
        card_id: stock.card_id,
        sale_id: idOf(created),
      };
    } catch {
      return {
        stock_id: stockId,
        success: false,
        message: 'Error al registrar la venta',
        owner,
      };
    }
  }
}

function idOf(doc: unknown): string | undefined {
  if (!doc || typeof doc !== 'object') return undefined;
  const id = (doc as { _id?: { toString(): string } })._id;
  return id ? String(id) : undefined;
}
