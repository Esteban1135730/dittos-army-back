import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { CardTraderService } from './cardtrader/cardtrader.service';
import { CardtraderSentUnitRepository } from '../repository/cardtrader-sent-unit.repository';
import { IncomingHomologSessionRepository } from '../repository/incoming-homolog-session.repository';
import { IncomingBatchNovedadRepository } from '../repository/incoming-batch-novedad.repository';
import { IncomingBatchItemRepository } from '../repository/incoming-batch-item.repository';
import { IncomingBatchRepository } from '../repository/incoming-batch.repository';
import { IncomingShipRoundRepository } from '../repository/incoming-ship-round.repository';
import { IncomingShipRoundItemRepository } from '../repository/incoming-ship-round-item.repository';
import { IncomingShipRoundCardUnitRepository } from '../repository/incoming-ship-round-card-unit.repository';
import { IncomingHomologNovedadStockRepository } from '../repository/incoming-homolog-novedad-stock.repository';
import { StockRepository } from '../repository/stock.repository';
import { ReservaRepository } from '../repository/reserva.repository';
import { CardTraderTcgdexResolveService } from './cardtrader/cardtrader-tcgdex-resolve.service';
import { TCGDexService } from './tcgdex/tcgdex.service';
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
import { normalizeStockLanguage } from '../utils/stock-language';
import {
  resolveHomologNovedadUnitCostCop,
  FALLBACK_NOVEDAD_UNIT_COST_COP,
  type HomologTrmRates,
} from '../utils/homolog-novedad-pricing';
import { normalizeOperationalRareza } from '../constants/item-rareza';
import {
  buildNovedadTcgdexResolveInput,
  readBlueprintImageUrl,
  type CtBlueprintLike,
} from '../utils/novedad-card-resolve';

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
    private readonly novedadStockRepository: IncomingHomologNovedadStockRepository,
    private readonly stockRepository: StockRepository,
    private readonly reservaRepository: ReservaRepository,
    private readonly tcgdexResolve: CardTraderTcgdexResolveService,
    private readonly tcgdexService: TCGDexService,
  ) {}

  async getActiveSession() {
    let session =
      (await this.sessionRepository.findActive()) ??
      (await this.sessionRepository.findLatestConverted());
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

    if (!batchItem) {
      await this.upsertNovedadStockTracking(sessionId, homologUnit, notes.trim());
    }

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

  async listNovedadStockCards() {
    const rows = await this.novedadStockRepository.listOpen();
    return rows.map((r) => this.serializeNovedadStockRow(r));
  }

  async syncNovedadStockFromSession(sessionId?: string) {
    const session = sessionId
      ? await this.requireSession(sessionId)
      : await this.sessionRepository.findActive();
    if (!session) {
      throw new NotFoundException('No hay sesión de homologación activa');
    }

    const enriched = await this.enrichSessionUnits(session);
    const orphanNovedad = enriched.filter(
      (u) => u.status === 'novedad' && !u.batch_item_id,
    );

    let synced = 0;
    for (const unit of orphanNovedad) {
      await this.upsertNovedadStockTracking(
        session._id.toString(),
        unit,
        unit.novedad_notes ?? '',
      );
      synced += 1;
    }

    const items = await this.novedadStockRepository.listBySession(
      session._id.toString(),
    );

    return {
      session_id: session._id.toString(),
      synced,
      items: items
        .filter((r) => r.status !== 'resolved')
        .map((r) => this.serializeNovedadStockRow(r)),
    };
  }

  async previewMaterializeNovedadStock(body: {
    session_id?: string;
    euro_to_cop: number;
    usd_to_cop: number;
  }) {
    const rates = this.parseTrmRates(body);
    const session = await this.resolveMaterializeSession(body.session_id);
    const plan = await this.buildNovedadMaterializePlan(
      session._id.toString(),
      rates,
      session,
    );
    return {
      session_id: session._id.toString(),
      summary: this.summarizeNovedadPreview(plan),
      items: plan,
    };
  }

  async materializeNovedadStock(body: {
    session_id?: string;
    euro_to_cop: number;
    usd_to_cop: number;
  }) {
    const rates = this.parseTrmRates(body);
    const session = await this.resolveMaterializeSession(body.session_id);
    const plan = await this.buildNovedadMaterializePlan(
      session._id.toString(),
      rates,
      session,
    );

    if (plan.length === 0) {
      return {
        session_id: session._id.toString(),
        created: 0,
        items: [],
      };
    }

    const unitByKey = new Map(
      (await this.enrichSessionUnits(session)).map((u) => [u.sent_unit_key, u]),
    );

    let created = 0;
    const results: ReturnType<IncomingHomologService['serializeNovedadStockRow']>[] =
      [];

    for (const item of plan) {
      const homologUnit = unitByKey.get(item.sent_unit_key);
      if (!homologUnit) continue;

      const rarezaStock =
        normalizeOperationalRareza(homologUnit.rareza ?? null) ?? undefined;

      const stock = await this.stockRepository.create({
        card_id: item.card_id,
        card_name: item.card_name,
        shipment: 0,
        unity_cost: item.unit_cost_cop,
        cards_in_shipmet: 1,
        image_url: item.image_url,
        card_state: 'disponible',
        language: item.language,
        currency: 'COP',
        incoming_notes: `[novedad homolog] ${item.novedad_notes}`.trim(),
        rareza: rarezaStock,
      });

      const stockId = String((stock as { _id?: unknown })._id ?? '');

      const updatedRow = await this.novedadStockRepository.markInStock(
        item.tracking_id,
        {
          stock_id: stockId,
          card_id: item.card_id,
          card_name: item.card_name,
          image_url: item.image_url,
          language: item.language,
          unit_cost_cop: item.unit_cost_cop,
          purchase_price_fx: item.purchase_price_fx,
          price_currency: item.price_currency,
        },
      );

      const priceCurrency = normalizeCardsCostCurrency(item.price_currency);
      await this.persistUnitPatch(session._id.toString(), item.sent_unit_key, {
        unit_cost_cop: item.unit_cost_cop,
        purchase_price_fx: item.purchase_price_fx,
        purchase_price_currency: priceCurrency,
        purchase_price_eur:
          priceCurrency === 'EUR'
            ? item.purchase_price_fx
            : homologUnit.purchase_price_eur,
      });

      if (updatedRow) {
        created += 1;
        results.push(this.serializeNovedadStockRow(updatedRow));
      }
    }

    return {
      session_id: session._id.toString(),
      created,
      items: results,
    };
  }

  async undoNovedadStockMaterialize(body: {
    session_id?: string;
    tracking_ids?: string[];
  }) {
    const trackingIds = (body.tracking_ids ?? []).map((id) => id.trim()).filter(Boolean);
    let rows;
    if (trackingIds.length > 0) {
      rows = await this.novedadStockRepository.findInStockByIds(trackingIds);
    } else {
      const session = body.session_id
        ? await this.requireSession(body.session_id)
        : await this.sessionRepository.findActive();
      if (!session) {
        throw new NotFoundException('No hay sesión de homologación');
      }
      rows = await this.novedadStockRepository.findInStockBySession(
        session._id.toString(),
      );
    }

    if (rows.length === 0) {
      return { reverted: 0, failed: [], items: [] as unknown[] };
    }

    const reverted: ReturnType<IncomingHomologService['serializeNovedadStockRow']>[] =
      [];
    const failed: Array<{ tracking_id: string; card_name: string; reason: string }> =
      [];

    for (const row of rows) {
      const stockId = row.stock_id?.trim();
      if (!stockId) {
        failed.push({
          tracking_id: row._id.toString(),
          card_name: row.card_name,
          reason: 'Sin stock asociado',
        });
        continue;
      }

      const stock = await this.stockRepository.findById(stockId);
      if (!stock) {
        await this.novedadStockRepository.revertToPending(row._id.toString());
        await this.clearHomologUnitCostAfterUndo(row.session_id, row.sent_unit_key);
        const updated = await this.novedadStockRepository.findById(row._id.toString());
        if (updated) reverted.push(this.serializeNovedadStockRow(updated));
        continue;
      }

      if (String(stock.card_state ?? '').toLowerCase() !== 'disponible') {
        failed.push({
          tracking_id: row._id.toString(),
          card_name: row.card_name,
          reason: `Stock en estado "${stock.card_state}"`,
        });
        continue;
      }

      const reserva = await this.reservaRepository.findByStockId(stockId);
      if (reserva) {
        failed.push({
          tracking_id: row._id.toString(),
          card_name: row.card_name,
          reason: 'Stock con reserva activa',
        });
        continue;
      }

      await this.stockRepository.deleteById(stockId);
      const updated = await this.novedadStockRepository.revertToPending(
        row._id.toString(),
      );
      await this.clearHomologUnitCostAfterUndo(row.session_id, row.sent_unit_key);
      if (updated) reverted.push(this.serializeNovedadStockRow(updated));
    }

    return {
      reverted: reverted.length,
      failed,
      items: reverted,
    };
  }

  async resolveNovedadStockCard(id: string) {
    const row = await this.novedadStockRepository.resolve(id);
    if (!row) throw new NotFoundException('Registro de novedad no encontrado');
    return { success: true, item: this.serializeNovedadStockRow(row) };
  }

  async applyManualNovedadTcgdexFixes(): Promise<{
    updated_stock: number;
    updated_novedad: number;
    items: Array<{
      stock_id: string;
      novedad_id: string;
      card_name: string;
      from_card_id: string;
      to_card_id: string;
    }>;
  }> {
    const manual = this.loadManualNovedadTcgdexMap();
    const rows = await this.novedadStockRepository.findByCardIdPrefix('ct-bp-');
    const items: Array<{
      stock_id: string;
      novedad_id: string;
      card_name: string;
      from_card_id: string;
      to_card_id: string;
    }> = [];

    for (const row of rows) {
      const bpId =
        row.blueprint_id > 0
          ? row.blueprint_id
          : this.blueprintIdFromCtCardId(row.card_id);
      const entry = bpId > 0 ? manual.get(bpId) : undefined;
      if (!entry) continue;

      const stockId = row.stock_id?.trim();
      if (!stockId) continue;

      const payload = {
        card_id: entry.card_id,
        card_name: entry.card_name || row.card_name,
        image_url: entry.image_url,
      };

      await this.stockRepository.updateById(stockId, payload);
      await this.novedadStockRepository.updateCardMeta(
        row._id.toString(),
        payload,
      );

      items.push({
        stock_id: stockId,
        novedad_id: row._id.toString(),
        card_name: payload.card_name,
        from_card_id: row.card_id,
        to_card_id: payload.card_id,
      });
    }

    return {
      updated_stock: items.length,
      updated_novedad: items.length,
      items,
    };
  }

  private blueprintIdFromCtCardId(cardId: string): number {
    const match = /^ct-bp-(\d+)$/.exec(String(cardId ?? '').trim());
    if (!match) return 0;
    const n = Number(match[1]);
    return Number.isInteger(n) && n > 0 ? n : 0;
  }

  private loadManualNovedadTcgdexMap(): Map<
    number,
    { card_id: string; card_name: string; image_url: string }
  > {
    const filePath = path.join(
      process.cwd(),
      'data',
      'novedad-manual-tcgdex.json',
    );
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(
        'Falta data/novedad-manual-tcgdex.json en el backend',
      );
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      by_blueprint_id?: Record<
        string,
        { card_id: string; card_name: string; image_url: string }
      >;
    };
    const map = new Map<
      number,
      { card_id: string; card_name: string; image_url: string }
    >();
    for (const [key, value] of Object.entries(raw.by_blueprint_id ?? {})) {
      const id = Number(key);
      if (!Number.isInteger(id) || id <= 0 || !value?.card_id?.trim()) continue;
      map.set(id, {
        card_id: value.card_id.trim(),
        card_name: value.card_name?.trim() ?? '',
        image_url: value.image_url?.trim() ?? '',
      });
    }
    return map;
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

    const orphanNovedad = units.filter(
      (u) => u.status === 'novedad' && !u.batch_item_id?.trim(),
    );
    if (orphanNovedad.length > 0) {
      const pendingStock = await this.novedadStockRepository.findPendingBySession(
        sessionId,
      );
      if (pendingStock.length > 0) {
        throw new BadRequestException(
          `Hay ${pendingStock.length} novedad(es) sin pasar a stock. Materializa el paso 1 antes de crear la tanda.`,
        );
      }
      const inStock = await this.novedadStockRepository.findInStockBySession(
        sessionId,
      );
      const inStockKeys = new Set(inStock.map((r) => r.sent_unit_key));
      const missing = orphanNovedad.filter(
        (u) => !inStockKeys.has(u.sent_unit_key),
      );
      if (missing.length > 0) {
        throw new BadRequestException(
          `Hay ${missing.length} novedad(es) sin inventario que aún no están en stock. Usa novedad → stock antes de crear la tanda.`,
        );
      }
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

  /** Deshace create-tanda: elimina la tanda en revisión y reactiva la sesión de homologación. */
  async revertConversion(sessionId: string) {
    const session = await this.requireSession(sessionId);
    if (session.status !== 'converted') {
      throw new BadRequestException('Solo se puede restaurar una sesión convertida');
    }

    const roundId = session.ship_round_id?.trim();
    if (!roundId) {
      throw new BadRequestException('La sesión no tiene tanda asociada');
    }

    const active = await this.sessionRepository.findActive();
    if (active && active._id.toString() !== sessionId) {
      throw new ConflictException(
        'Ya hay otra sesión de homologación activa. Cancélala antes de restaurar esta.',
      );
    }

    const round = await this.shipRoundRepository.findById(roundId);
    if (!round) {
      const restored = await this.sessionRepository.revertConverted(sessionId);
      if (!restored) {
        throw new NotFoundException('Sesión no encontrada al restaurar');
      }
      return {
        success: true,
        session: this.serializeSession(restored),
        panel_items: await this.loadPanelItems(restored),
        batches_summary: await this.loadBatchesSummary(),
        deleted_round_id: null,
        round_already_missing: true,
      };
    }
    if (round.status !== 'reviewing') {
      throw new BadRequestException(
        'La tanda ya fue finalizada; no se puede deshacer la conversión automáticamente',
      );
    }

    await this.shipRoundCardUnitRepository.deleteByRoundId(roundId);
    await this.shipRoundItemRepository.deleteByRoundId(roundId);
    const deletedRound = await this.shipRoundRepository.deleteById(roundId);
    if (!deletedRound) {
      throw new BadRequestException('No se pudo eliminar la tanda en revisión');
    }

    const restored = await this.sessionRepository.revertConverted(sessionId);
    if (!restored) {
      throw new NotFoundException('Sesión no encontrada al restaurar');
    }

    return {
      success: true,
      session: this.serializeSession(restored),
      panel_items: await this.loadPanelItems(restored),
      batches_summary: await this.loadBatchesSummary(),
      deleted_round_id: roundId,
    };
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

  private serializeNovedadStockRow(row: {
    _id: { toString(): string };
    session_id: string;
    sent_unit_key: string;
    stock_id?: string | null;
    card_name: string;
    card_id: string;
    expansion: string;
    language: string;
    blueprint_id: number;
    rareza?: string | null;
    order_code: string;
    purchase_price_fx?: number | null;
    price_currency: string;
    unit_cost_cop?: number | null;
    novedad_notes: string;
    image_url: string;
    status: string;
    created_at?: Date;
    stock_created_at?: Date | null;
    resolved_at?: Date | null;
  }) {
    return {
      id: row._id.toString(),
      session_id: row.session_id,
      sent_unit_key: row.sent_unit_key,
      stock_id: row.stock_id ?? null,
      card_name: row.card_name,
      card_id: row.card_id,
      expansion: row.expansion,
      language: row.language,
      blueprint_id: row.blueprint_id,
      rareza: row.rareza ?? null,
      order_code: row.order_code,
      purchase_price_fx: row.purchase_price_fx ?? null,
      price_currency: row.price_currency,
      unit_cost_cop: row.unit_cost_cop ?? null,
      novedad_notes: row.novedad_notes,
      image_url: row.image_url,
      status: row.status,
      created_at: row.created_at,
      stock_created_at: row.stock_created_at ?? null,
      resolved_at: row.resolved_at ?? null,
    };
  }

  private async upsertNovedadStockTracking(
    sessionId: string,
    unit: IncomingHomologUnit,
    notes: string,
  ) {
    const existing = await this.novedadStockRepository.findBySentUnitKey(
      unit.sent_unit_key,
    );
    if (existing?.status === 'in_stock' && existing.stock_id) {
      return existing;
    }

    const language =
      normalizeStockLanguage(unit.language) ?? unit.language ?? 'en';

    return this.novedadStockRepository.upsertBySentUnitKey(unit.sent_unit_key, {
      session_id: sessionId,
      sent_unit_key: unit.sent_unit_key,
      card_name: unit.name,
      card_id: existing?.card_id ?? '',
      expansion: unit.expansion ?? '',
      language,
      blueprint_id: unit.blueprint_id ?? 0,
      rareza: unit.rareza ?? null,
      order_code: unit.order_code ?? '',
      novedad_notes: notes,
      image_url: existing?.image_url ?? '',
      status: existing?.status === 'in_stock' ? 'in_stock' : 'pending',
      stock_id: existing?.stock_id ?? null,
    });
  }

  private async fetchBlueprintMeta(
    blueprintId: number,
  ): Promise<CtBlueprintLike | null> {
    if (blueprintId <= 0) return null;
    try {
      return (await this.cardTraderService.getBlueprintById(
        blueprintId,
      )) as CtBlueprintLike;
    } catch {
      return null;
    }
  }

  private async resolveNovedadCardMeta(
    unit: IncomingHomologUnit,
    ct: {
      collector_number?: string | null;
      expansion?: string;
      name?: string;
    } | null,
  ): Promise<{
    card_id: string;
    card_name: string;
    image_url: string;
    language: string;
    tcgdx_resolved: boolean;
    tcgdx_error: string | null;
  }> {
    const language =
      normalizeStockLanguage(unit.language) ?? 'en';
    const expansion = unit.expansion || ct?.expansion || '';
    const collectorNumber = ct?.collector_number ?? undefined;

    let resolved = this.tcgdexResolve.resolveTcgdexCardId(
      buildNovedadTcgdexResolveInput({
        expansionName: expansion || undefined,
        collectorNumber,
      }),
    );

    let blueprint: CtBlueprintLike | null = null;
    if (!resolved.tcgdex_card_id && unit.blueprint_id > 0) {
      blueprint = await this.fetchBlueprintMeta(unit.blueprint_id);
      resolved = this.tcgdexResolve.resolveTcgdexCardId(
        buildNovedadTcgdexResolveInput({
          expansionName: expansion || undefined,
          collectorNumber,
          blueprint,
        }),
      );
    }

    if (resolved.tcgdex_card_id) {
      const card = await this.tcgdexService.getCard(
        resolved.tcgdex_card_id,
        language,
      );
      return {
        card_id: resolved.tcgdex_card_id,
        card_name: card?.name ?? unit.name,
        image_url: card?.image ?? '',
        language,
        tcgdx_resolved: true,
        tcgdx_error: null,
      };
    }

    let imageBlueprint = blueprint;
    if (!imageBlueprint && unit.blueprint_id > 0) {
      imageBlueprint = await this.fetchBlueprintMeta(unit.blueprint_id);
    }
    const imageUrl = readBlueprintImageUrl(imageBlueprint);

    return {
      card_id:
        unit.blueprint_id > 0
          ? `ct-bp-${unit.blueprint_id}`
          : `novedad-${unit.sent_unit_key}`,
      card_name: unit.name,
      image_url: imageUrl,
      language,
      tcgdx_resolved: false,
      tcgdx_error: resolved.error,
    };
  }

  private parseTrmRates(body: {
    euro_to_cop: number;
    usd_to_cop: number;
  }): HomologTrmRates {
    const rates: HomologTrmRates = {
      euro_to_cop: body.euro_to_cop,
      usd_to_cop: body.usd_to_cop,
    };
    if (
      !Number.isFinite(rates.euro_to_cop) ||
      rates.euro_to_cop <= 0 ||
      !Number.isFinite(rates.usd_to_cop) ||
      rates.usd_to_cop <= 0
    ) {
      throw new BadRequestException('Tasas TRM inválidas');
    }
    return rates;
  }

  private async resolveMaterializeSession(sessionId?: string) {
    const session = sessionId
      ? await this.requireSession(sessionId)
      : await this.sessionRepository.findActive();
    if (!session) {
      throw new NotFoundException('No hay sesión de homologación');
    }
    return session;
  }

  private summarizeNovedadPreview(
    plan: Array<{ quantity: number; unit_cost_cop: number; errors: string[] }>,
  ) {
    const totalCards = plan.reduce((sum, item) => sum + item.quantity, 0);
    const totalCop = plan.reduce(
      (sum, item) => sum + item.unit_cost_cop * item.quantity,
      0,
    );
    const errorCount = plan.filter((item) => item.errors.length > 0).length;
    return {
      total_cards: totalCards,
      total_cop: totalCop,
      error_count: errorCount,
      ok_count: plan.length - errorCount,
    };
  }

  private buildNovedadPreviewErrors(args: {
    homologUnit: IncomingHomologUnit | undefined;
    purchaseFx: number | null;
    unitCostCop: number;
    cardMeta: {
      card_id: string;
      tcgdx_resolved: boolean;
      tcgdx_error: string | null;
      image_url: string;
    };
    ct: { collector_number?: string | null } | null;
  }): string[] {
    const errors: string[] = [];
    if (!args.homologUnit) {
      errors.push('Unidad no encontrada en la sesión de homologación');
      return errors;
    }
    if (args.purchaseFx == null || args.purchaseFx <= 0) {
      errors.push('Sin precio CardTrader (se usará $1 COP)');
    }
    if (!args.cardMeta.tcgdx_resolved) {
      errors.push(
        args.cardMeta.tcgdx_error ??
          'ID TCGdex no resuelto (se usará ID temporal)',
      );
    }
    if (args.cardMeta.card_id.startsWith('novedad-')) {
      errors.push('No se pudo identificar la carta en catálogo');
    }
    if (!args.ct?.collector_number?.trim()) {
      errors.push('Sin collector number en CardTrader');
    }
    if (!args.cardMeta.image_url.trim()) {
      errors.push('Sin imagen de carta');
    }
    return errors;
  }

  private async buildNovedadMaterializePlan(
    sessionId: string,
    rates: HomologTrmRates,
    session: { units?: IncomingHomologUnit[] },
  ) {
    await this.syncNovedadStockFromSession(sessionId);

    const pending = await this.novedadStockRepository.findPendingBySession(sessionId);
    if (pending.length === 0) return [];

    const unitKeys = pending.map((p) => p.sent_unit_key);
    const catalog = await this.sentUnitRepository.findByUnitKeys(unitKeys);
    const catalogByKey = new Map(catalog.map((c) => [c.unit_key, c]));

    const sessionUnits = await this.enrichSessionUnits(session);
    const unitByKey = new Map(sessionUnits.map((u) => [u.sent_unit_key, u]));

    const plan: Array<{
      tracking_id: string;
      sent_unit_key: string;
      card_name: string;
      card_id: string;
      language: string;
      image_url: string;
      expansion: string;
      quantity: number;
      purchase_price_fx: number | null;
      price_currency: string;
      unit_cost_cop: number;
      novedad_notes: string;
      errors: string[];
    }> = [];

    for (const row of pending) {
      const homologUnit = unitByKey.get(row.sent_unit_key);
      const ct = catalogByKey.get(row.sent_unit_key) ?? null;

      const purchaseFx = homologUnit
        ? fxUnitPriceFromSentUnit({
            ...homologUnit,
            unit_price_fx:
              homologUnit.unit_price_fx ??
              (ct?.unit_price_raw != null && ct.unit_price_raw > 0
                ? ct.unit_price_raw
                : null),
            unit_price_eur:
              homologUnit.unit_price_eur ?? ct?.unit_price_eur ?? null,
            price_currency:
              homologUnit.price_currency ?? ct?.price_currency ?? 'USD',
          })
        : null;

      const priceCurrency = normalizeCardsCostCurrency(
        homologUnit?.price_currency ?? ct?.price_currency ?? 'USD',
      );

      const unitCostCop = homologUnit
        ? resolveHomologNovedadUnitCostCop(homologUnit, rates, ct)
        : FALLBACK_NOVEDAD_UNIT_COST_COP;

      const cardMeta = homologUnit
        ? await this.resolveNovedadCardMeta(homologUnit, ct)
        : {
            card_id: '',
            card_name: row.card_name,
            image_url: '',
            language: row.language || 'en',
            tcgdx_resolved: false,
            tcgdx_error: 'Unidad no encontrada',
          };

      const errors = this.buildNovedadPreviewErrors({
        homologUnit,
        purchaseFx,
        unitCostCop,
        cardMeta,
        ct,
      });

      plan.push({
        tracking_id: row._id.toString(),
        sent_unit_key: row.sent_unit_key,
        card_name: cardMeta.card_name,
        card_id: cardMeta.card_id,
        language: cardMeta.language,
        image_url: cardMeta.image_url,
        expansion: homologUnit?.expansion ?? row.expansion ?? '',
        quantity: 1,
        purchase_price_fx: purchaseFx,
        price_currency: priceCurrency,
        unit_cost_cop: unitCostCop,
        novedad_notes: row.novedad_notes || homologUnit?.novedad_notes || '',
        errors,
      });
    }

    return plan;
  }

  private async clearHomologUnitCostAfterUndo(
    sessionId: string,
    sentUnitKey: string,
  ) {
    try {
      await this.persistUnitPatch(sessionId, sentUnitKey, {
        unit_cost_cop: null,
        purchase_price_fx: null,
        purchase_price_currency: null,
        purchase_price_eur: null,
      });
    } catch {
      // La sesión puede estar convertida; el stock ya se revirtió.
    }
  }
}
