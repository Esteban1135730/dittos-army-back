import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { isQuantityKind } from 'src/constants/bulk-product';
import {
  type OwnerKey,
  isOwnerKey,
} from 'src/config/owners.config';
import { getCurrentOwner, runWithOwnerAsync } from 'src/owner/owner-context';
import { MobilePendingSaleRepository } from 'src/repository/mobile-pending-sale.repository';
import { StockRepository } from 'src/repository/stock.repository';
import type {
  MobilePendingSaleDocument,
  MobilePendingStatus,
} from 'src/schema/mobile-pending-sale.schema';
import type { Stock } from 'src/schema/stock.schema';
import { SaleBatchService } from './sale-batch.service';

const OWNER_KEYS: OwnerKey[] = ['pablo', 'esteban'];
const STATUSES: MobilePendingStatus[] = [
  'pending',
  'accepted',
  'rejected',
  'conflict',
];

export type CreateMobilePendingDto = {
  stock_id: string;
  amount_cop: number;
  notes?: string;
  client_sale_id: string;
  card_name?: string;
  image_url?: string;
  card_id?: string;
};

export type MobilePendingSaleView = {
  _id: string;
  status: MobilePendingStatus;
  stock_id: string;
  stock_owner: OwnerKey;
  amount_cop: number;
  notes?: string;
  card_name?: string;
  image_url?: string;
  card_id?: string;
  client_sale_id: string;
  created_at: Date;
  resolved_at?: Date;
  conflict_reason?: string;
  sale_id?: string;
};

export type AcceptMobilePendingResult = {
  pending: MobilePendingSaleView;
  sale?: {
    success: boolean;
    sale_id?: string;
    stock_id: string;
    owner: OwnerKey;
  };
};

function toView(doc: MobilePendingSaleDocument): MobilePendingSaleView {
  return {
    _id: String(doc._id),
    status: doc.status,
    stock_id: doc.stock_id,
    stock_owner: isOwnerKey(doc.stock_owner) ? doc.stock_owner : 'pablo',
    amount_cop: doc.amount_cop,
    notes: doc.notes,
    card_name: doc.card_name,
    image_url: doc.image_url,
    card_id: doc.card_id,
    client_sale_id: doc.client_sale_id,
    created_at: doc.created_at,
    resolved_at: doc.resolved_at,
    conflict_reason: doc.conflict_reason,
    sale_id: doc.sale_id,
  };
}

function isVendible(stock: Stock): { ok: true } | { ok: false; reason: string } {
  const cardState = (stock as { card_state?: string }).card_state ?? '';
  const productKind = (stock as { product_kind?: string }).product_kind;
  const isQty = isQuantityKind(productKind);

  if (!isQty && cardState === 'vendida') {
    return { ok: false, reason: 'La carta ya está vendida' };
  }
  if (cardState === 'propiedad') {
    return { ok: false, reason: 'La carta está en propiedad' };
  }
  if (
    cardState !== 'disponible' &&
    cardState !== 'en_stock_colombia' &&
    cardState !== 'reserva'
  ) {
    return { ok: false, reason: 'Estado de stock no vendible' };
  }
  if (isQty) {
    const qty =
      typeof (stock as { quantity?: number }).quantity === 'number'
        ? (stock as { quantity: number }).quantity
        : 0;
    if (qty < 1) {
      return { ok: false, reason: 'Stock insuficiente' };
    }
  }
  return { ok: true };
}

@Injectable()
export class MobilePendingSaleService {
  constructor(
    private readonly pendingRepository: MobilePendingSaleRepository,
    private readonly stockRepository: StockRepository,
    private readonly saleBatchService: SaleBatchService,
  ) {}

  private async locateStock(
    stockId: string,
  ): Promise<{ stock: Stock; owner: OwnerKey } | null> {
    const current = getCurrentOwner();
    const order: OwnerKey[] =
      current === 'pablo' ? ['pablo', 'esteban'] : ['esteban', 'pablo'];
    for (const owner of order) {
      const stock = await runWithOwnerAsync(owner, () =>
        this.stockRepository.findById(stockId),
      );
      if (stock) return { stock, owner };
    }
    return null;
  }

  private async findByClientSaleIdAnywhere(
    clientSaleId: string,
  ): Promise<MobilePendingSaleDocument | null> {
    for (const owner of OWNER_KEYS) {
      const found = await runWithOwnerAsync(owner, () =>
        this.pendingRepository.findByClientSaleId(clientSaleId),
      );
      if (found) return found;
    }
    return null;
  }

  async create(dto: CreateMobilePendingDto): Promise<MobilePendingSaleView> {
    const stockId = String(dto.stock_id ?? '').trim();
    const clientSaleId = String(dto.client_sale_id ?? '').trim();
    const amount = Number(dto.amount_cop);

    if (!stockId || !isValidObjectId(stockId)) {
      throw new BadRequestException('stock_id inválido');
    }
    if (!clientSaleId) {
      throw new BadRequestException('client_sale_id es requerido');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount_cop debe ser mayor a 0');
    }

    const existing = await this.findByClientSaleIdAnywhere(clientSaleId);
    if (existing) {
      return toView(existing);
    }

    const located = await this.locateStock(stockId);
    if (!located) {
      throw new ConflictException('Stock no encontrado o no vendible');
    }
    const vendible = isVendible(located.stock);
    if (!vendible.ok) {
      throw new ConflictException(vendible.reason);
    }

    const duplicate = await runWithOwnerAsync(located.owner, () =>
      this.pendingRepository.findOpenPendingByStockId(stockId),
    );
    if (duplicate) {
      throw new ConflictException(
        'Ya hay una venta pendiente para este stock',
      );
    }

    const notes = dto.notes?.trim() || undefined;
    try {
      const created = await runWithOwnerAsync(located.owner, () =>
        this.pendingRepository.create({
          stock_id: stockId,
          stock_owner: located.owner,
          amount_cop: Math.round(amount),
          notes,
          client_sale_id: clientSaleId,
          card_name: dto.card_name?.trim() || located.stock.card_name || undefined,
          image_url: dto.image_url?.trim() || located.stock.image_url || undefined,
          card_id: dto.card_id?.trim() || located.stock.card_id || undefined,
        }),
      );
      return toView(created);
    } catch (err) {
      const replay = await this.findByClientSaleIdAnywhere(clientSaleId);
      if (replay) return toView(replay);
      if (isDuplicateKey(err)) {
        throw new ConflictException(
          'Ya hay una venta pendiente para este stock',
        );
      }
      throw err;
    }
  }

  async list(query: {
    status?: string;
    ids?: string;
    client_sale_id?: string;
  }): Promise<MobilePendingSaleView[]> {
    const statuses = parseStatuses(query.status);
    const ids = parseCsv(query.ids).filter((id) => isValidObjectId(id));
    const clientSaleId = query.client_sale_id?.trim() || undefined;

    const searchBoth = Boolean(clientSaleId) || ids.length > 0;
    const owners: OwnerKey[] = searchBoth ? OWNER_KEYS : [getCurrentOwner()];

    const rows: MobilePendingSaleView[] = [];
    const seen = new Set<string>();
    for (const owner of owners) {
      const docs = await runWithOwnerAsync(owner, () =>
        this.pendingRepository.list({
          statuses,
          ids: ids.length > 0 ? ids : undefined,
          client_sale_id: clientSaleId,
        }),
      );
      for (const doc of docs) {
        const id = String(doc._id);
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push(toView(doc));
      }
    }
    rows.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return rows;
  }

  async accept(id: string): Promise<AcceptMobilePendingResult> {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('id inválido');
    }
    const sessionOwner = getCurrentOwner();
    const doc = await this.pendingRepository.findById(id);
    if (!doc || doc.stock_owner !== sessionOwner) {
      throw new NotFoundException('Pendiente no encontrada');
    }

    if (doc.status === 'accepted' && doc.sale_id) {
      return {
        pending: toView(doc),
        sale: {
          success: true,
          sale_id: doc.sale_id,
          stock_id: doc.stock_id,
          owner: doc.stock_owner,
        },
      };
    }
    if (doc.status === 'rejected') {
      throw new ConflictException('La pendiente ya fue rechazada');
    }

    const result = await runWithOwnerAsync(doc.stock_owner, () =>
      this.saleBatchService.sellOneItem(
        {
          stock_id: doc.stock_id,
          amount_cop: doc.amount_cop,
          notes: doc.notes ?? 'Venta desde móvil',
        },
        doc.stock_owner,
        new Map(),
      ),
    );

    if (!result.success) {
      doc.status = 'conflict';
      doc.conflict_reason = result.message ?? 'Stock ya no vendible';
      doc.resolved_at = new Date();
      await this.pendingRepository.save(doc);
      throw new ConflictException({
        message: doc.conflict_reason,
        conflict_reason: doc.conflict_reason,
        pending: toView(doc),
      });
    }

    doc.status = 'accepted';
    doc.sale_id = result.sale_id;
    doc.conflict_reason = undefined;
    doc.resolved_at = new Date();
    await this.pendingRepository.save(doc);
    return {
      pending: toView(doc),
      sale: {
        success: true,
        sale_id: result.sale_id,
        stock_id: result.stock_id,
        owner: result.owner,
      },
    };
  }

  async reject(id: string): Promise<MobilePendingSaleView> {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('id inválido');
    }
    const sessionOwner = getCurrentOwner();
    const doc = await this.pendingRepository.findById(id);
    if (!doc || doc.stock_owner !== sessionOwner) {
      throw new NotFoundException('Pendiente no encontrada');
    }
    if (doc.status === 'accepted') {
      throw new ConflictException('La pendiente ya fue aceptada');
    }
    if (doc.status === 'rejected') {
      return toView(doc);
    }
    doc.status = 'rejected';
    doc.resolved_at = new Date();
    await this.pendingRepository.save(doc);
    return toView(doc);
  }
}

function parseCsv(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseStatuses(raw?: string): MobilePendingStatus[] | undefined {
  if (!raw?.trim()) return undefined;
  const parsed = parseCsv(raw).filter((s): s is MobilePendingStatus =>
    STATUSES.includes(s as MobilePendingStatus),
  );
  return parsed.length > 0 ? parsed : undefined;
}

function isDuplicateKey(err: unknown): boolean {
  const code = (err as { code?: number })?.code;
  if (code === 11000) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('E11000') || msg.toLowerCase().includes('duplicate');
}
