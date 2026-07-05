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

  async findById(id: string): Promise<CardtraderTransitLineDocument | null> {
    return this.lineModel.findById(id).exec();
  }

  async findByIds(ids: string[]): Promise<CardtraderTransitLineDocument[]> {
    if (!ids.length) return [];
    return this.lineModel.find({ _id: { $in: ids } }).exec();
  }

  async findByRemainingQuantityGreaterThanZero(): Promise<
    CardtraderTransitLineDocument[]
  > {
    return this.lineModel.find({ remaining_quantity: { $gt: 0 } }).exec();
  }

  async decrementRemainingQuantity(
    lineId: string,
    delta: number,
  ): Promise<CardtraderTransitLineDocument | null> {
    if (!Number.isFinite(delta) || delta <= 0) {
      throw new Error('delta debe ser positivo');
    }
    const line = await this.lineModel.findById(lineId).exec();
    if (!line) return null;
    const next = Math.max(0, (line.remaining_quantity ?? 0) - delta);
    return this.lineModel
      .findByIdAndUpdate(lineId, { remaining_quantity: next }, { new: true })
      .exec();
  }

  async incrementRemainingQuantity(
    lineId: string,
    delta: number,
  ): Promise<CardtraderTransitLineDocument | null> {
    if (!Number.isFinite(delta) || delta <= 0) {
      throw new Error('delta debe ser positivo');
    }
    const line = await this.lineModel.findById(lineId).exec();
    if (!line) return null;
    const cap = line.quantity_ordered ?? line.remaining_quantity ?? 0;
    const next = Math.min(cap, (line.remaining_quantity ?? 0) + delta);
    return this.lineModel
      .findByIdAndUpdate(lineId, { remaining_quantity: next }, { new: true })
      .exec();
  }

  async deleteByLotId(lotId: string): Promise<number> {
    const result = await this.lineModel.deleteMany({ lot_id: lotId }).exec();
    return result.deletedCount ?? 0;
  }

  async deleteAll(): Promise<number> {
    const result = await this.lineModel.deleteMany({}).exec();
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
