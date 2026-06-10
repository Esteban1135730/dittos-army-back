import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CardStockTag,
  CardStockTagDocument,
} from '../schema/card-stock-tag.schema';

@Injectable()
export class CardStockTagRepository {
  constructor(
    @InjectModel(CardStockTag.name)
    private readonly model: Model<CardStockTagDocument>,
  ) {}

  async setTagsForCardId(cardId: string, tags: string[]): Promise<void> {
    const cid = String(cardId ?? '').trim();
    if (!cid) {
      throw new BadRequestException('card_id es obligatorio para tags');
    }
    await this.model
      .findOneAndUpdate(
        { card_id: cid },
        { $set: { card_id: cid, tags } },
        { upsert: true, new: true },
      )
      .exec();
  }

  async findMapByCardIds(cardIds: string[]): Promise<Map<string, string[]>> {
    const unique = [
      ...new Set(cardIds.map((c) => String(c ?? '').trim()).filter(Boolean)),
    ];
    if (unique.length === 0) {
      return new Map();
    }
    const docs = await this.model
      .find({ card_id: { $in: unique } })
      .lean()
      .exec();
    const map = new Map<string, string[]>();
    for (const d of docs) {
      map.set(d.card_id, Array.isArray(d.tags) ? d.tags : []);
    }
    return map;
  }
}
