import { BadRequestException, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Stock, type StockDocument } from '../schema/stock.schema';

export type CreateCatalogStockInput = {
  card_id?: unknown;
  card_name?: unknown;
  set_name?: unknown;
  set_code?: unknown;
  card_number?: unknown;
  rarity?: unknown;
  image_url?: unknown;
  unity_cost?: unknown;
  shipment?: unknown;
  cards_in_shipmet?: unknown;
  currency?: unknown;
  card_state?: unknown;
  language?: unknown;
  copies?: unknown;
};

const MAX_COPIES = 50;

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Alta rápida desde un catálogo externo (Yu-Gi-Oh, Magic, One Piece). Escribe
 * en `stocks` de `{tcg}-{owner}` (mismo schema que el panel de stock).
 */
@Injectable()
export class CatalogStockService {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private model(): Model<StockDocument> {
    return this.ownerModels.getModel<StockDocument>(Stock.name);
  }

  async create(input: CreateCatalogStockInput): Promise<{ saved: number }> {
    const cardId = asText(input.card_id);
    const cardName = asText(input.card_name);
    const unityCost = asNumber(input.unity_cost);
    const shipment =
      input.shipment == null || input.shipment === '' ? 0 : asNumber(input.shipment);
    const cardsInShipment =
      input.cards_in_shipmet == null || input.cards_in_shipmet === ''
        ? 1
        : asNumber(input.cards_in_shipmet);
    const copiesRaw =
      input.copies == null || input.copies === '' ? 1 : asNumber(input.copies);
    const copies = Math.trunc(copiesRaw);
    const currency = asText(input.currency).toUpperCase() || 'COP';
    const rarity = asText(input.rarity);
    const cardNumber = asText(input.card_number);

    if (!cardId || !cardName) {
      throw new BadRequestException('card_id y card_name son obligatorios');
    }
    if (!(unityCost > 0) || !(cardsInShipment > 0) || !(copies > 0) || copies > MAX_COPIES) {
      throw new BadRequestException(
        `Costo unitario, cartas por envío y copias (1-${MAX_COPIES}) deben ser válidos`,
      );
    }
    if (!['EUR', 'COP'].includes(currency) || shipment < 0) {
      throw new BadRequestException('Moneda EUR o COP, y envío no negativo');
    }

    const now = new Date();
    const notes = [asText(input.set_name), asText(input.set_code), cardNumber]
      .filter(Boolean)
      .join(' · ');
    const doc = {
      card_id: cardId,
      card_name: cardName,
      image_url: asText(input.image_url),
      unity_cost: unityCost,
      shipment,
      cards_in_shipmet: cardsInShipment,
      currency,
      card_state: asText(input.card_state) || 'disponible',
      language: asText(input.language) || 'en',
      rareza: rarity || undefined,
      incoming_notes: notes || undefined,
      stocked_at: now,
    };
    await this.model().insertMany(Array.from({ length: copies }, () => ({ ...doc })));
    return { saved: copies };
  }

  async recent(limitRaw?: string): Promise<
    Array<{
      card_id: string;
      card_name: string;
      image_url: string;
      unity_cost: number;
      currency: string;
      stocked_at?: Date;
    }>
  > {
    const parsed = Number(limitRaw);
    const limit = Number.isFinite(parsed)
      ? Math.min(Math.max(Math.trunc(parsed), 1), 30)
      : 8;
    return this.model()
      .find()
      .sort({ stocked_at: -1 })
      .limit(limit)
      .select('card_id card_name image_url unity_cost currency stocked_at')
      .lean();
  }
}
