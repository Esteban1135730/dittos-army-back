import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  IncomingShipRound,
  IncomingShipRoundDocument,
} from '../schema/incoming-ship-round.schema';

@Injectable()
export class IncomingShipRoundRepository {
  constructor(
    @InjectModel(IncomingShipRound.name)
    private roundModel: Model<IncomingShipRoundDocument>,
  ) {}

  async create(data: { shipping_total_cop: number }): Promise<IncomingShipRoundDocument> {
    const created = new this.roundModel({
      shipping_total_cop: data.shipping_total_cop,
      status: 'reviewing',
      created_at: new Date(),
    });
    return created.save();
  }

  async findById(id: string): Promise<IncomingShipRoundDocument | null> {
    return this.roundModel.findById(id).exec();
  }

  async listOpenRounds(): Promise<IncomingShipRoundDocument[]> {
    return this.roundModel
      .find({ status: 'reviewing' })
      .sort({ created_at: -1 })
      .exec();
  }

  async setFinalized(id: string): Promise<IncomingShipRoundDocument | null> {
    return this.roundModel
      .findByIdAndUpdate(
        id,
        { status: 'finalized', finalized_at: new Date() },
        { new: true },
      )
      .exec();
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.roundModel.deleteOne({ _id: id }).exec();
    return (result.deletedCount ?? 0) > 0;
  }
}

