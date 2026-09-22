import { Injectable } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Model } from 'mongoose';
import {
  CardtraderSentUnit,
  CardtraderSentUnitDocument,
} from '../schema/cardtrader-sent-unit.schema';

@Injectable()
export class CardtraderSentUnitRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get model(): Model<CardtraderSentUnitDocument> {
    return this.ownerModels.getModel<CardtraderSentUnitDocument>(
      CardtraderSentUnit.name,
    );
  }

  async upsertMany(
    units: Partial<CardtraderSentUnit>[],
  ): Promise<CardtraderSentUnitDocument[]> {
    if (units.length === 0) return [];
    const now = new Date();
    const ops = units.map((u) => ({
      updateOne: {
        filter: { unit_key: u.unit_key },
        update: {
          $set: { ...u, last_synced_at: now },
          $setOnInsert: { first_seen_at: now },
        },
        upsert: true,
      },
    }));
    await this.model.bulkWrite(ops as any);
    const keys = units.map((u) => u.unit_key).filter(Boolean) as string[];
    return this.model.find({ unit_key: { $in: keys } }).exec();
  }

  async findByUnitKeys(keys: string[]): Promise<CardtraderSentUnitDocument[]> {
    if (keys.length === 0) return [];
    return this.model.find({ unit_key: { $in: keys } }).exec();
  }

  async listAll(): Promise<CardtraderSentUnitDocument[]> {
    return this.model.find().sort({ paid_at: -1 }).exec();
  }
}
