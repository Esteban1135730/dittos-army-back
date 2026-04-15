import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StockRepository } from '../repository/stock.repository';
import { PvpRepository } from '../repository/pvp.repository';
import { IncomingBatchRepository } from '../repository/incoming-batch.repository';
import { IncomingBatchItemRepository } from '../repository/incoming-batch-item.repository';
import { TCGDexService } from './tcgdex/tcgdex.service';

const EXCLUDED_STATES = new Set(['vendida', 'propiedad', 'reserva']);

function inventoryLineKey(cardId: string, lang: string, rareza: string | undefined | null): string {
  const v =
    rareza == null || String(rareza).trim() === '' ? '' : String(rareza).trim().toLowerCase();
  return `${cardId}::${lang}::${v}`;
}

/** One item in the store inventory JSON */
export type StoreInventoryItem = {
  lineId: string;
  card_id: string;
  name: string;
  language: string;
  pvp: number;
  quantity: number;
  image: string;
  status: 'available';
  rareza?: string | null;
};

/** Cartas en compras abiertas con unidades pendientes (compras en camino), para la tienda pública */
export type StoreUpcomingItem = {
  id: string;
  card_id: string;
  name: string;
  language: string;
  quantity: number;
  image: string;
  rareza: string | null;
};

@Injectable()
export class StoreInventoryService {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly pvpRepository: PvpRepository,
    private readonly incomingBatchRepository: IncomingBatchRepository,
    private readonly incomingBatchItemRepository: IncomingBatchItemRepository,
    private readonly tcgDexService: TCGDexService,
  ) {}

  private pvpToCop(pvp: number, currency: string): number {
    if (currency === 'COP') return Math.round(pvp);
    if (currency === 'EUR') {
      const rate = Number(process.env.EXCHANGE_EUR_TO_COP) || 4500;
      return Math.round(pvp * rate);
    }
    if (currency === 'USD') {
      const rate = Number(process.env.EXCHANGE_USD_TO_COP) || 4000;
      return Math.round(pvp * rate);
    }
    return Math.round(pvp);
  }

  async exportStoreInventory(): Promise<{
    success: boolean;
    path?: string;
    count?: number;
    error?: string;
  }> {
    const outputPath =
      process.env.STORE_INVENTORY_PATH ||
      path.join(process.cwd(), '..', 'dittos-army-store', 'public', 'inventory.json');

    try {
      const stockItems: any[] = await this.stockRepository.findAll();
      const filtered = stockItems.filter(
        (s) => s.card_state != null && !EXCLUDED_STATES.has(String(s.card_state).toLowerCase()),
      );
      if (filtered.length === 0) {
        await this.writeInventory(outputPath, []);
        return { success: true, path: outputPath, count: 0 };
      }

      const cardIds = [...new Set(filtered.map((s) => s.card_id))];
      const pvpMap = new Map<string, { pvp: number; pvp_currency: string }>();
      const cardMap = new Map<string, { name: string; image: string }>();

      try {
        const pvps = await this.pvpRepository.findByCardIds(cardIds);
        pvps.forEach((pvp) => {
          pvpMap.set(pvp.card_id, { pvp: pvp.pvp, pvp_currency: pvp.currency });
        });
      } catch (e) {
        console.warn('StoreInventory: error loading PVP', e);
      }

      await Promise.all(
        cardIds.map(async (cardId) => {
          try {
            const card = await this.tcgDexService.getCard(cardId);
            if (card) {
              cardMap.set(cardId, {
                name: card.name,
                image: card.image || card.images?.small || card.images?.large || '',
              });
            }
          } catch (e) {
            console.warn(`StoreInventory: error loading card ${cardId}`, e);
          }
        }),
      );

      const enriched = filtered.map((stock) => {
        const card = cardMap.get(stock.card_id);
        const pvpData = pvpMap.get(stock.card_id);
        return {
          ...stock._doc,
          card_name: card?.name ?? stock.card_name ?? '',
          image_url: stock.image_url || card?.image || '',
          pvp: pvpData?.pvp,
          pvp_currency: pvpData?.pvp_currency,
          language: (stock.language || stock.languaje || 'en').toString().trim().toLowerCase() || 'en',
        };
      });

      const byLine = new Map<
        string,
        {
          card_id: string;
          name: string;
          language: string;
          pvp: number;
          image: string;
          quantity: number;
          rareza: string | null;
        }
      >();

      for (const item of enriched) {
        const cardId = item.card_id;
        const lang = (item.language || 'en').toString().trim().toLowerCase() || 'en';
        const displayRareza =
          item.rareza != null && String(item.rareza).trim() !== ''
            ? String(item.rareza).trim()
            : null;
        const key = inventoryLineKey(cardId, lang, displayRareza);
        const pvpData = pvpMap.get(cardId);
        const pvpCop =
          pvpData != null
            ? this.pvpToCop(pvpData.pvp, pvpData.pvp_currency)
            : 0;
        const card = cardMap.get(cardId);
        const name = card?.name || item.card_name || '';
        const image = item.image_url || card?.image || '';

        if (byLine.has(key)) {
          const existing = byLine.get(key)!;
          existing.quantity += 1;
        } else {
          byLine.set(key, {
            card_id: cardId,
            name,
            language: lang,
            pvp: pvpCop,
            image,
            quantity: 1,
            rareza: displayRareza,
          });
        }
      }

      const inventory: StoreInventoryItem[] = Array.from(byLine.entries()).map(
        ([lineId, data]) => ({
          lineId,
          card_id: data.card_id,
          name: data.name,
          language: data.language,
          pvp: data.pvp,
          quantity: data.quantity,
          image: data.image,
          status: 'available' as const,
          ...(data.rareza != null ? { rareza: data.rareza } : {}),
        }),
      );

      await this.writeInventory(outputPath, inventory);
      return { success: true, path: outputPath, count: inventory.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('StoreInventoryService.exportStoreInventory error:', message);
      return { success: false, error: message };
    }
  }

  private async writeInventory(filePath: string, data: StoreInventoryItem[]): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async exportStoreUpcoming(): Promise<{
    success: boolean;
    path?: string;
    count?: number;
    error?: string;
  }> {
    const outputPath =
      process.env.STORE_UPCOMING_PATH ||
      path.join(process.cwd(), '..', 'dittos-army-store', 'public', 'upcoming.json');

    try {
      const openBatches = await this.incomingBatchRepository.findOpenBatches();
      const openIds = new Set(openBatches.map((b) => b._id.toString()));
      if (openIds.size === 0) {
        await this.writeUpcomingJson(outputPath, []);
        return { success: true, path: outputPath, count: 0 };
      }

      const pending = await this.incomingBatchItemRepository.findByRemainingQuantityGreaterThanZero();
      const filtered = pending.filter(
        (it) => openIds.has(String(it.batch_id)) && (it.remaining_quantity ?? 0) > 0,
      );

      const cardIdsNeedingMeta = [
        ...new Set(
          filtered
            .filter((it) => {
              const n = (it.card_name ?? '').trim();
              const img = (it.image_url ?? '').trim();
              return !n || !img;
            })
            .map((it) => it.card_id),
        ),
      ];
      const cardMap = new Map<string, { name: string; image: string }>();
      await Promise.all(
        cardIdsNeedingMeta.map(async (cardId) => {
          try {
            const card = await this.tcgDexService.getCard(cardId);
            if (card) {
              cardMap.set(cardId, {
                name: card.name || '',
                image: card.image || card.images?.small || card.images?.large || '',
              });
            }
          } catch {
            // ignorar
          }
        }),
      );

      type Agg = {
        id: string;
        card_id: string;
        name: string;
        language: string;
        quantity: number;
        image: string;
        rareza: string | null;
      };
      const byKey = new Map<string, Agg>();

      for (const it of filtered) {
        const meta = cardMap.get(it.card_id);
        const name =
          (it.card_name && String(it.card_name).trim()) || meta?.name || it.card_id;
        const image =
          (it.image_url && String(it.image_url).trim()) || meta?.image || '';
        const lang = (it.language || 'en').toString().trim().toLowerCase() || 'en';
        const rz = it.rareza == null || String(it.rareza).trim() === '' ? null : String(it.rareza).trim();
        const key = inventoryLineKey(it.card_id, lang, rz);
        const qty = Math.max(0, Math.floor(Number(it.remaining_quantity) || 0));
        if (qty <= 0) continue;

        const existing = byKey.get(key);
        if (existing) {
          existing.quantity += qty;
          if ((!existing.name || existing.name === existing.card_id) && name && name !== it.card_id) {
            existing.name = name;
          }
          if (!existing.image && image) existing.image = image;
        } else {
          byKey.set(key, {
            id: key,
            card_id: it.card_id,
            name,
            language: lang,
            quantity: qty,
            image,
            rareza: rz,
          });
        }
      }

      const rows: StoreUpcomingItem[] = Array.from(byKey.values());

      rows.sort((a, b) => a.name.localeCompare(b.name, 'es'));

      await this.writeUpcomingJson(outputPath, rows);
      return { success: true, path: outputPath, count: rows.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('StoreInventoryService.exportStoreUpcoming error:', message);
      return { success: false, error: message };
    }
  }

  private async writeUpcomingJson(filePath: string, data: StoreUpcomingItem[]): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
