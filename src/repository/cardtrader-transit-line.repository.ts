import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  CardtraderTransitLine,
  CardtraderTransitLineDocument,
} from '../schema/cardtrader-transit-line.schema';

@Injectable()
export class CardtraderTransitLineRepository {
  constructor(
    @InjectModel(CardtraderTransitLine.name)
    private lineModel: Model<CardtraderTransitLineDocument>,
  ) {}

  async createMany(lines: Partial<CardtraderTransitLine>[]): Promise<any[]> {
    return this.lineModel.insertMany(lines as any);
  }

  async findByLotId(lotId: string): Promise<CardtraderTransitLineDocument[]> {
    return this.lineModel.find({ lot_id: lotId }).exec();
  }

  async deleteByLotId(lotId: string): Promise<number> {
    const result = await this.lineModel.deleteMany({ lot_id: lotId }).exec();
    return result.deletedCount ?? 0;
  }

  async updateUnitCostByLotId(
    lotId: string,
    realFxRateCop: number,
  ): Promise<number> {
    const lines = await this.lineModel.find({ lot_id: lotId }).exec();
    if (!lines.length) return 0;

    const ops = lines.map((line) => ({
      updateOne: {
        filter: { _id: line._id },
        update: {
          $set: {
            unit_cost_cop: Number(line.fx_unit_price) * realFxRateCop,
          },
        },
      },
    }));

    const result = await this.lineModel.bulkWrite(ops as any);
    return result.modifiedCount ?? 0;
  }
}
