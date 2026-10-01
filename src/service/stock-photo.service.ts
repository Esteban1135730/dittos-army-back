import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { isValidObjectId } from 'mongoose';
import { effectiveProductKind } from '../constants/bulk-product';
import { getCurrentOwner } from '../owner/owner-context';
import { StockRepository } from '../repository/stock.repository';
import { SELLABLE_STOCK_STATES } from '../utils/stock-sellable';
import {
  isStockPhotoPublicPath,
  resolveStockPhotosRoot,
  sanitizeStockPhotoSegment,
  stockPhotoPublicPath,
  stockPhotoRelativePath,
} from '../utils/stock-photo-path';
export type StockMissingPhotoRow = {
  _id: string;
  card_id: string;
  card_name: string;
  image_url: string;
  language?: string;
  rareza?: string | null;
  card_state: string;
  pvp?: number;
  pvp_currency?: string;
  has_inventory_photo: boolean;
};

@Injectable()
export class StockPhotoService {
  constructor(private readonly stockRepository: StockRepository) {}

  getPhotosRoot(): string {
    return resolveStockPhotosRoot();
  }

  ensurePhotosRoot(): string {
    const root = this.getPhotosRoot();
    mkdirSync(root, { recursive: true });
    return root;
  }

  getPublicBaseUrl(): string {
    const fromEnv = process.env.STOCK_PHOTOS_PUBLIC_BASE?.trim();
    if (fromEnv) return fromEnv.replace(/\/+$/, '');
    const port = process.env.PORT ?? '3000';
    return `http://localhost:${port}/stock-photos`;
  }

  photoFileExists(owner: string, cardId: string, stockId: string): boolean {
    const relative = stockPhotoRelativePath(owner, cardId, stockId);
    const full = join(this.getPhotosRoot(), ...relative.split('/'));
    if (!existsSync(full)) return false;
    try {
      return readFileSync(full).length > 0;
    } catch {
      return false;
    }
  }

  hasInventoryPhoto(owner: string, cardId: string, stockId: string): boolean {
    return this.photoFileExists(owner, cardId, stockId);
  }

  inventoryPhotoPublicPath(
    owner: string,
    cardId: string,
    stockId: string,
  ): string {
    return stockPhotoPublicPath(owner, cardId, stockId);
  }

  async listInventoryPhotoIndex(): Promise<Record<string, string>> {
    const owner = getCurrentOwner();
    const items = await this.stockRepository.findAll();
    const index: Record<string, string> = {};

    for (const stock of items) {
      const raw = stock as unknown as Record<string, unknown>;
      const idValue = raw._id;
      const stockId =
        idValue != null && typeof idValue === 'object' && 'toString' in idValue
          ? String((idValue as { toString(): string }).toString())
          : String(idValue ?? '').trim();
      const cardId = String(raw.card_id ?? '').trim();
      if (!stockId || !cardId) continue;
      if (!this.photoFileExists(owner, cardId, stockId)) continue;
      index[stockId] = this.inventoryPhotoPublicPath(owner, cardId, stockId);
    }

    return index;
  }

  parseImageBase64(input: string): { buffer: Buffer; contentType: string } {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new BadRequestException('imageBase64 vacío');
    }

    const dataUrlMatch = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(
      trimmed,
    );
    if (dataUrlMatch) {
      const contentType = dataUrlMatch[1].toLowerCase().replace('jpg', 'jpeg');
      const buffer = Buffer.from(dataUrlMatch[2], 'base64');
      if (buffer.length === 0) {
        throw new BadRequestException('Imagen vacía');
      }
      if (buffer.length > 8 * 1024 * 1024) {
        throw new BadRequestException('Imagen demasiado grande (máx. 8 MB)');
      }
      return { buffer, contentType };
    }

    const buffer = Buffer.from(trimmed, 'base64');
    if (buffer.length === 0) {
      throw new BadRequestException('Imagen inválida');
    }
    if (buffer.length > 8 * 1024 * 1024) {
      throw new BadRequestException('Imagen demasiado grande (máx. 8 MB)');
    }
    return { buffer, contentType: 'image/jpeg' };
  }

  async saveInventoryPhoto(
    stockId: string,
    imageBase64: string,
  ): Promise<{ inventory_photo_url: string }> {
    const trimmedId = stockId?.trim() ?? '';
    if (!trimmedId || !isValidObjectId(trimmedId)) {
      throw new BadRequestException('id de stock inválido');
    }

    const stock = await this.stockRepository.findById(trimmedId);
    if (!stock) {
      throw new NotFoundException('Stock no encontrado');
    }

    const owner = getCurrentOwner();
    const cardId = String(stock.card_id ?? '').trim();
    if (!cardId) {
      throw new BadRequestException('card_id vacío');
    }

    const { buffer } = this.parseImageBase64(imageBase64);
    const relative = stockPhotoRelativePath(owner, cardId, trimmedId);
    const fullPath = join(this.getPhotosRoot(), ...relative.split('/'));
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, buffer);

    const publicPath = stockPhotoPublicPath(owner, cardId, trimmedId);
    return { inventory_photo_url: publicPath };
  }

  async listMissingInventoryPhotos(): Promise<StockMissingPhotoRow[]> {
    const owner = getCurrentOwner();
    const items = await this.stockRepository.findAll();
    const rows: StockMissingPhotoRow[] = [];

    for (const stock of items) {
      const raw = stock as unknown as Record<string, unknown>;
      const idValue = raw._id;
      const stockId =
        idValue != null && typeof idValue === 'object' && 'toString' in idValue
          ? String((idValue as { toString(): string }).toString())
          : String(idValue ?? '').trim();
      if (!stockId) continue;

      const cardState = String(raw.card_state ?? '').trim();
      if (!SELLABLE_STOCK_STATES.has(cardState)) continue;

      const productKind = effectiveProductKind(
        raw.product_kind as string | undefined,
      );
      if (productKind === 'quantity') continue;

      const cardId = String(raw.card_id ?? '').trim();
      const catalogImageUrl = String(raw.image_url ?? '').trim();
      const hasPhoto = this.hasInventoryPhoto(owner, cardId, stockId);
      if (hasPhoto) continue;

      rows.push({
        _id: stockId,
        card_id: cardId,
        card_name: String(raw.card_name ?? '').trim() || cardId,
        image_url: isStockPhotoPublicPath(catalogImageUrl) ? '' : catalogImageUrl,
        language:
          typeof raw.language === 'string' ? raw.language : undefined,
        rareza:
          raw.rareza == null
            ? null
            : String(raw.rareza),
        card_state: cardState,
        pvp: typeof raw.pvp === 'number' ? raw.pvp : undefined,
        pvp_currency:
          typeof raw.pvp_currency === 'string' ? raw.pvp_currency : undefined,
        has_inventory_photo: false,
      });
    }

    rows.sort((a, b) =>
      a.card_name.localeCompare(b.card_name, 'es', { sensitivity: 'base' }),
    );
    return rows;
  }
}
