import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  IncomingBatchNovedad,
  IncomingBatchNovedadDocument,
} from '../schema/incoming-batch-novedad.schema';

@Injectable()
export class IncomingBatchNovedadRepository {
  constructor(
    @InjectModel(IncomingBatchNovedad.name)
    private model: Model<IncomingBatchNovedadDocument>,
  ) {}

  async create(
    data: Partial<IncomingBatchNovedad>,
  ): Promise<IncomingBatchNovedadDocument> {
    const now = new Date();
    const doc = new this.model({
      resolved: false,
      created_at: now,
      updated_at: now,
      ...data,
    });
    return doc.save();
  }

  async listUnresolved(): Promise<IncomingBatchNovedadDocument[]> {
    return this.model
      .find({ resolved: false })
      .sort({ created_at: -1 })
      .exec();
  }

  async listByBatchItem(
    batchItemId: string,
  ): Promise<IncomingBatchNovedadDocument[]> {
    return this.model
      .find({ batch_item_id: batchItemId })
      .sort({ created_at: -1 })
      .exec();
  }

  async resolve(id: string): Promise<IncomingBatchNovedadDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { $set: { resolved: true, updated_at: new Date() } },
        { new: true },
      )
      .exec();
  }
}
