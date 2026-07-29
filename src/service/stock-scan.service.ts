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
import { encodeStockQrPayload } from 'src/utils/stock-barcode-payload';
import {
  evaluateStockSellable,
  SELLABLE_STOCK_STATES,
  type StockSellRejectReason,
} from 'src/utils/stock-sellable';
import {
  languageLabel,
  operationalRarezaLabel,
} from 'src/utils/stock-scan-labels';
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';

/** Estados con etiqueta QR imprimible (incluye reserva; excluye vendida/propiedad/etc.). */
const QR_LABEL_STOCK_STATES = new Set([...SELLABLE_STOCK_STATES, 'reserva']);

export type StockQrExportRow = {
  stock_id: string;
  qr_value: string;
  card_name: string;
  expansion: string;
  rareza: string | null;
  language: string;
  price_cop: number;
};

/** @deprecated Usar StockQrExportRow */
export type StockBarcodeExportRow = StockQrExportRow & {
  barcode_value: string;
};

export type StockScanView = {
  stock_id: string;
  card_id: string;
  card_name: string;
  image_url: string;
  card_cost: number;
  card_cost_cop: number;
  currency: string;
  pvp: number | null;
  pvp_currency: string | null;
  price_cop: number | null;
  profit_cop: number | null;
  expansion: string;
  rareza: string | null;
  language: string;
  card_state: string;
  sellable: boolean;
  reject_reason?: StockSellRejectReason;
  /** La escaneada estaba en reserva y se devolvió una copia equivalente disponible. */
  substituted?: boolean;
  /** stock_id de la línea reservada que se escaneó (cuando substituted). */
  scanned_stock_id?: string;
  /** Reservada sin equivalente: vendible, pero al vender se cancela la reserva. */
  reserved_fallback?: boolean;
};

type StockLineDoc = {
  _id: { toString(): string };
  card_id: string;
  card_name?: string;
  image_url?: string;
  card_state?: string;
  language?: string;
  languaje?: string;
  shipment: number;
  cards_in_shipmet: number;
  unity_cost: number;
  currency: string;
  rareza?: string | null;
  holofoil?: boolean;
  league_card?: boolean;
};

@Injectable()
export class StockScanService {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly pvpRepository: PvpRepository,
    private readonly cardStockTagRepository: CardStockTagRepository,
    private readonly tcgDexService: TCGDexService,
  ) {}

  async listQrExportRows(): Promise<StockQrExportRow[]> {
    const stockItems = (await this.stockRepository.findAll()) ?? [];
    const eligible = stockItems.filter((stock) => {
      const doc = stock as unknown as StockLineDoc;
      const state = doc.card_state ?? '';
      return QR_LABEL_STOCK_STATES.has(state);
    });
    if (eligible.length === 0) return [];

    const cardIds = [
      ...new Set(eligible.map((s) => (s as unknown as StockLineDoc).card_id)),
    ];
    const [pvps, expansionByStockId] = await Promise.all([
      this.pvpRepository.findByCardIds(cardIds),
      this.resolveExpansionByStockLines(eligible),
    ]);
    const pvpByCard = groupPvpsByCardId(pvps);

    const rows: StockQrExportRow[] = [];
    for (const stock of eligible) {
      const doc = stock as unknown as StockLineDoc;
      const stockId = String(doc._id);
      const priceCop = this.resolvePriceCop(
        doc,
        pvpByCard.get(doc.card_id) ?? [],
      );
      if (priceCop == null || priceCop <= 0) continue;

      const opRareza = effectiveOperationalRarezaFromStock(doc);
      rows.push({
        stock_id: stockId,
        qr_value: encodeStockQrPayload(stockId),
        card_name: doc.card_name ?? '',
        expansion: expansionByStockId.get(stockId) ?? '',
        rareza: operationalRarezaLabel(opRareza),
        language: languageLabel(doc.language ?? doc.languaje),
        price_cop: priceCop,
      });
    }

    return rows.sort((a, b) =>
      (a.card_name || '').localeCompare(b.card_name || '', 'es'),
    );
  }

  /** @deprecated Usar listQrExportRows */
  async listBarcodeExportRows(): Promise<StockBarcodeExportRow[]> {
    const rows = await this.listQrExportRows();
    return rows.map((r) => ({ ...r, barcode_value: r.qr_value }));
  }

  async getScanView(
    stockId: string,
    excludeIds: string[] = [],
  ): Promise<StockScanView> {
    const trimmed = stockId?.trim() ?? '';
    if (!isValidObjectId(trimmed)) {
      throw new NotFoundException('Stock no encontrado');
    }
    const stock = (await this.stockRepository.findById(
      trimmed,
    )) as StockLineDoc | null;
    if (!stock) {
      throw new NotFoundException('Stock no encontrado');
    }

    const [pvps, expansion] = await Promise.all([
      this.pvpRepository.findByCardIds([stock.card_id]),
      this.tcgDexService.resolveEnglishExpansionName(
        stock.card_id,
        stock.language ?? stock.languaje,
      ),
    ]);
    const grouped = groupPvpsByCardId(pvps);
    const pvpList = grouped.get(stock.card_id) ?? [];
    const view = this.buildScanView(stock, pvpList, expansion);

    if ((stock.card_state ?? '') !== 'reserva') {
      return view;
    }
    return this.buildReservedScanView(stock, pvpList, view, excludeIds);
  }

  /**
   * Delta reserva: si hay copia equivalente disponible la devuelve (substituted);
   * si no, la propia reservada como vendible (reserved_fallback) cuando tiene PVP.
   */
  private async buildReservedScanView(
    scanned: StockLineDoc,
    pvpList: Parameters<typeof resolvePvpForLine>[0],
    scannedView: StockScanView,
    excludeIds: string[],
  ): Promise<StockScanView> {
    const equivalent = await this.findEquivalentAvailable(
      scanned,
      pvpList,
      excludeIds,
    );
    if (equivalent) {
      const expansion = await this.tcgDexService.resolveEnglishExpansionName(
        equivalent.card_id,
        equivalent.language ?? equivalent.languaje,
      );
      const equivalentView = this.buildScanView(equivalent, pvpList, expansion);
      return {
        ...equivalentView,
        substituted: true,
        scanned_stock_id: String(scanned._id),
      };
    }
    if (scannedView.price_cop != null && scannedView.price_cop > 0) {
      return {
        ...scannedView,
        sellable: true,
        reject_reason: undefined,
        reserved_fallback: true,
      };
    }
    return { ...scannedView, sellable: false, reject_reason: 'sin_pvp' };
  }

  private async findEquivalentAvailable(
    scanned: StockLineDoc,
    pvpList: Parameters<typeof resolvePvpForLine>[0],
    excludeIds: string[],
  ): Promise<StockLineDoc | null> {
    const candidates = (await this.stockRepository.findByCardIdsInStates(
      [scanned.card_id],
      [...SELLABLE_STOCK_STATES],
    )) as unknown as StockLineDoc[];
    if (!candidates || candidates.length === 0) return null;

    const scannedId = String(scanned._id);
    const excluded = new Set(excludeIds.map((id) => id.trim()).filter(Boolean));
    const targetLanguage = this.normalizedLanguage(scanned);
    const targetRareza = effectiveOperationalRarezaFromStock(scanned);

    const eligible = candidates.filter((candidate) => {
      const id = String(candidate._id);
      if (id === scannedId || excluded.has(id)) return false;
      if (this.normalizedLanguage(candidate) !== targetLanguage) return false;
      if (effectiveOperationalRarezaFromStock(candidate) !== targetRareza) {
        return false;
      }
      const price = this.resolvePriceCop(candidate, pvpList);
      return price != null && price > 0;
    });
    if (eligible.length === 0) return null;

    // Selección determinista: _id ascendente.
    eligible.sort((a, b) => String(a._id).localeCompare(String(b._id)));
    return eligible[0];
  }

  private normalizedLanguage(stock: StockLineDoc): string {
    return String(stock.language ?? stock.languaje ?? '')
      .trim()
      .toLowerCase();
  }

  private async resolveExpansionByStockLines(
    stockItems: unknown[],
  ): Promise<Map<string, string>> {
    const docs = stockItems.map((s) => s as StockLineDoc);
    const uniqueKeys = new Map<string, { cardId: string; language: string }>();
    for (const doc of docs) {
      const language = doc.language ?? doc.languaje ?? '';
      const key = `${doc.card_id}:${language}`;
      if (!uniqueKeys.has(key)) {
        uniqueKeys.set(key, { cardId: doc.card_id, language });
      }
    }

    const expansionByKey = new Map<string, string>();
    await Promise.all(
      [...uniqueKeys.entries()].map(async ([key, { cardId, language }]) => {
        try {
          const expansion =
            await this.tcgDexService.resolveEnglishExpansionName(
              cardId,
              language,
            );
          expansionByKey.set(key, expansion);
        } catch {
          expansionByKey.set(key, '');
        }
      }),
    );

    const result = new Map<string, string>();
    for (const doc of docs) {
      const language = doc.language ?? doc.languaje ?? '';
      const key = `${doc.card_id}:${language}`;
      result.set(String(doc._id), expansionByKey.get(key) ?? '');
    }
    return result;
  }

  private resolvePriceCop(
    stock: StockLineDoc,
    pvpList: Parameters<typeof resolvePvpForLine>[0],
  ): number | null {
    const pvpData = resolvePvpForLine(
      pvpList,
      effectiveOperationalRarezaFromStock(stock),
    );
    if (!pvpData || pvpData.pvp <= 0) return null;
    return precioToCop(pvpData.pvp, pvpData.pvp_currency ?? 'COP');
  }

  private buildScanView(
    stock: StockLineDoc,
    pvpList: Parameters<typeof resolvePvpForLine>[0],
    expansion: string,
  ): StockScanView {
    const pvpData = resolvePvpForLine(
      pvpList,
      effectiveOperationalRarezaFromStock(stock),
    );
    const pvp = pvpData?.pvp ?? null;
    const pvp_currency = pvpData?.pvp_currency ?? null;
    const price_cop =
      pvp != null && pvp > 0 && pvp_currency
        ? precioToCop(pvp, pvp_currency)
        : null;
    const card_state = stock.card_state ?? '';
    const { sellable, reject_reason } = evaluateStockSellable(
      card_state,
      price_cop,
    );

    const card_cost =
      stock.shipment / stock.cards_in_shipmet + stock.unity_cost;
    const card_cost_cop = precioToCop(card_cost, stock.currency ?? 'COP');
    const profit_cop =
      price_cop != null && price_cop > 0 ? price_cop - card_cost_cop : null;
    const opRareza = effectiveOperationalRarezaFromStock(stock);

    return {
      stock_id: String(stock._id),
      card_id: stock.card_id,
      card_name: stock.card_name ?? '',
      image_url: stock.image_url ?? '',
      card_cost,
      card_cost_cop,
      currency: stock.currency,
      pvp,
      pvp_currency,
      price_cop,
      profit_cop,
      expansion,
      rareza: operationalRarezaLabel(opRareza),
      language: languageLabel(stock.language ?? stock.languaje),
      card_state,
      sellable,
      reject_reason,
    };
  }
}
