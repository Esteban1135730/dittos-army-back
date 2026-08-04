import { Injectable } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Model } from 'mongoose';
import {
  IncomingRoundItem,
  IncomingRoundItemDocument,
} from '../schema/incoming-round-item.schema';

@Injectable()
export class IncomingRoundItemRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get roundItemModel(): Model<IncomingRoundItemDocument> {
    return this.ownerModels.getModel<IncomingRoundItemDocument>(IncomingRoundItem.name);
  }

  async findByRoundId(roundId: string): Promise<IncomingRoundItemDocument[]> {
    return this.roundItemModel.find({ round_id: roundId }).exec();
  }

  async upsertDecision(
    roundId: string,
    batchItemId: string,
    decision: {
      arrived_quantity: number;
      novedad_quantity: number;
      novedad_notes: string;
    },
  ): Promise<IncomingRoundItemDocument> {
    return (await this.roundItemModel
      .updateOne(
        { round_id: roundId, batch_item_id: batchItemId },
        {
          $set: {
            ...decision,
            updated_at: new Date(),
          },
        },
        { upsert: true },
      )
      .exec()) as any;
  }

  async upsertManyDecisions(
    roundId: string,
    decisions: Array<{
      batchItemId: string;
      arrived_quantity: number;
      novedad_quantity: number;
      novedad_notes: string;
    }>,
  ): Promise<void> {
    const ops = decisions.map((d) => ({
      updateOne: {
        filter: { round_id: roundId, batch_item_id: d.batchItemId },
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
    await this.roundItemModel.bulkWrite(ops as any);
  }

  async deleteByRoundIds(roundIds: string[]): Promise<number> {
    if (!Array.isArray(roundIds) || roundIds.length === 0) return 0;
    const result = await this.roundItemModel
      .deleteMany({ round_id: { $in: roundIds } })
      .exec();
    return result.deletedCount ?? 0;
  }
}
