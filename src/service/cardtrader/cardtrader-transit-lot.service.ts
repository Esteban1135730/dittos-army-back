import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  INCOMING_ITEM_RAREZA_VALUES,
  normalizeOperationalRareza,
} from 'src/constants/item-rareza';
import {
  CreateCardtraderTransitLotDto,
  UpdateCardtraderTransitLotDto,
} from 'src/Dto/cardtrader-transit-lot.dto';
import { CardtraderTransitLineRepository } from 'src/repository/cardtrader-transit-line.repository';
import { CardtraderTransitLotRepository } from 'src/repository/cardtrader-transit-lot.repository';
import { IncomingBatchItemRepository } from 'src/repository/incoming-batch-item.repository';
import { IncomingBatchRepository } from 'src/repository/incoming-batch.repository';
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';
import {
  cardIdsNeedingTcgDexEnrichment,
  resolveIncomingBatchItemCardName,
  resolveIncomingBatchItemImageUrl,
  type TcgDexBatchEnrichment,
} from 'src/utils/incoming-batch-item-meta';
import { normalizeCardsCostCurrency } from 'src/utils/purchase-currency';
import {
  findLegacyItemByCardName,
  unitCostCopFromLegacyItemRuleOfThree,
} from 'src/utils/incoming-batch-item-pricing';

@Injectable()
export class CardtraderTransitLotService {
  constructor(
    private readonly lotRepository: CardtraderTransitLotRepository,
    private readonly lineRepository: CardtraderTransitLineRepository,
    private readonly incomingBatchRepository: IncomingBatchRepository,
    private readonly incomingBatchItemRepository: IncomingBatchItemRepository,
    private readonly tcgDexService: TCGDexService,
  ) {}

  private async resolveLegacyLotPricing(body: CreateCardtraderTransitLotDto): Promise<{
    total_fx_cards_cost: number;
    total_cop_cards_cost: number;
    real_fx_rate_cop: number;
    cards_cost_currency: string;
  } | null> {
    const legacyBatchId = body.legacy_incoming_batch_id?.trim();
    if (!legacyBatchId) return null;

    const legacy = await this.incomingBatchRepository.findById(legacyBatchId);
    if (legacy) {
      const total_fx_cards_cost = Number(legacy.total_eur_cards_cost || 0);
      const total_cop_cards_cost = Number(legacy.total_cop_cards_cost || 0);
      const real_fx_rate_cop = Number(legacy.real_euro_rate_cop_per_eur || 0);
      if (
        total_fx_cards_cost > 0 &&
        total_cop_cards_cost > 0 &&
        real_fx_rate_cop > 0
      ) {
        return {
          total_fx_cards_cost,
          total_cop_cards_cost,
          real_fx_rate_cop,
          cards_cost_currency: normalizeCardsCostCurrency(
            legacy.cards_cost_currency,
          ),
        };
      }
    }

    const total_fx_cards_cost = Number(body.legacy_basis_total_fx_cards_cost || 0);
    const total_cop_cards_cost = Number(
      body.legacy_basis_total_cop_cards_cost ?? body.total_cop_cards_cost ?? 0,
    );
    const real_fx_rate_cop = Number(
      body.legacy_basis_real_fx_rate_cop ||
        (total_fx_cards_cost > 0 ? total_cop_cards_cost / total_fx_cards_cost : 0),
    );
    if (
      total_fx_cards_cost <= 0 ||
      total_cop_cards_cost <= 0 ||
      real_fx_rate_cop <= 0
    ) {
      return null;
    }

    return {
      total_fx_cards_cost,
      total_cop_cards_cost,
      real_fx_rate_cop,
      cards_cost_currency: normalizeCardsCostCurrency(
        body.legacy_basis_cards_cost_currency ?? body.cards_cost_currency,
      ),
    };
  }

  async listOpenLots(): Promise<
    Array<{
      lot_id: string;
      status: string;
      source: string;
      ct0_package_key: string | null;
      purchase_date: Date;
      created_at: Date;
      total_fx_cards_cost: number;
      total_cop_cards_cost: number;
      cards_cost_currency: string;
      legacy_incoming_batch_id: string | null;
      registered_items_fx_subtotal: number | null;
      remaining_total_quantity: number;
    }>
  > {
    const lots = await this.lotRepository.findOpenLots();
    if (lots.length === 0) return [];

    const result = await Promise.all(
      lots.map(async (lot) => {
        const lotId = lot._id.toString();
        const lines = await this.lineRepository.findByLotId(lotId);
        const remainingTotal = lines.reduce(
          (sum, line) => sum + (line.remaining_quantity || 0),
          0,
        );
        return {
          lot_id: lotId,
          status: lot.status,
          source: lot.source,
          ct0_package_key: lot.ct0_package_key ?? null,
          purchase_date: lot.purchase_date,
          created_at: lot.created_at,
          total_fx_cards_cost: lot.total_fx_cards_cost,
          total_cop_cards_cost: lot.total_cop_cards_cost,
          cards_cost_currency: normalizeCardsCostCurrency(lot.cards_cost_currency),
          legacy_incoming_batch_id: lot.legacy_incoming_batch_id ?? null,
          registered_items_fx_subtotal: lot.registered_items_fx_subtotal ?? null,
          remaining_total_quantity: remainingTotal,
        };
      }),
    );

    return result;
  }

  async getLot(lotId: string) {
    const lot = await this.lotRepository.findById(lotId);
    if (!lot) throw new NotFoundException('Lote no encontrado');
    return {
      lot_id: lot._id.toString(),
      status: lot.status,
      source: lot.source,
      ct0_package_key: lot.ct0_package_key ?? null,
      purchase_date: lot.purchase_date,
      total_fx_cards_cost: lot.total_fx_cards_cost,
      total_cop_cards_cost: lot.total_cop_cards_cost,
      real_fx_rate_cop: lot.real_fx_rate_cop,
      cards_cost_currency: normalizeCardsCostCurrency(lot.cards_cost_currency),
      legacy_incoming_batch_id: lot.legacy_incoming_batch_id ?? null,
      legacy_incoming_cop_hint: lot.legacy_incoming_cop_hint ?? null,
      registered_items_fx_subtotal: lot.registered_items_fx_subtotal ?? null,
      created_at: lot.created_at,
    };
  }

  async listLotLines(lotId: string) {
    const lot = await this.lotRepository.findById(lotId);
    if (!lot) throw new NotFoundException('Lote no encontrado');
    const lines = await this.lineRepository.findByLotId(lotId);
    return lines.map((line) => ({
      line_id: line._id.toString(),
      lot_id: line.lot_id,
      card_id: line.card_id,
      card_name: line.card_name ?? '',
      image_url: line.image_url ?? '',
      language: line.language,
      quantity_ordered: line.quantity_ordered,
      remaining_quantity: line.remaining_quantity,
      fx_total_lot: line.fx_total_lot,
      fx_unit_price: line.fx_unit_price,
      unit_cost_cop: line.unit_cost_cop,
      rareza: line.rareza ?? null,
      ct0_item_id: line.ct0_item_id ?? null,
      blueprint_id: line.blueprint_id ?? null,
      expansion: line.expansion ?? null,
      collector_number: line.collector_number ?? null,
      created_at: line.created_at,
    }));
  }

  async listRegisteredPackageKeys(): Promise<string[]> {
    return this.lotRepository.findOpenPackageKeys();
  }

  /** Líneas abiertas aplanadas para catálogo (reservas, upcoming.json). */
  async listOpenCatalogLines(): Promise<
    Array<{
      transit_line_id: string;
      transit_lot_id: string;
      card_id: string;
      card_name: string;
      image_url: string;
      language: string;
      rareza: string | null;
      remaining_quantity: number;
      unit_cost_cop: number;
      purchase_date: Date;
      created_at: Date;
    }>
  > {
    const lots = await this.lotRepository.findOpenLots();
    if (lots.length === 0) return [];

    const rows = await Promise.all(
      lots.map(async (lot) => {
        const lotId = lot._id.toString();
        const lines = await this.lineRepository.findByLotId(lotId);
        return lines
          .filter((line) => (line.remaining_quantity ?? 0) > 0)
          .map((line) => ({
            transit_line_id: line._id.toString(),
            transit_lot_id: lotId,
            card_id: line.card_id,
            card_name: line.card_name ?? line.card_id,
            image_url: line.image_url ?? '',
            language: line.language,
            rareza: line.rareza ?? null,
            remaining_quantity: line.remaining_quantity,
            unit_cost_cop: line.unit_cost_cop,
            purchase_date: lot.purchase_date,
            created_at: line.created_at,
          }));
      }),
    );

    return rows.flat().sort((a, b) => {
      const pd = a.purchase_date.getTime() - b.purchase_date.getTime();
      if (pd !== 0) return pd;
      return a.created_at.getTime() - b.created_at.getTime();
    });
  }

  async createLot(body: CreateCardtraderTransitLotDto): Promise<{ lot_id: string }> {
    const items = body?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('items es requerido y debe ser un array');
    }
    if (body.total_cop_cards_cost == null || body.total_cop_cards_cost <= 0) {
      throw new BadRequestException(
        'total_cop_cards_cost es requerido y debe ser mayor a 0',
      );
    }
    if (!body.purchase_date) {
      throw new BadRequestException('purchase_date es requerido');
    }

    const packageKey = body.ct0_package_key?.trim();
    if (packageKey) {
      const existing = await this.lotRepository.findByCt0PackageKey(packageKey);
      if (existing) {
        throw new ConflictException(
          'Ya existe un lote registrado para este checkout CT Zero',
        );
      }
    }

    const purchaseDate = new Date(body.purchase_date);
    if (Number.isNaN(purchaseDate.getTime())) {
      throw new BadRequestException('purchase_date inválido');
    }

    for (const item of items) {
      if (!item.card_id?.trim()) {
        throw new BadRequestException('card_id es requerido');
      }
      if (!item.language?.trim()) {
        throw new BadRequestException('language es requerido');
      }
      if (item.quantity == null || item.quantity <= 0) {
        throw new BadRequestException('quantity debe ser > 0');
      }
      if (item.fx_total_lot == null || item.fx_total_lot <= 0) {
        throw new BadRequestException('fx_total_lot debe ser > 0');
      }
      const rareza = normalizeOperationalRareza(item.rareza);
      if (rareza != null && !INCOMING_ITEM_RAREZA_VALUES.has(rareza)) {
        throw new BadRequestException('rareza inválida');
      }
    }

    const registered_items_fx_subtotal = items.reduce(
      (sum, item) => sum + item.fx_total_lot,
      0,
    );
    if (registered_items_fx_subtotal <= 0) {
      throw new BadRequestException('registered_items_fx_subtotal calculado inválido');
    }

    const legacyPricing = await this.resolveLegacyLotPricing(body);
    let total_fx_cards_cost: number;
    let total_cop_cards_cost: number;
    let real_fx_rate_cop: number;
    let cards_cost_currency: string;

    if (legacyPricing) {
      total_fx_cards_cost = legacyPricing.total_fx_cards_cost;
      total_cop_cards_cost = legacyPricing.total_cop_cards_cost;
      real_fx_rate_cop = legacyPricing.real_fx_rate_cop;
      cards_cost_currency = legacyPricing.cards_cost_currency;
    } else {
      total_fx_cards_cost = registered_items_fx_subtotal;
      total_cop_cards_cost = body.total_cop_cards_cost;
      real_fx_rate_cop = total_cop_cards_cost / total_fx_cards_cost;
      cards_cost_currency = normalizeCardsCostCurrency(body.cards_cost_currency);
    }

    if (!Number.isFinite(real_fx_rate_cop) || real_fx_rate_cop <= 0) {
      throw new BadRequestException('real_fx_rate_cop calculado inválido');
    }

    const source = body.source === 'manual' ? 'manual' : 'ct0';

    const lot = await this.lotRepository.create({
      status: 'open',
      source,
      ct0_package_key: packageKey || undefined,
      purchase_date: purchaseDate,
      total_fx_cards_cost,
      registered_items_fx_subtotal,
      total_cop_cards_cost,
      real_fx_rate_cop,
      cards_cost_currency,
      legacy_incoming_batch_id: body.legacy_incoming_batch_id?.trim() || undefined,
      legacy_incoming_cop_hint:
        body.legacy_incoming_cop_hint != null && body.legacy_incoming_cop_hint > 0
          ? body.legacy_incoming_cop_hint
          : undefined,
    });

    const cardIds = cardIdsNeedingTcgDexEnrichment(
      items.map((item) => ({
        card_id: item.card_id,
        language: item.language,
        quantity: item.quantity,
        eur_total_lot: item.fx_total_lot,
        card_name: item.card_name,
        image_url: item.image_url,
      })),
    );
    const cardMap = new Map<string, TcgDexBatchEnrichment>();
    await Promise.all(
      cardIds.map(async (cardId) => {
        try {
          const card = await this.tcgDexService.getCard(cardId);
          if (card) {
            cardMap.set(cardId, {
              name: card.name || '',
              image:
                card.image || card.images?.small || card.images?.large || '',
            });
          }
        } catch {
          /* opcional */
        }
      }),
    );

    const lotId = lot._id.toString();
    const legacyBatchId = body.legacy_incoming_batch_id?.trim();
    const legacyItems = legacyBatchId
      ? await this.incomingBatchItemRepository.findByBatchId(legacyBatchId)
      : [];

    const linesToInsert = items.map((item) => {
      const fx_unit_price = item.fx_total_lot / item.quantity;
      const legacyItem = findLegacyItemByCardName(
        item.card_name?.trim() ?? '',
        legacyItems,
      );
      const unit_cost_cop = unitCostCopFromLegacyItemRuleOfThree(
        fx_unit_price,
        legacyItem ?? {},
        real_fx_rate_cop,
      );
      const tcgDex = cardMap.get(item.card_id);
      const rarezaNorm = normalizeOperationalRareza(item.rareza) ?? undefined;

      return {
        lot_id: lotId,
        card_id: item.card_id.trim(),
        language: item.language.trim(),
        quantity_ordered: item.quantity,
        fx_total_lot: item.fx_total_lot,
        fx_unit_price,
        unit_cost_cop,
        remaining_quantity: item.quantity,
        card_name: resolveIncomingBatchItemCardName(item, tcgDex),
        image_url: resolveIncomingBatchItemImageUrl(item, tcgDex),
        rareza: rarezaNorm,
        ct0_item_id: item.ct0_item_id,
        blueprint_id: item.blueprint_id,
        expansion: item.expansion?.trim() || undefined,
        collector_number: item.collector_number?.trim() || undefined,
        created_at: new Date(),
      };
    });

    await this.lineRepository.createMany(linesToInsert);
    return { lot_id: lotId };
  }

  async updateLot(
    lotId: string,
    body: UpdateCardtraderTransitLotDto,
  ): Promise<{ success: boolean; message?: string }> {
    const lot = await this.lotRepository.findById(lotId);
    if (!lot) return { success: false, message: 'Lote no encontrado' };

    const updateData: Record<string, unknown> = {};

    if (body.purchase_date != null) {
      const parsed = new Date(body.purchase_date);
      if (Number.isNaN(parsed.getTime())) {
        return { success: false, message: 'purchase_date inválido' };
      }
      updateData.purchase_date = parsed;
    }

    if (body.total_cop_cards_cost != null) {
      if (
        !Number.isFinite(body.total_cop_cards_cost) ||
        body.total_cop_cards_cost <= 0
      ) {
        return {
          success: false,
          message: 'total_cop_cards_cost debe ser mayor a 0',
        };
      }
      const newRate =
        body.total_cop_cards_cost / Number(lot.total_fx_cards_cost || 0);
      if (!Number.isFinite(newRate) || newRate <= 0) {
        return { success: false, message: 'No se pudo recalcular la tasa real' };
      }
      updateData.total_cop_cards_cost = body.total_cop_cards_cost;
      updateData.real_fx_rate_cop = newRate;
      await this.lineRepository.updateUnitCostByLotId(lotId, newRate);
    }

    if (body.cards_cost_currency != null) {
      updateData.cards_cost_currency = normalizeCardsCostCurrency(
        body.cards_cost_currency,
      );
    }

    await this.lotRepository.updateById(lotId, updateData);
    return { success: true };
  }

  async deleteLot(lotId: string): Promise<{ success: boolean; message?: string }> {
    const lot = await this.lotRepository.findById(lotId);
    if (!lot) return { success: false, message: 'Lote no encontrado' };
    await this.lineRepository.deleteByLotId(lotId);
    const deleted = await this.lotRepository.deleteById(lotId);
    return { success: deleted };
  }

  async clearAllLots(): Promise<{
    deleted_lots: number;
    deleted_lines: number;
  }> {
    const deletedLines = await this.lineRepository.deleteAll();
    const deletedLots = await this.lotRepository.deleteAll();
    return { deleted_lots: deletedLots, deleted_lines: deletedLines };
  }
}
