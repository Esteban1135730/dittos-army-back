import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  IncomingBatch,
  IncomingBatchDocument,
} from '../schema/incoming-batch.schema';

@Injectable()
export class IncomingBatchRepository {
  constructor(
    @InjectModel(IncomingBatch.name)
    private batchModel: Model<IncomingBatchDocument>,
  ) {}

  async create(data: {
    status: 'open' | 'completed';
    purchase_date: Date;
    total_eur_cards_cost: number;
    total_cop_cards_cost: number;
    real_euro_rate_cop_per_eur: number;
  }): Promise<IncomingBatchDocument> {
    const created = new this.batchModel({
      ...data,
      created_at: new Date(),
    });
    return created.save();
  }

  async findById(id: string): Promise<IncomingBatchDocument | null> {
    return this.batchModel.findById(id).exec();
  }

  async findByIds(ids: string[]): Promise<IncomingBatchDocument[]> {
    if (!ids.length) return [];
    return this.batchModel.find({ _id: { $in: ids } }).exec();
  }

  async findOpenBatches(): Promise<IncomingBatchDocument[]> {
    return this.batchModel
      .find({ status: 'open' })
      .sort({ created_at: -1 })
      .exec();
  }

  async setStatus(
    id: string,
    status: 'open' | 'completed',
  ): Promise<IncomingBatchDocument | null> {
    return this.batchModel
      .findByIdAndUpdate(id, { status, created_at: undefined }, { new: true })
      .exec();
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.batchModel.deleteOne({ _id: id }).exec();
    return (result.deletedCount ?? 0) > 0;
  }

  async updateById(
    id: string,
    data: Partial<{
      purchase_date: Date;
      total_cop_cards_cost: number;
      real_euro_rate_cop_per_eur: number;
    }>,
  ): Promise<IncomingBatchDocument | null> {
    return this.batchModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }
}
