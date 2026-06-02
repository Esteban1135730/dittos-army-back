import { Injectable, NotFoundException } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';
import {
  effectiveOperationalRarezaFromStock,
  groupPvpsByCardId,
  resolvePvpForLine,
} from 'src/utils/pvp-resolve';
import { precioToCop } from 'src/utils/precio-to-cop';
import { encodeStockBarcodePayload } from 'src/utils/stock-barcode-payload';

export type StockBarcodeExportRow = {
  stock_id: string;
  barcode_value: string;
  card_name: string;
};

/** @deprecated Usar StockBarcodeExportRow */
export type StockQrExportRow = StockBarcodeExportRow & { qr_value: string };

export type StockScanView = {
  stock_id: string;
  card_name: string;
  image_url: string;
  card_cost: number;
  currency: string;
  pvp: number | null;
  pvp_currency: string | null;
  price_cop: number | null;
};

@Injectable()
export class StockScanService {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly pvpRepository: PvpRepository,
    private readonly cardStockTagRepository: CardStockTagRepository,
  ) {}

  async listBarcodeExportRows(): Promise<StockBarcodeExportRow[]> {
    const stockItems = (await this.stockRepository.findAll()) ?? [];
    return stockItems.map((stock) => {
      const doc = stock as unknown as {
        _id: { toString(): string };
        card_name?: string;
      };
      const stockId = String(doc._id);
      return {
        stock_id: stockId,
        barcode_value: encodeStockBarcodePayload(stockId),
        card_name: doc.card_name ?? '',
      };
    });
  }

  /** @deprecated Usar listBarcodeExportRows */
  async listQrExportRows(): Promise<StockQrExportRow[]> {
    const rows = await this.listBarcodeExportRows();
    return rows.map((r) => ({ ...r, qr_value: r.barcode_value }));
  }

  async getScanView(stockId: string): Promise<StockScanView> {
    const trimmed = stockId?.trim() ?? '';
    if (!isValidObjectId(trimmed)) {
      throw new NotFoundException('Stock no encontrado');
    }
    const stock = (await this.stockRepository.findById(trimmed)) as unknown as
      | {
          _id: { toString(): string };
          card_id: string;
          card_name?: string;
          image_url?: string;
          shipment: number;
          cards_in_shipmet: number;
          unity_cost: number;
          currency: string;
          rareza?: string | null;
          holofoil?: boolean;
          league_card?: boolean;
        }
      | null;
    if (!stock) {
      throw new NotFoundException('Stock no encontrado');
    }

    let pvp: number | null = null;
    let pvp_currency: string | null = null;
    try {
      const pvps = await this.pvpRepository.findByCardIds([stock.card_id]);
      const grouped = groupPvpsByCardId(pvps);
      const list = grouped.get(stock.card_id) ?? [];
      const pvpData = resolvePvpForLine(
        list,
        effectiveOperationalRarezaFromStock(stock),
      );
      if (pvpData) {
        pvp = pvpData.pvp;
        pvp_currency = pvpData.pvp_currency;
      }
    } catch {
      /* PVP opcional */
    }

    const card_cost =
      stock.shipment / stock.cards_in_shipmet + stock.unity_cost;
    const price_cop =
      pvp != null && pvp > 0 && pvp_currency
        ? precioToCop(pvp, pvp_currency)
        : null;

    return {
      stock_id: String(stock._id),
      card_name: stock.card_name ?? '',
      image_url: stock.image_url ?? '',
      card_cost,
      currency: stock.currency,
      pvp,
      pvp_currency,
      price_cop,
    };
  }
}
