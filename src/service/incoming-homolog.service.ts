import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CardTraderService } from './cardtrader/cardtrader.service';
import { CardtraderSentUnitRepository } from '../repository/cardtrader-sent-unit.repository';
import { IncomingHomologSessionRepository } from '../repository/incoming-homolog-session.repository';
import { IncomingBatchNovedadRepository } from '../repository/incoming-batch-novedad.repository';
import { IncomingBatchItemRepository } from '../repository/incoming-batch-item.repository';
import { IncomingBatchRepository } from '../repository/incoming-batch.repository';
import { IncomingShipRoundRepository } from '../repository/incoming-ship-round.repository';
import { IncomingShipRoundItemRepository } from '../repository/incoming-ship-round-item.repository';
import { IncomingShipRoundCardUnitRepository } from '../repository/incoming-ship-round-card-unit.repository';
import {
  expandSentUnitsFromOrders,
  inferSentUnitRareza,
  normalizeCtOrdersResponse,
} from '../utils/cardtrader-sent-units';
import type {
  IncomingHomologUnit,
  IncomingHomologUnitStatus,
} from '../schema/incoming-homolog-session.schema';
import type {
  CreateHomologTandaDto,
  CreateBatchNovedadDto,
} from '../Dto/incoming-homolog.dto';
import {
  copFromFxUnit,
  fxUnitPriceFromSentUnit,
  normalizeCardsCostCurrency,
} from '../utils/purchase-currency';
import type { IncomingBatchItemDocument } from '../schema/incoming-batch-item.schema';

@Injectable()
export class IncomingHomologService {
  constructor(
    private readonly cardTraderService: CardTraderService,
    private readonly sentUnitRepository: CardtraderSentUnitRepository,
    private readonly sessionRepository: IncomingHomologSessionRepository,
    private readonly novedadRepository: IncomingBatchNovedadRepository,
    private readonly batchItemRepository: IncomingBatchItemRepository,
    private readonly batchRepository: IncomingBatchRepository,
    private readonly shipRoundRepository: IncomingShipRoundRepository,
    private readonly shipRoundItemRepository: IncomingShipRoundItemRepository,
    private readonly shipRoundCardUnitRepository: IncomingShipRoundCardUnitRepository,
  ) {}

  async getActiveSession() {
    const session = await this.sessionRepository.findActive();
    if (!session) return { session: null, panel_items: [], batches_summary: [] };
    const enriched = await this.enrichSessionUnits(session);
    const panelItems = await this.loadPanelItems({ units: enriched });
    const batchesSummary = await this.loadBatchesSummary();
    return {
      session: this.serializeSession({
        ...(typeof session.toObject === 'function'
          ? session.toObject()
          : session),
        units: enriched,
      }),
      panel_items: panelItems,
      batches_summary: batchesSummary,
    };
  }

  async createSession() {
    const existing = await this.sessionRepository.findActive();
    if (existing) {
      throw new ConflictException(
        'Ya hay una sesión de homologación activa. Continúa o cancélala.',
      );
    }
    const session = await this.sessionRepository.create({});
    const synced = await this.syncCardtraderSent(session._id.toString());
    return synced;
  }

  async getSession(sessionId: string) {
    const session = await this.requireSession(sessionId);
    const enriched = await this.enrichSessionUnits(session);
    const panelItems = await this.loadPanelItems({ units: enriched });
    const batchesSummary = await this.loadBatchesSummary();
    return {
      session: this.serializeSession({
        ...(typeof session.toObject === 'function'
          ? session.toObject()
          : session),
        units: enriched,
      }),
      panel_items: panelItems,
      batches_summary: batchesSummary,
    };
  }

  async syncCardtraderSent(sessionId: string) {
    const session = await this.requireSession(sessionId);
    if (session.status === 'converted' || session.status === 'cancelled') {
      throw new BadRequestException('La sesión ya no admite sincronización');
    }

    const raw = await this.cardTraderService.getOrders({
      state: 'sent',
      orderAs: 'buyer',
      limit: 100,
    });
    const orders = normalizeCtOrdersResponse(raw);
    const parsed = expandSentUnitsFromOrders(orders);

    await this.sentUnitRepository.upsertMany(
      parsed.map((u) => ({
        unit_key: u.unit_key,
        line_key: u.line_key,
        unit_index: u.unit_index,
        order_id: u.order_id,
        order_code: u.order_code,
        order_item_id: u.order_item_id,
        name: u.name,
        expansion: u.expansion,
        language: u.language,
        blueprint_id: u.blueprint_id,
        collector_number: u.collector_number,
        rareza: u.rareza,
        unit_price_eur: u.unit_price_eur,
        price_currency: u.price_currency,
        unit_price_raw: u.unit_price_raw,
        paid_at: u.paid_at,
        sent_at: u.sent_at,
        order_state: u.order_state,
        properties: u.properties,
      })),
    );

    const existingByKey = new Map(
      (session.units ?? []).map((u) => [u.sent_unit_key, u]),
    );

    const units: IncomingHomologUnit[] = parsed.map((p) => {
      const unitPriceFx = p.unit_price_raw ?? p.unit_price_eur;
      const priceCurrency = p.price_currency ?? 'USD';
      const prev = existingByKey.get(p.unit_key);
      if (prev) {
        const prevDoc = prev as IncomingHomologUnit & {
          toObject?: () => IncomingHomologUnit;
        };
        const prevPlain =
          typeof prevDoc.toObject === 'function' ? prevDoc.toObject() : prevDoc;
        return {
          ...prevPlain,
          name: p.name,
          expansion: p.expansion,
          language: p.language,
          blueprint_id: p.blueprint_id,
          unit_price_eur: p.unit_price_eur,
          unit_price_fx: unitPriceFx,
          price_currency: priceCurrency,
          paid_at: p.paid_at,
          rareza: p.rareza,
        };
      }
      return {
        sent_unit_key: p.unit_key,
        line_key: p.line_key,
        unit_index: p.unit_index,
        order_id: p.order_id,
        order_code: p.order_code,
        name: p.name,
        expansion: p.expansion,
        language: p.language,
        blueprint_id: p.blueprint_id,
        unit_price_eur: p.unit_price_eur,
        unit_price_fx: unitPriceFx,
        price_currency: priceCurrency,
        paid_at: p.paid_at,
        rareza: p.rareza,
        status: 'pending' as IncomingHomologUnitStatus,
        batch_item_id: null,
        batch_id: null,
        batch_item_card_id: null,
        batch_item_card_name: null,
        unit_cost_cop: null,
        purchase_price_eur: null,
        purchase_price_fx: null,
        purchase_price_currency: null,
        match_score: null,
        novedad_notes: '',
      };
    });

    const status = this.deriveSessionStatus(units);
    const updated = await this.sessionRepository.updateUnits(
      sessionId,
      units,
      status,
    );
    if (!updated) throw new NotFoundException('Sesión no encontrada');

    const enriched = await this.enrichSessionUnits(updated);
    const panelItems = await this.loadPanelItems({ units: enriched });
    return {
      session: this.serializeSession({
        ...(typeof updated.toObject === 'function'
          ? updated.toObject()
          : updated),
        units: enriched,
      }),
      panel_items: panelItems,
      batches_summary: await this.loadBatchesSummary(),
      synced_count: parsed.length,
    };
  }

  async verifyUnit(
    sessionId: string,
    sentUnitKey: string,
    batchItemId: string,
    matchScore?: number,
  ) {
    const session = await this.requireSession(sessionId);
    this.assertSessionEditable(session);

    const batchItem = await this.batchItemRepository.findById(batchItemId);
    if (!batchItem) throw new NotFoundException('batch_item no encontrado');
    if (batchItem.remaining_quantity <= 0) {
      throw new BadRequestException('Este ítem del panel no tiene unidades disponibles');
    }

    const usedOnBatchItem = (session.units ?? []).filter(
      (u) =>
        u.status === 'verified' &&
        u.batch_item_id === batchItemId &&
        u.sent_unit_key !== sentUnitKey,
    ).length;
    if (usedOnBatchItem >= batchItem.remaining_quantity) {
      throw new BadRequestException(
        'Ya se asignaron todas las unidades disponibles de este ítem del panel',
      );
    }

    const batch = await this.batchRepository.findById(batchItem.batch_id);
    if (!batch) throw new NotFoundException('batch no encontrado');

    const unitIdx = (session.units ?? []).findIndex(
      (u) => u.sent_unit_key === sentUnitKey,
    );
    if (unitIdx < 0) throw new NotFoundException('Carta sent no encontrada en sesión');

    const homologUnit = session.units[unitIdx];
    const batchCurrency = normalizeCardsCostCurrency(batch.cards_cost_currency);
    const ctCurrency = normalizeCardsCostCurrency(homologUnit.price_currency);
    let purchaseFx = fxUnitPriceFromSentUnit(homologUnit);
    if (purchaseFx == null && ctCurrency === batchCurrency) {
      purchaseFx = batchItem.eur_unit_price;
    }
    const purchaseCurrency = purchaseFx != null ? ctCurrency : batchCurrency;
    const unitCostCop =
      purchaseFx != null && purchaseFx > 0
        ? (copFromFxUnit(purchaseFx, batch.real_euro_rate_cop_per_eur) ??
          batchItem.unit_cost_cop)
        : batchItem.unit_cost_cop;

    const updated = await this.persistUnitPatch(sessionId, sentUnitKey, {
      status: 'verified',
      batch_item_id: batchItemId,
      batch_id: batch._id.toString(),
      batch_item_card_id: batchItem.card_id,
      batch_item_card_name: batchItem.card_name ?? batchItem.card_id,
      purchase_price_eur: purchaseCurrency === 'EUR' ? purchaseFx : null,
      purchase_price_fx: purchaseFx,
      purchase_price_currency: purchaseCurrency,
      unit_cost_cop: unitCostCop,
      match_score: matchScore ?? null,
      verified_at: new Date(),
      novedad_notes: '',
    });

    const panelItems = await this.loadPanelItems(updated);
    return {
      session: this.serializeSession(updated),
      panel_items: panelItems,
      batches_summary: await this.loadBatchesSummary(),
    };
  }

  async markNovedad(
    sessionId: string,
    sentUnitKey: string,
    notes: string,
    batchItemId?: string,
  ) {
    const session = await this.requireSession(sessionId);
    this.assertSessionEditable(session);

    const unitIdx = (session.units ?? []).findIndex(
      (u) => u.sent_unit_key === sentUnitKey,
    );
    if (unitIdx < 0) throw new NotFoundException('Carta sent no encontrada');

    let batchItem: IncomingBatchItemDocument | null = null;
    if (batchItemId) {
      batchItem = await this.batchItemRepository.findById(batchItemId);
      if (!batchItem) throw new NotFoundException('batch_item no encontrado');
    }

    const homologUnit = session.units[unitIdx];

    if (batchItem) {
      await this.novedadRepository.create({
        batch_item_id: batchItem._id.toString(),
        batch_id: batchItem.batch_id,
        session_id: sessionId,
        sent_unit_key: sentUnitKey,
        card_id: batchItem.card_id,
        card_name: batchItem.card_name ?? batchItem.card_id,
        source: 'homolog_sent',
        notes: notes.trim(),
      });
    }

    const updated = await this.persistUnitPatch(sessionId, sentUnitKey, {
      status: 'novedad',
      batch_item_id: batchItem?._id.toString() ?? null,
      batch_id: batchItem?.batch_id ?? null,
      batch_item_card_id: batchItem?.card_id ?? null,
      batch_item_card_name: batchItem?.card_name ?? null,
      novedad_notes: notes.trim(),
      verified_at: new Date(),
    });

    return {
      session: this.serializeSession(updated),
      panel_items: await this.loadPanelItems(updated),
      batches_summary: await this.loadBatchesSummary(),
    };
  }

  async undoUnit(sessionId: string, sentUnitKey: string) {
    const session = await this.requireSession(sessionId);
    this.assertSessionEditable(session);

    const unitIdx = (session.units ?? []).findIndex(
      (u) => u.sent_unit_key === sentUnitKey,
    );
    if (unitIdx < 0) throw new NotFoundException('Carta sent no encontrada');

    const updated = await this.persistUnitPatch(sessionId, sentUnitKey, {
      status: 'pending',
      batch_item_id: null,
      batch_id: null,
      batch_item_card_id: null,
      batch_item_card_name: null,
      unit_cost_cop: null,
      purchase_price_eur: null,
      purchase_price_fx: null,
      purchase_price_currency: null,
      match_score: null,
      novedad_notes: '',
      verified_at: null,
    });

    return {
      session: this.serializeSession(updated),
      panel_items: await this.loadPanelItems(updated),
      batches_summary: await this.loadBatchesSummary(),
    };
  }

  async listNovedades() {
    const rows = await this.novedadRepository.listUnresolved();
    return rows.map((r) => ({
      novedad_id: r._id.toString(),
      batch_item_id: r.batch_item_id,
      batch_id: r.batch_id,
      session_id: r.session_id,
      sent_unit_key: r.sent_unit_key,
      card_id: r.card_id,
      card_name: r.card_name,
      source: r.source,
      notes: r.notes,
      resolved: r.resolved,
      created_at: r.created_at,
    }));
  }

  async createPanelNovedad(body: CreateBatchNovedadDto) {
    const batchItem = await this.batchItemRepository.findById(body.batch_item_id);
    if (!batchItem) throw new NotFoundException('batch_item no encontrado');

    const row = await this.novedadRepository.create({
      batch_item_id: batchItem._id.toString(),
      batch_id: batchItem.batch_id,
      session_id: body.session_id ?? null,
      sent_unit_key: body.sent_unit_key ?? null,
      card_id: batchItem.card_id,
      card_name: batchItem.card_name ?? batchItem.card_id,
      source: 'homolog_panel',
      notes: body.notes.trim(),
    });

    return {
      novedad_id: row._id.toString(),
      batch_item_id: row.batch_item_id,
      card_name: row.card_name,
      notes: row.notes,
    };
  }

  async resolveNovedad(novedadId: string) {
    const row = await this.novedadRepository.resolve(novedadId);
    if (!row) throw new NotFoundException('Novedad no encontrada');
    return { success: true };
  }

  async createTanda(sessionId: string, body: CreateHomologTandaDto) {
    const session = await this.requireSession(sessionId);
    if (session.status === 'converted') {
      throw new BadRequestException('Esta sesión ya generó una tanda');
    }

    const shipping = body.shipping_total_cop;
    if (!Number.isFinite(shipping) || shipping <= 0) {
      throw new BadRequestException('shipping_total_cop inválido');
    }

    const units = session.units ?? [];
    const pending = units.filter((u) => u.status === 'pending');
    if (pending.length > 0) {
      throw new BadRequestException(
        `Quedan ${pending.length} cartas sent sin verificar ni marcar como novedad`,
      );
    }

    const cards = body.cards ?? [];
    if (cards.length !== units.length) {
      throw new BadRequestException(
        'cards debe incluir todas las unidades sent de la sesión',
      );
    }

    const unitKeys = new Set(units.map((u) => u.sent_unit_key));
    for (const card of cards) {
      if (!unitKeys.has(card.sent_unit_key)) {
        throw new BadRequestException(`sent_unit_key desconocido: ${card.sent_unit_key}`);
      }
      if (card.is_novedad) {
        if (!card.batch_item_id?.trim()) continue;
      } else if (!card.batch_item_id?.trim()) {
        throw new BadRequestException('batch_item_id requerido por carta verificada');
      }
      if (!Number.isFinite(card.purchase_price_eur) || card.purchase_price_eur <= 0) {
        throw new BadRequestException('purchase_price_eur inválido');
      }
      if (!card.is_novedad && (!Number.isFinite(card.unit_cost_cop) || card.unit_cost_cop <= 0)) {
        throw new BadRequestException('unit_cost_cop inválido');
      }
    }

    const batchItemsInRoute =
      await this.batchItemRepository.findByRemainingQuantityGreaterThanZero();
    if (batchItemsInRoute.length === 0) {
      throw new BadRequestException('No hay cartas en camino en el panel');
    }

    const arrivedByBatchItem = new Map<string, number>();
    for (const card of cards) {
      if (card.is_novedad) continue;
      arrivedByBatchItem.set(
        card.batch_item_id,
        (arrivedByBatchItem.get(card.batch_item_id) ?? 0) + 1,
      );
    }

    const batchItemMap = new Map(
      batchItemsInRoute.map((bi) => [bi._id.toString(), bi]),
    );
    for (const [batchItemId, count] of arrivedByBatchItem) {
      const bi = batchItemMap.get(batchItemId);
      if (!bi) throw new BadRequestException(`batch_item ${batchItemId} no en camino`);
      if (count > bi.remaining_quantity) {
        throw new BadRequestException(
          `arrived_quantity excede remaining para ${bi.card_name ?? bi.card_id}`,
        );
      }
    }

    const round = await this.shipRoundRepository.create({
      shipping_total_cop: shipping,
    });
    const roundId = round._id.toString();
    const now = new Date();

    const roundItems = batchItemsInRoute.map((it) => ({
      ship_round_id: roundId,
      batch_item_id: it._id.toString(),
      arrived_quantity: arrivedByBatchItem.get(it._id.toString()) ?? 0,
      novedad_quantity: 0,
      novedad_notes: '',
      created_at: now,
      updated_at: now,
    }));
    await this.shipRoundItemRepository.createMany(roundItems);

    await this.shipRoundCardUnitRepository.createMany(
      cards
        .filter((c) => c.batch_item_id?.trim())
        .map((c) => ({
          ship_round_id: roundId,
          batch_item_id: c.batch_item_id,
          sent_unit_key: c.sent_unit_key,
          purchase_price_eur: c.purchase_price_eur,
          unit_cost_cop: c.unit_cost_cop,
          is_novedad: Boolean(c.is_novedad),
          novedad_notes: c.novedad_notes ?? '',
          created_at: now,
        })),
    );

    await this.sessionRepository.markConverted(sessionId, roundId, shipping);

    return {
      round_id: roundId,
      included_items: roundItems.length,
      card_units: cards.length,
    };
  }

  async cancelSession(sessionId: string) {
    const session = await this.requireSession(sessionId);
    if (session.status === 'converted') {
      throw new BadRequestException('No se puede cancelar una sesión convertida');
    }
    await this.sessionRepository.cancel(sessionId);
    return { success: true };
  }

  private async requireSession(sessionId: string) {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) throw new NotFoundException('Sesión no encontrada');
    return session;
  }

  private assertSessionEditable(session: { status: string }) {
    if (session.status === 'converted' || session.status === 'cancelled') {
      throw new BadRequestException('La sesión ya no admite cambios');
    }
  }

  private unitNeedsCtEnrich(unit: IncomingHomologUnit): boolean {
    const hasPrice =
      fxUnitPriceFromSentUnit(unit) != null ||
      (unit.unit_price_eur != null && unit.unit_price_eur > 0);
    return !hasPrice || unit.paid_at == null;
  }

  private async enrichSessionUnits(session: {
    units?: IncomingHomologUnit[];
  }): Promise<IncomingHomologUnit[]> {
    const units = session.units ?? [];
    const stale = units.filter((u) => this.unitNeedsCtEnrich(u));
    if (stale.length === 0) return units;

    const catalog = await this.sentUnitRepository.findByUnitKeys(
      stale.map((u) => u.sent_unit_key),
    );
    const byKey = new Map(catalog.map((c) => [c.unit_key, c]));

    return units.map((u) => {
      const ct = byKey.get(u.sent_unit_key);
      if (!ct) return u;

      const unitDoc = u as IncomingHomologUnit & {
        toObject?: () => IncomingHomologUnit;
      };
      const base =
        typeof unitDoc.toObject === 'function' ? unitDoc.toObject() : unitDoc;

      const unitPriceFx =
        u.unit_price_fx ??
        (ct.unit_price_raw > 0 ? ct.unit_price_raw : null) ??
        (ct.unit_price_eur != null && ct.unit_price_eur > 0
          ? ct.unit_price_eur
          : null);

      return {
        ...base,
        unit_price_fx: unitPriceFx,
        unit_price_eur: u.unit_price_eur ?? ct.unit_price_eur,
        price_currency: u.price_currency || ct.price_currency || 'USD',
        paid_at: u.paid_at ?? ct.paid_at,
        rareza:
          u.rareza ??
          ct.rareza ??
          inferSentUnitRareza(u.expansion || ct.expansion || ''),
      };
    });
  }

  private deriveSessionStatus(
    units: IncomingHomologUnit[],
  ): 'in_progress' | 'ready' {
    const pending = units.filter((u) => u.status === 'pending').length;
    return pending === 0 && units.length > 0 ? 'ready' : 'in_progress';
  }

  private async persistUnitPatch(
    sessionId: string,
    sentUnitKey: string,
    unitPatch: Record<string, unknown>,
  ) {
    const updated = await this.sessionRepository.updateUnitBySentKey(
      sessionId,
      sentUnitKey,
      unitPatch,
    );
    if (!updated) {
      throw new NotFoundException('Carta sent no encontrada en sesión');
    }
    const status = this.deriveSessionStatus(updated.units ?? []);
    if (updated.status !== status) {
      return (
        (await this.sessionRepository.updateStatus(sessionId, status)) ??
        updated
      );
    }
    return updated;
  }

  private async loadPanelItems(session: { units?: IncomingHomologUnit[] }) {
    const batchItems =
      await this.batchItemRepository.findByRemainingQuantityGreaterThanZero();
    const batchIds = [...new Set(batchItems.map((bi) => bi.batch_id))];
    const batches = await this.batchRepository.findByIds(batchIds);
    const batchMap = new Map(batches.map((b) => [b._id.toString(), b]));

    const verifiedCountByBatchItem = new Map<string, number>();
    for (const u of session.units ?? []) {
      if (u.status !== 'verified' || !u.batch_item_id) continue;
      verifiedCountByBatchItem.set(
        u.batch_item_id,
        (verifiedCountByBatchItem.get(u.batch_item_id) ?? 0) + 1,
      );
    }

    return batchItems.map((bi) => {
      const batch = batchMap.get(bi.batch_id);
      const assigned = verifiedCountByBatchItem.get(bi._id.toString()) ?? 0;
      return {
        batch_item_id: bi._id.toString(),
        batch_id: bi.batch_id,
        card_id: bi.card_id,
        card_name: bi.card_name ?? bi.card_id,
        image_url: bi.image_url ?? '',
        language: bi.language,
        rareza: bi.rareza ?? null,
        remaining_quantity: bi.remaining_quantity,
        quantity_ordered: bi.quantity_ordered,
        eur_unit_price: bi.eur_unit_price,
        eur_total_lot: bi.eur_total_lot,
        unit_cost_cop: bi.unit_cost_cop,
        cards_cost_currency: normalizeCardsCostCurrency(batch?.cards_cost_currency),
        batch_purchase_date: batch?.purchase_date ?? null,
        batch_total_eur_cards_cost: batch?.total_eur_cards_cost ?? null,
        batch_total_cop_cards_cost: batch?.total_cop_cards_cost ?? null,
        real_euro_rate_cop_per_eur: batch?.real_euro_rate_cop_per_eur ?? null,
        assigned_in_session: assigned,
        available_in_session: Math.max(0, bi.remaining_quantity - assigned),
      };
    });
  }

  private async loadBatchesSummary() {
    const batches = await this.batchRepository.findOpenBatches();
    const summaries = await Promise.all(
      batches.map(async (batch) => {
        const items = await this.batchItemRepository.findByBatchId(
          batch._id.toString(),
        );
        const remainingTotal = items.reduce(
          (sum, it) => sum + (it.remaining_quantity ?? 0),
          0,
        );
        return {
          batch_id: batch._id.toString(),
          purchase_date: batch.purchase_date,
          total_eur_cards_cost: batch.total_eur_cards_cost,
          total_cop_cards_cost: batch.total_cop_cards_cost,
          real_euro_rate_cop_per_eur: batch.real_euro_rate_cop_per_eur,
          cards_cost_currency: normalizeCardsCostCurrency(batch.cards_cost_currency),
          remaining_total_quantity: remainingTotal,
          open_items_count: items.filter((it) => it.remaining_quantity > 0).length,
        };
      }),
    );
    return summaries.sort(
      (a, b) =>
        new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime(),
    );
  }

  private serializeSession(session: {
    _id: { toString(): string };
    status: string;
    shipping_total_cop?: number | null;
    ship_round_id?: string | null;
    units?: IncomingHomologUnit[];
    cardtrader_synced_at?: Date;
    created_at?: Date;
    updated_at?: Date;
    converted_at?: Date;
  }) {
    const units = session.units ?? [];
    const summary = {
      total: units.length,
      pending: units.filter((u) => u.status === 'pending').length,
      verified: units.filter((u) => u.status === 'verified').length,
      novedad: units.filter((u) => u.status === 'novedad').length,
    };
    return {
      session_id: session._id.toString(),
      status: session.status,
      shipping_total_cop: session.shipping_total_cop ?? null,
      ship_round_id: session.ship_round_id ?? null,
      units: units.map((u) => {
        const unitPriceFx =
          u.unit_price_fx ??
          u.purchase_price_fx ??
          (u.unit_price_eur != null && u.unit_price_eur > 0 ? u.unit_price_eur : null);
        const rareza = u.rareza ?? inferSentUnitRareza(u.expansion ?? '');
        return {
        sent_unit_key: u.sent_unit_key,
        line_key: u.line_key,
        unit_index: u.unit_index,
        order_id: u.order_id,
        order_code: u.order_code,
        name: u.name,
        expansion: u.expansion,
        language: u.language,
        blueprint_id: u.blueprint_id,
        unit_price_eur: u.unit_price_eur,
        unit_price_fx: unitPriceFx,
        price_currency: u.price_currency ?? 'USD',
        paid_at: u.paid_at ?? null,
        rareza,
        status: u.status,
        batch_item_id: u.batch_item_id,
        batch_id: u.batch_id,
        batch_item_card_id: u.batch_item_card_id,
        batch_item_card_name: u.batch_item_card_name,
        unit_cost_cop: u.unit_cost_cop,
        purchase_price_eur: u.purchase_price_eur,
        purchase_price_fx: u.purchase_price_fx,
        purchase_price_currency: u.purchase_price_currency,
        match_score: u.match_score,
        novedad_notes: u.novedad_notes,
        verified_at: u.verified_at ?? null,
        };
      }),
      summary,
      cardtrader_synced_at: session.cardtrader_synced_at,
      created_at: session.created_at,
      updated_at: session.updated_at,
      converted_at: session.converted_at ?? null,
    };
  }
}
