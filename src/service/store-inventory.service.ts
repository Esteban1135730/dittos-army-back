import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StockRepository } from '../repository/stock.repository';
import { PvpRepository } from '../repository/pvp.repository';
import { TCGDexService } from './tcgdex/tcgdex.service';

const EXCLUDED_STATES = new Set(['vendida', 'propiedad', 'reserva']);

/** One item in the store inventory JSON */
export type StoreInventoryItem = {
  card_id: string;
  name: string;
  language: string;
  pvp: number;
  quantity: number;
  image: string;
  status: 'available';
};

@Injectable()
export class StoreInventoryService {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly pvpRepository: PvpRepository,
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

      const byCardId = new Map<
        string,
        { name: string; language: string; pvp: number; image: string; quantity: number }
      >();

      for (const item of enriched) {
        const key = item.card_id;
        const pvpData = pvpMap.get(key);
        const pvpCop =
          pvpData != null
            ? this.pvpToCop(pvpData.pvp, pvpData.pvp_currency)
            : 0;
        const card = cardMap.get(key);
        const name = card?.name || item.card_name || '';
        const image = item.image_url || card?.image || '';

        if (byCardId.has(key)) {
          const existing = byCardId.get(key)!;
          existing.quantity += 1;
        } else {
          byCardId.set(key, {
            name,
            language: (item.language || 'en').toString().trim().toLowerCase() || 'en',
            pvp: pvpCop,
            image,
            quantity: 1,
          });
        }
      }

      const inventory: StoreInventoryItem[] = Array.from(byCardId.entries()).map(
        ([card_id, data]) => ({
          card_id,
          name: data.name,
          language: data.language,
          pvp: data.pvp,
          quantity: data.quantity,
          image: data.image,
          status: 'available' as const,
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
}
