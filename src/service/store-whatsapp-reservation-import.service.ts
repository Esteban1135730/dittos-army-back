import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientRepository } from '../repository/client.repository';
import { PvpRepository } from '../repository/pvp.repository';
import { ReservaRepository } from '../repository/reserva.repository';
import { StockRepository } from '../repository/stock.repository';
import { PedidoService } from './pedido.service';
import { Stock } from '../schema/stock.schema';

type StockRow = Stock & { _id: unknown };
import { precioToCop } from '../utils/precio-to-cop';
import {
  effectiveOperationalRarezaFromStock,
  groupPvpsByCardId,
  resolvePvpForLine,
} from '../utils/pvp-resolve';
import { stockLineLanguage } from '../utils/store-language-labels';
import {
  extractClientNameFromStoreMessage,
  extractStoreDeliveryFromMessage,
  parseStoreCatalogCartLines,
} from '../utils/store-whatsapp-message-parser';
import { getTiendaEntrega } from '../utils/tiendas-entrega';
import { otherOwner, type OwnerKey } from '../config/owners.config';
import { getCurrentOwner } from '../owner/owner-context';
import { reservaMatchesStockOwner, withStockOwner } from '../owner/stock-owner';
import type { Reserva } from '../schema/reserva.schema';

const BLOCKED_STOCK_STATES = new Set(['reserva', 'vendida', 'propiedad']);

export type ImportLineAssignment = {
  stock_id: string;
  stock_owner: OwnerKey;
  precio_cop: number;
};

export type ImportWhatsAppLineResult = {
  index: number;
  raw: string;
  parsed?: {
    card_id: string;
    language: string;
    rareza: string | null;
    quantity: number;
    unit_price_cop: number | null;
    card_name: string | null;
  };
  requested: number;
  matched: number;
  stock_ids: string[];
  stock_owners: OwnerKey[];
  precio_cop_por_unidad: number[];
  suggested_pvp_cop: number | null;
  card_name?: string;
  image_url?: string | null;
  issues: string[];
};

export type ImportWhatsAppPedidoAction =
  | 'create'
  | 'reuse_reservado'
  | 'reservas_only'
  | 'blocked_pagado';

export type ImportWhatsAppDelivery = {
  store_id: string | null;
  store_name: string | null;
  fecha_tentativa_entrega: string | null;
  pedido_action: ImportWhatsAppPedidoAction;
  existing_pedido_id: string | null;
  issues: string[];
};

export type ImportWhatsAppPlan = {
  client_id: string;
  client_name_from_message: string | null;
  lines: ImportWhatsAppLineResult[];
  summary: {
    lines_ok: number;
    lines_partial: number;
    lines_failed: number;
    units_reserved: number;
  };
  delivery: ImportWhatsAppDelivery;
};

export type ImportWhatsAppCreated = {
  stock_id: string;
  reserva_id: string;
  precio: number;
  currency: string;
  stock_owner: OwnerKey;
};

export type StoreWhatsAppLineOverride = {
  index: number;
  pvp_cop?: number | null;
};

function cardNameFromRaw(raw: string): string | null {
  const m = raw.match(/^-\s*(.+?)\s*\|\s*ID:/i);
  return m ? m[1].trim() : null;
}

function resolveLinePrecioCop(
  overridePvp: number | null | undefined,
  messagePvp: number | null | undefined,
  dbPvpCop: number,
): number {
  if (
    typeof overridePvp === 'number' &&
    Number.isFinite(overridePvp) &&
    overridePvp > 0
  ) {
    return Math.round(overridePvp);
  }
  if (
    typeof messagePvp === 'number' &&
    Number.isFinite(messagePvp) &&
    messagePvp > 0
  ) {
    return Math.round(messagePvp);
  }
  if (dbPvpCop > 0) return dbPvpCop;
  return 0;
}

@Injectable()
export class StoreWhatsAppReservationImportService {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly stockRepository: StockRepository,
    private readonly reservaRepository: ReservaRepository,
    private readonly pvpRepository: PvpRepository,
    private readonly pedidoService: PedidoService,
  ) {}

  async preview(
    clientId: string,
    message: string,
  ): Promise<ImportWhatsAppPlan> {
    await this.ensureClient(clientId);
    return this.buildPlan(clientId, message);
  }

  async import(
    clientId: string,
    message: string,
    overrides: StoreWhatsAppLineOverride[] = [],
  ): Promise<
    ImportWhatsAppPlan & {
      created: ImportWhatsAppCreated[];
      skipped: {
        line_index: number;
        reason: string;
        requested: number;
        matched: number;
      }[];
      pvp_saved: number;
    }
  > {
    await this.ensureClient(clientId);
    const overrideMap = new Map(overrides.map((o) => [o.index, o]));
    const plan = await this.buildPlan(clientId, message, overrideMap);
    const pedidoId = await this.resolvePedidoIdForImport(
      clientId,
      plan.delivery,
    );
    const created: ImportWhatsAppCreated[] = [];
    const skipped: {
      line_index: number;
      reason: string;
      requested: number;
      matched: number;
    }[] = [];
    let pvpSaved = 0;

    for (const line of plan.lines) {
      let lineCreated = 0;
      const overridePvp = overrideMap.get(line.index)?.pvp_cop;
      for (let i = 0; i < line.stock_ids.length; i++) {
        const stockId = line.stock_ids[i];
        const stockOwner = line.stock_owners[i] ?? getCurrentOwner();
        const precioCop = resolveLinePrecioCop(
          overridePvp,
          line.parsed?.unit_price_cop,
          line.precio_cop_por_unidad[lineCreated] ??
            line.precio_cop_por_unidad[0] ??
            0,
        );
        if (precioCop <= 0) continue;

        const stock = await withStockOwner(stockOwner, () =>
          this.stockRepository.findById(stockId),
        );
        if (!stock || !this.isStockReservable(stock)) {
          continue;
        }
        const existing = this.pickReservaForOwner(
          await this.reservaRepository.findAllByStockId(stockId),
          stockOwner,
        );
        if (existing) continue;

        const reserva = await this.reservaRepository.create({
          client_id: clientId,
          stock_id: stockId,
          precio: precioCop,
          currency: 'COP',
          ...(pedidoId ? { pedido_id: pedidoId } : {}),
          stock_owner: stockOwner,
        });
        await withStockOwner(stockOwner, () =>
          this.stockRepository.updateCardState(stockId, 'reserva'),
        );
        created.push({
          stock_id: stockId,
          reserva_id: String((reserva as { _id?: unknown })._id ?? ''),
          precio: precioCop,
          currency: 'COP',
          stock_owner: stockOwner,
        });
        lineCreated += 1;
      }

      if (
        typeof overridePvp === 'number' &&
        Number.isFinite(overridePvp) &&
        overridePvp > 0 &&
        line.parsed
      ) {
        await this.pvpRepository.update({
          card_id: line.parsed.card_id,
          pvp: Math.round(overridePvp),
          currency: 'COP',
          rareza: line.parsed.rareza,
        });
        pvpSaved += 1;
      }

      if (line.matched > 0 && lineCreated < line.matched) {
        skipped.push({
          line_index: line.index,
          reason:
            lineCreated === 0 && line.issues.includes('no_pvp')
              ? 'no_pvp'
              : 'race_or_unavailable',
          requested: line.requested,
          matched: lineCreated,
        });
      } else if (line.matched < line.requested) {
        skipped.push({
          line_index: line.index,
          reason: line.issues.includes('no_pvp')
            ? 'no_pvp'
            : 'insufficient_stock',
          requested: line.requested,
          matched: line.matched,
        });
      } else if (line.matched === 0 && line.issues.length > 0) {
        skipped.push({
          line_index: line.index,
          reason: line.issues[0],
          requested: line.requested,
          matched: 0,
        });
      }
    }

    return { ...plan, created, skipped, pvp_saved: pvpSaved };
  }

  private async ensureClient(clientId: string): Promise<void> {
    const id = clientId?.trim();
    if (!id) throw new BadRequestException('client_id es requerido');
    const client = await this.clientRepository.findById(id);
    if (!client) throw new NotFoundException('Cliente no encontrado');
  }

  private async buildPlan(
    clientId: string,
    message: string,
    overrides?: Map<number, StoreWhatsAppLineOverride>,
  ): Promise<ImportWhatsAppPlan> {
    const text = message?.trim();
    if (!text) throw new BadRequestException('message es requerido');

    const parsedLines = parseStoreCatalogCartLines(text);
    if (parsedLines.length === 0) {
      throw new BadRequestException(
        'No se encontraron líneas de carta en el mensaje',
      );
    }

    const cardIds = [
      ...new Set(
        parsedLines
          .filter((l) => l.result.ok)
          .map((l) => (l.result.ok ? l.result.parsed.card_id : '')),
      ),
    ].filter(Boolean);

    const requestOwner = getCurrentOwner();
    const secondaryOwner = otherOwner(requestOwner);
    const requestReservas = await this.reservaRepository.findAll();
    const emptyOtherPool: OwnerMatchPool = {
      owner: requestOwner,
      allStock: [],
      available: [],
      pvpByCard: new Map(),
    };
    const [currentPool, otherPool] = await Promise.all([
      this.loadOwnerMatchPool(requestOwner, cardIds, requestReservas),
      secondaryOwner
        ? this.loadOwnerMatchPool(secondaryOwner, cardIds, requestReservas)
        : Promise.resolve(emptyOtherPool),
    ]);

    const imageByCardId = new Map<string, string>();
    const nameByCardId = new Map<string, string>();
    for (const s of [...currentPool.allStock, ...otherPool.allStock]) {
      const cid = String(s.card_id ?? '').trim();
      if (!cid) continue;
      const url = String(s.image_url ?? '').trim();
      if (url && !imageByCardId.has(cid)) imageByCardId.set(cid, url);
      const name = String(s.card_name ?? '').trim();
      if (name && !nameByCardId.has(cid)) nameByCardId.set(cid, name);
    }

    const lines: ImportWhatsAppLineResult[] = [];
    let linesOk = 0;
    let linesPartial = 0;
    let linesFailed = 0;
    let unitsReserved = 0;

    const usedStockKeys = new Set<string>();

    parsedLines.forEach((entry, index) => {
      if (!entry.result.ok) {
        const issue = entry.result.issue;
        lines.push({
          index,
          raw: entry.raw,
          requested: 0,
          matched: 0,
          stock_ids: [],
          stock_owners: [],
          precio_cop_por_unidad: [],
          suggested_pvp_cop: null,
          issues: [issue],
        });
        linesFailed += 1;
        return;
      }

      const { parsed } = entry.result;
      const overridePvp = overrides?.get(index)?.pvp_cop;
      const assignments = this.matchLine(
        parsed,
        currentPool,
        otherPool,
        usedStockKeys,
        overridePvp,
      );
      const issues: string[] = [];
      const matched = assignments.length;
      const requested = parsed.quantity;

      if (matched < requested) {
        issues.push('insufficient_stock');
      }
      if (assignments.some((a) => a.precio_cop <= 0)) {
        issues.push('no_pvp');
      }

      const stock_ids = assignments.map((a) => a.stock_id);
      const stock_owners = assignments.map((a) => a.stock_owner);
      const precio_cop_por_unidad = assignments.map((a) => a.precio_cop);
      for (const a of assignments) {
        usedStockKeys.add(`${a.stock_owner}:${a.stock_id}`);
      }

      const suggested =
        resolveLinePrecioCop(
          overridePvp,
          parsed.unit_price_cop,
          precio_cop_por_unidad.find((p) => p > 0) ?? 0,
        ) || null;

      unitsReserved += matched;

      if (matched === requested && requested > 0) linesOk += 1;
      else if (matched > 0) linesPartial += 1;
      else linesFailed += 1;

      const cardName =
        cardNameFromRaw(entry.raw) ?? nameByCardId.get(parsed.card_id) ?? null;
      const image_url = imageByCardId.get(parsed.card_id) ?? null;

      lines.push({
        index,
        raw: entry.raw,
        parsed: {
          ...parsed,
          card_name: cardName,
        },
        requested,
        matched,
        stock_ids,
        stock_owners,
        precio_cop_por_unidad,
        suggested_pvp_cop:
          suggested != null && suggested > 0 ? suggested : null,
        card_name: cardName ?? parsed.card_id,
        image_url,
        issues,
      });
    });

    return {
      client_id: clientId,
      client_name_from_message: extractClientNameFromStoreMessage(text),
      lines,
      summary: {
        lines_ok: linesOk,
        lines_partial: linesPartial,
        lines_failed: linesFailed,
        units_reserved: unitsReserved,
      },
      delivery: await this.resolveDelivery(clientId, text),
    };
  }

  private async resolveDelivery(
    clientId: string,
    message: string,
  ): Promise<ImportWhatsAppDelivery> {
    const extracted = extractStoreDeliveryFromMessage(message);
    const store = extracted.store_id
      ? getTiendaEntrega(extracted.store_id)
      : undefined;

    const store_id = extracted.store_id;
    const store_name = store?.name ?? null;
    const fecha_tentativa_entrega = extracted.fecha_tentativa_entrega;
    const issues = [...extracted.issues];

    const reservado =
      await this.pedidoService.findReservadoByClientId(clientId);
    if (reservado) {
      return {
        store_id,
        store_name,
        fecha_tentativa_entrega,
        pedido_action: 'reuse_reservado',
        existing_pedido_id: String(reservado._id),
        issues,
      };
    }

    const open = await this.pedidoService.findOpenByClientId(clientId);
    if (open?.status === 'pagado') {
      return {
        store_id,
        store_name,
        fecha_tentativa_entrega,
        pedido_action: 'blocked_pagado',
        existing_pedido_id: String(open._id),
        issues,
      };
    }

    if (store_id && fecha_tentativa_entrega) {
      return {
        store_id,
        store_name,
        fecha_tentativa_entrega,
        pedido_action: 'create',
        existing_pedido_id: null,
        issues,
      };
    }

    return {
      store_id,
      store_name,
      fecha_tentativa_entrega,
      pedido_action: 'reservas_only',
      existing_pedido_id: null,
      issues,
    };
  }

  private async resolvePedidoIdForImport(
    clientId: string,
    delivery: ImportWhatsAppDelivery,
  ): Promise<string | undefined> {
    if (delivery.pedido_action === 'blocked_pagado') {
      throw new ConflictException(
        'Hay un pedido pagado abierto; no se puede importar por esta vía. Entregalo o gestiona el ciclo en la ficha del cliente.',
      );
    }

    if (delivery.pedido_action === 'create') {
      const created = await this.pedidoService.create({
        client_id: clientId,
        entrega_en_tienda: true,
        store_id: delivery.store_id ?? undefined,
        fecha_tentativa_entrega: delivery.fecha_tentativa_entrega ?? '',
      });
      return created.id;
    }

    if (delivery.pedido_action === 'reuse_reservado') {
      const pedido = await this.pedidoService.requireReservadoPedido(clientId);
      return String(pedido._id);
    }

    return undefined;
  }

  private matchLine(
    parsed: {
      card_id: string;
      language: string;
      rareza: string | null;
      quantity: number;
      unit_price_cop: number | null;
    },
    currentPool: OwnerMatchPool,
    otherPool: OwnerMatchPool,
    usedStockKeys: Set<string>,
    overridePvp?: number | null,
  ): ImportLineAssignment[] {
    const out: ImportLineAssignment[] = [];
    const takeFrom = (pool: OwnerMatchPool) => {
      for (const stock of pool.available) {
        if (out.length >= parsed.quantity) break;
        const id = this.stockId(stock);
        const key = `${pool.owner}:${id}`;
        if (usedStockKeys.has(key)) continue;
        if (!this.stockMatchesParsed(stock, parsed)) continue;
        usedStockKeys.add(key);
        out.push({
          stock_id: id,
          stock_owner: pool.owner,
          precio_cop: this.precioForStock(stock, parsed, pool, overridePvp),
        });
      }
    };
    takeFrom(currentPool);
    takeFrom(otherPool);
    return out;
  }

  private stockMatchesParsed(
    stock: StockRow,
    parsed: { card_id: string; language: string; rareza: string | null },
  ): boolean {
    if (stock.card_id !== parsed.card_id) return false;
    if (stockLineLanguage(stock) !== parsed.language) return false;
    return parsed.rareza === effectiveOperationalRarezaFromStock(stock);
  }

  private precioForStock(
    stock: StockRow,
    parsed: { card_id: string; unit_price_cop: number | null },
    pool: OwnerMatchPool,
    overridePvp?: number | null,
  ): number {
    const lineRareza = effectiveOperationalRarezaFromStock(stock);
    const pvps = pool.pvpByCard.get(parsed.card_id) ?? [];
    const pvpData = resolvePvpForLine(pvps, lineRareza);
    const dbCop =
      pvpData && pvpData.pvp > 0
        ? precioToCop(pvpData.pvp, pvpData.pvp_currency || 'COP')
        : 0;
    return resolveLinePrecioCop(overridePvp, parsed.unit_price_cop, dbCop);
  }

  private async loadOwnerMatchPool(
    owner: OwnerKey,
    cardIds: string[],
    requestReservas: Reserva[],
  ): Promise<OwnerMatchPool> {
    const requestOwner = getCurrentOwner();
    return withStockOwner(owner, async () => {
      const [allStock, ownerReservas] = await Promise.all([
        this.stockRepository.findAll(),
        this.reservaRepository.findAll(),
      ]);
      const reservedStockIds = new Set<string>();
      for (const r of ownerReservas) {
        if (reservaMatchesStockOwner(r, owner, owner)) {
          reservedStockIds.add(r.stock_id);
        }
      }
      for (const r of requestReservas) {
        if (reservaMatchesStockOwner(r, owner, requestOwner)) {
          reservedStockIds.add(r.stock_id);
        }
      }
      const available = (allStock as StockRow[])
        .filter(
          (s) =>
            this.isStockReservable(s) && !reservedStockIds.has(this.stockId(s)),
        )
        .sort((a, b) => this.stockId(a).localeCompare(this.stockId(b)));
      const pvps = cardIds.length
        ? await this.pvpRepository.findByCardIds(cardIds)
        : [];
      return {
        owner,
        allStock: allStock as StockRow[],
        available,
        pvpByCard: groupPvpsByCardId(pvps),
      };
    });
  }

  private pickReservaForOwner(
    reservas: Reserva[],
    stockOwner: OwnerKey,
  ): Reserva | undefined {
    return reservas.find((r) => reservaMatchesStockOwner(r, stockOwner));
  }

  private stockId(stock: StockRow): string {
    return String(stock._id);
  }

  private isStockReservable(stock: Stock): boolean {
    const state = (stock.card_state ?? '').toString().toLowerCase();
    return !BLOCKED_STOCK_STATES.has(state);
  }
}

type OwnerMatchPool = {
  owner: OwnerKey;
  allStock: StockRow[];
  available: StockRow[];
  pvpByCard: Map<
    string,
    {
      card_id: string;
      rareza?: string | null;
      pvp: number;
      currency: string;
    }[]
  >;
};
