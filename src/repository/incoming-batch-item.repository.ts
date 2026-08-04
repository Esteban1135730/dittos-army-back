import { Injectable } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Model } from 'mongoose';
import {
  IncomingBatchItem,
  IncomingBatchItemDocument,
} from '../schema/incoming-batch-item.schema';

@Injectable()
export class IncomingBatchItemRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get itemModel(): Model<IncomingBatchItemDocument> {
    return this.ownerModels.getModel<IncomingBatchItemDocument>(IncomingBatchItem.name);
  }

  async createMany(items: Partial<IncomingBatchItem>[]): Promise<any[]> {
    return this.itemModel.insertMany(items as any);
  }

  async findByBatchId(batchId: string): Promise<IncomingBatchItemDocument[]> {
    return this.itemModel.find({ batch_id: batchId }).exec();
  }

  async findByRemainingQuantityGreaterThanZero(): Promise<
    IncomingBatchItemDocument[]
  > {
    return this.itemModel.find({ remaining_quantity: { $gt: 0 } }).exec();
  }

  async findByIds(ids: string[]): Promise<IncomingBatchItemDocument[]> {
    return this.itemModel.find({ _id: { $in: ids } }).exec();
  }

  async findById(id: string): Promise<IncomingBatchItemDocument | null> {
    return this.itemModel.findById(id).exec();
  }

  async updateRemainingQuantity(
    batchItemId: string,
    remainingQuantity: number,
  ): Promise<IncomingBatchItemDocument | null> {
    return this.itemModel
      .findByIdAndUpdate(
        batchItemId,
        { remaining_quantity: remainingQuantity },
        { new: true },
      )
      .exec();
  }

  async deleteByBatchId(batchId: string): Promise<number> {
    const result = await this.itemModel
      .deleteMany({ batch_id: batchId })
      .exec();
    return result.deletedCount ?? 0;
  }

  async updateUnitCostByBatchId(
    batchId: string,
    realEuroRateCopPerEur: number,
  ): Promise<number> {
    const items = await this.itemModel.find({ batch_id: batchId }).exec();
    if (!items.length) return 0;

    const ops = items.map((it) => ({
      updateOne: {
        filter: { _id: it._id },
        update: {
          $set: {
            unit_cost_cop: Number(it.eur_unit_price) * realEuroRateCopPerEur,
          },
        },
      },
    }));

    if (ops.length === 0) return 0;
    const result = await this.itemModel.bulkWrite(ops as any);
    return result.modifiedCount ?? 0;
  }
}
