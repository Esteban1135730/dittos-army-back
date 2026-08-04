import { Injectable } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Model } from 'mongoose';
import {
  IncomingShipRoundItem,
  IncomingShipRoundItemDocument,
} from '../schema/incoming-ship-round-item.schema';

@Injectable()
export class IncomingShipRoundItemRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get itemModel(): Model<IncomingShipRoundItemDocument> {
    return this.ownerModels.getModel<IncomingShipRoundItemDocument>(IncomingShipRoundItem.name);
  }

  async createMany(items: Partial<IncomingShipRoundItem>[]): Promise<any[]> {
    if (!Array.isArray(items) || items.length === 0) return [];
    return this.itemModel.insertMany(items as any);
  }

  async findByRoundId(
    roundId: string,
  ): Promise<IncomingShipRoundItemDocument[]> {
    return this.itemModel.find({ ship_round_id: roundId }).exec();
  }

  async upsertManyDecisions(
    roundId: string,
    decisions: Array<{
      batch_item_id: string;
      arrived_quantity: number;
      novedad_quantity: number;
      novedad_notes: string;
    }>,
  ): Promise<void> {
    const ops = decisions.map((d) => ({
      updateOne: {
        filter: { ship_round_id: roundId, batch_item_id: d.batch_item_id },
        update: {
          $set: {
            arrived_quantity: d.arrived_quantity,
            novedad_quantity: d.novedad_quantity,
            novedad_notes: d.novedad_notes,
            updated_at: new Date(),
          },
        },
        upsert: true,
      },
    }));

    if (ops.length === 0) return;
    await this.itemModel.bulkWrite(ops as any);
  }

  async deleteByRoundId(roundId: string): Promise<number> {
    const result = await this.itemModel
      .deleteMany({ ship_round_id: roundId })
      .exec();
    return result.deletedCount ?? 0;
  }
}
