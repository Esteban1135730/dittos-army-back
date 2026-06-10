import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  IncomingRound,
  IncomingRoundDocument,
} from '../schema/incoming-round.schema';

@Injectable()
export class IncomingRoundRepository {
  constructor(
    @InjectModel(IncomingRound.name)
    private roundModel: Model<IncomingRoundDocument>,
  ) {}

  async create(data: {
    batch_id: string;
    round_index: number;
    shipping_total_cop: number;
  }): Promise<IncomingRoundDocument> {
    const created = new this.roundModel({
      ...data,
      status: 'reviewing',
      created_at: new Date(),
    });
    return created.save();
  }

  async findById(id: string): Promise<IncomingRoundDocument | null> {
    return this.roundModel.findById(id).exec();
  }

  async findByBatchId(batchId: string): Promise<IncomingRoundDocument[]> {
    return this.roundModel
      .find({ batch_id: batchId })
      .sort({ round_index: -1, created_at: -1 })
      .exec();
  }

  async setFinalized(id: string): Promise<IncomingRoundDocument | null> {
    return this.roundModel
      .findByIdAndUpdate(
        id,
        { status: 'finalized', finalized_at: new Date() },
        { new: true },
      )
      .exec();
  }

  async deleteByBatchId(batchId: string): Promise<number> {
    const result = await this.roundModel
      .deleteMany({ batch_id: batchId })
      .exec();
    return result.deletedCount ?? 0;
  }
}
