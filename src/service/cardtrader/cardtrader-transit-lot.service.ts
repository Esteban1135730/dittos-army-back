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
  MarkNotArrivedDto,
  MarkNotArrivedResult,
  UpdateCardtraderTransitLotDto,
} from 'src/Dto/cardtrader-transit-lot.dto';
import { CardtraderTransitLineRepository } from 'src/repository/cardtrader-transit-line.repository';
import { CardtraderTransitLotRepository } from 'src/repository/cardtrader-transit-lot.repository';
import { IncomingBatchItemRepository } from 'src/repository/incoming-batch-item.repository';
import { IncomingBatchRepository } from 'src/repository/incoming-batch.repository';
import { TCGDexService } from 'src/pokemon';
import {
  cardIdsNeedingTcgDexEnrichment,
  resolveIncomingBatchItemCardName,
  resolveIncomingBatchItemImageUrl,
  type TcgDexBatchEnrichment,
} from 'src/utils/incoming-batch-item-meta';
import {
  isOwnerKey,
  OWNERS_CONFIG,
  type OwnerKey,
} from 'src/config/owners.config';
import { normalizeCardsCostCurrency } from 'src/utils/purchase-currency';
import {
  findLegacyItemByCardName,
  unitCostCopFromLegacyItemRuleOfThree,
} from 'src/utils/incoming-batch-item-pricing';
import { getCurrentOwner } from 'src/owner/owner-context';
import { InFlightDedupe } from 'src/utils/ttl-cache';

@Injectable()
export class CardtraderTransitLotService {
  private readonly ownerBackfillDone = new Set<OwnerKey>();
  private readonly ownerBackfillInFlight = new InFlightDedupe<void>();

  constructor(
    private readonly lotRepository: CardtraderTransitLotRepository,
    private readonly lineRepository: CardtraderTransitLineRepository,
    private readonly incomingBatchRepository: IncomingBatchRepository,
    private readonly incomingBatchItemRepository: IncomingBatchItemRepository,
    private readonly tcgDexService: TCGDexService,
  ) {}

  /**
   * `backfillMissingOwner` es idempotente y solo corrige datos legacy: basta una
   * vez por proceso y owner (si falla, se reintenta en la siguiente llamada).
   */
  private async backfillMissingOwnerOnce(): Promise<void> {
    const owner = getCurrentOwner();
    if (this.ownerBackfillDone.has(owner)) return;
    await this.ownerBackfillInFlight.run(owner, async () => {
      await this.lotRepository.backfillMissingOwner();
      this.ownerBackfillDone.add(owner);
    });
  }

  private resolveLotOwner(raw: unknown): OwnerKey {
    return isOwnerKey(raw) ? raw : OWNERS_CONFIG.defaultOwner;
  }

  private isLotOwnerEditable(
    lines: Array<{ remaining_quantity: number; quantity_ordered: number }>,
  ): boolean {
    return lines.every(
      (line) => line.remaining_quantity === line.quantity_ordered,
    );
  }

  private parseCreateOwner(body: CreateCardtraderTransitLotDto): OwnerKey {
    if (body.owner == null) {
      return OWNERS_CONFIG.defaultOwner;
    }
    if (!isOwnerKey(body.owner)) {
      throw new BadRequestException('owner inválido');
    }
    return body.owner;
  }

  private async resolveLegacyLotPricing(
    body: CreateCardtraderTransitLotDto,
  ): Promise<{
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

    const total_fx_cards_cost = Number(
      body.legacy_basis_total_fx_cards_cost || 0,
    );
    const total_cop_cards_cost = Number(
      body.legacy_basis_total_cop_cards_cost ?? body.total_cop_cards_cost ?? 0,
    );
    const real_fx_rate_cop = Number(
      body.legacy_basis_real_fx_rate_cop ||
        (total_fx_cards_cost > 0
          ? total_cop_cards_cost / total_fx_cards_cost
          : 0),
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
      owner: OwnerKey;
    }>
  > {
    await this.backfillMissingOwnerOnce();
    const lots = await this.lotRepository.findOpenLots();
    if (lots.length === 0) return [];

    const lines = await this.lineRepository.findByLotIdsLean(
      lots.map((lot) => lot._id.toString()),
    );
    const remainingByLotId = new Map<string, number>();
    for (const line of lines) {
      const lotId = String(line.lot_id);
      remainingByLotId.set(
        lotId,
        (remainingByLotId.get(lotId) ?? 0) + (line.remaining_quantity || 0),
      );
    }

    const result = await Promise.all(
      lots.map(async (lot) => {
        const lotId = lot._id.toString();
        const remainingTotal = remainingByLotId.get(lotId) ?? 0;
        return {
          lot_id: lotId,
          status: lot.status,
          source: lot.source,
          ct0_package_key: lot.ct0_package_key ?? null,
          purchase_date: lot.purchase_date,
          created_at: lot.created_at,
          total_fx_cards_cost: lot.total_fx_cards_cost,
          total_cop_cards_cost: lot.total_cop_cards_cost,
          cards_cost_currency: normalizeCardsCostCurrency(
            lot.cards_cost_currency,
          ),
          legacy_incoming_batch_id: lot.legacy_incoming_batch_id ?? null,
          registered_items_fx_subtotal:
            lot.registered_items_fx_subtotal ?? null,
          remaining_total_quantity: remainingTotal,
          owner: this.resolveLotOwner(lot.owner),
        };
      }),
    );

    return result;
  }

  async getLot(lotId: string) {
    const lot = await this.lotRepository.findById(lotId);
    if (!lot) throw new NotFoundException('Lote no encontrado');
    const lines = await this.lineRepository.findByLotId(lotId);
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
      owner: this.resolveLotOwner(lot.owner),
      owner_editable: this.isLotOwnerEditable(lines),
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
      product_id: line.product_id ?? null,
      blueprint_id: line.blueprint_id ?? null,
      expansion: line.expansion ?? null,
      collector_number: line.collector_number ?? null,
      not_arrived_at: line.not_arrived_at ?? null,
      created_at: line.created_at,
    }));
  }

  async listRegisteredPackageKeys(): Promise<string[]> {
    return this.lotRepository.findOpenPackageKeys();
  }

  async markNotArrived(body: MarkNotArrivedDto): Promise<MarkNotArrivedResult> {
    const rawIds = body?.ct0_item_ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      throw new BadRequestException(
        'ct0_item_ids es requerido y debe ser un array',
      );
    }
    const ct0ItemIds = [
      ...new Set(
        rawIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    if (ct0ItemIds.length === 0) {
      throw new BadRequestException('ct0_item_ids debe contener enteros > 0');
    }

    const openLots = await this.lotRepository.findOpenLots();
    const openLotIds = new Set(openLots.map((l) => l._id.toString()));

    const lines = await this.lineRepository.findByCt0ItemIds(ct0ItemIds);
    const lineByCt0 = new Map<number, (typeof lines)[number]>();
    for (const line of lines) {
      const ct0Id = line.ct0_item_id;
      if (ct0Id == null || !openLotIds.has(String(line.lot_id))) continue;
      if (!lineByCt0.has(ct0Id)) {
        lineByCt0.set(ct0Id, line);
      }
    }

    const marked: MarkNotArrivedResult['marked'] = [];
    const already_marked: MarkNotArrivedResult['already_marked'] = [];
    const not_found: number[] = [];
    const now = new Date();

    for (const ct0Id of ct0ItemIds) {
      const line = lineByCt0.get(ct0Id);
      if (!line) {
        not_found.push(ct0Id);
        continue;
      }
      const lineId = line._id.toString();
      if (line.not_arrived_at) {
        already_marked.push({ ct0_item_id: ct0Id, transit_line_id: lineId });
        continue;
      }
      const updated = await this.lineRepository.setNotArrivedAtIfUnset(
        lineId,
        now,
      );
      if (updated?.not_arrived_at) {
        marked.push({ ct0_item_id: ct0Id, transit_line_id: lineId });
        continue;
      }
      const refreshed = await this.lineRepository.findById(lineId);
      if (refreshed?.not_arrived_at) {
        already_marked.push({ ct0_item_id: ct0Id, transit_line_id: lineId });
      } else {
        not_found.push(ct0Id);
      }
    }

    return { marked, already_marked, not_found };
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
      expansion: string | null;
      collector_number: string | null;
      owner: OwnerKey;
    }>
  > {
    const lots = await this.lotRepository.findOpenLots();
    if (lots.length === 0) return [];

    const rows = await Promise.all(
      lots.map(async (lot) => {
        const lotId = lot._id.toString();
        const owner = this.resolveLotOwner(lot.owner);
        const lines = await this.lineRepository.findByLotId(lotId);
        return lines
          .filter(
            (line) =>
              (line.remaining_quantity ?? 0) > 0 && line.not_arrived_at == null,
          )
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
            expansion: line.expansion ?? null,
            collector_number: line.collector_number ?? null,
            owner,
          }));
      }),
    );

    return rows.flat().sort((a, b) => {
      const pd = a.purchase_date.getTime() - b.purchase_date.getTime();
      if (pd !== 0) return pd;
      return a.created_at.getTime() - b.created_at.getTime();
    });
  }

  async createLot(
    body: CreateCardtraderTransitLotDto,
  ): Promise<{ lot_id: string }> {
    const items = body?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('items es requerido y debe ser un array');
    }

    const isComplementos = body.source === 'complementos';

    if (isComplementos) {
      if (
        body.total_cop_cards_cost == null ||
        body.total_cop_cards_cost !== 0
      ) {
        throw new BadRequestException(
          'lote complementos requiere total_cop_cards_cost = 0',
        );
      }
    } else if (
      body.total_cop_cards_cost == null ||
      body.total_cop_cards_cost <= 0
    ) {
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
          isComplementos
            ? 'Ya existe un lote de complementos con esta clave'
            : 'Ya existe un lote registrado para este checkout CT Zero',
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
      if (isComplementos) {
        if (item.fx_total_lot == null || item.fx_total_lot !== 0) {
          throw new BadRequestException(
            'lote complementos requiere fx_total_lot = 0 en cada línea',
          );
        }
      } else if (item.fx_total_lot == null || item.fx_total_lot <= 0) {
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
    if (!isComplementos && registered_items_fx_subtotal <= 0) {
      throw new BadRequestException(
        'registered_items_fx_subtotal calculado inválido',
      );
    }

    let total_fx_cards_cost: number;
    let total_cop_cards_cost: number;
    let real_fx_rate_cop: number;
    let cards_cost_currency: string;

    if (isComplementos) {
      total_fx_cards_cost = 0;
      total_cop_cards_cost = 0;
      real_fx_rate_cop = 0;
      cards_cost_currency = normalizeCardsCostCurrency(
        body.cards_cost_currency,
      );
    } else {
      const legacyPricing = await this.resolveLegacyLotPricing(body);

      if (legacyPricing) {
        total_fx_cards_cost = legacyPricing.total_fx_cards_cost;
        total_cop_cards_cost = legacyPricing.total_cop_cards_cost;
        real_fx_rate_cop = legacyPricing.real_fx_rate_cop;
        cards_cost_currency = legacyPricing.cards_cost_currency;
      } else {
        total_fx_cards_cost = registered_items_fx_subtotal;
        total_cop_cards_cost = body.total_cop_cards_cost;
        real_fx_rate_cop = total_cop_cards_cost / total_fx_cards_cost;
        cards_cost_currency = normalizeCardsCostCurrency(
          body.cards_cost_currency,
        );
      }

      if (!Number.isFinite(real_fx_rate_cop) || real_fx_rate_cop <= 0) {
        throw new BadRequestException('real_fx_rate_cop calculado inválido');
      }
    }

    const source: 'ct0' | 'manual' | 'complementos' = isComplementos
      ? 'complementos'
      : body.source === 'manual'
        ? 'manual'
        : 'ct0';

    const owner = this.parseCreateOwner(body);

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
      legacy_incoming_batch_id:
        body.legacy_incoming_batch_id?.trim() || undefined,
      legacy_incoming_cop_hint:
        body.legacy_incoming_cop_hint != null &&
        body.legacy_incoming_cop_hint > 0
          ? body.legacy_incoming_cop_hint
          : undefined,
      owner,
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
    const languageByCardId = new Map<string, string>();
    for (const item of items) {
      const id = item.card_id?.trim();
      if (id && item.language?.trim() && !languageByCardId.has(id)) {
        languageByCardId.set(id, item.language.trim());
      }
    }
    const cardMap = new Map<string, TcgDexBatchEnrichment>();
    await Promise.all(
      cardIds.map(async (cardId) => {
        try {
          const card = await this.tcgDexService.getCard(
            cardId,
            languageByCardId.get(cardId),
          );
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
      const fx_unit_price = isComplementos
        ? 0
        : item.fx_total_lot / item.quantity;
      const legacyItem = isComplementos
        ? null
        : findLegacyItemByCardName(item.card_name?.trim() ?? '', legacyItems);
      const unit_cost_cop = isComplementos
        ? 0
        : unitCostCopFromLegacyItemRuleOfThree(
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
        product_id:
          typeof item.product_id === 'number' && item.product_id > 0
            ? item.product_id
            : undefined,
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
    if (body.owner != null && !isOwnerKey(body.owner)) {
      throw new BadRequestException('owner inválido');
    }

    const lot = await this.lotRepository.findById(lotId);
    if (!lot) return { success: false, message: 'Lote no encontrado' };

    const updateData: Record<string, unknown> = {};

    if (body.owner != null) {
      const currentOwner = this.resolveLotOwner(lot.owner);
      if (body.owner !== currentOwner) {
        const lines = await this.lineRepository.findByLotId(lotId);
        if (!this.isLotOwnerEditable(lines)) {
          throw new ConflictException(
            'No se puede cambiar el dueño porque ya se creó stock o se recibió parte del lote',
          );
        }
      }
      updateData.owner = body.owner;
    }

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
        return {
          success: false,
          message: 'No se pudo recalcular la tasa real',
        };
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

  async deleteLot(
    lotId: string,
  ): Promise<{ success: boolean; message?: string }> {
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
