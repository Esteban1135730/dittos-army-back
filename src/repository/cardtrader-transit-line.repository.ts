import { Injectable } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Model } from 'mongoose';
import {
  CardtraderTransitLine,
  CardtraderTransitLineDocument,
} from '../schema/cardtrader-transit-line.schema';

@Injectable()
export class CardtraderTransitLineRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get lineModel(): Model<CardtraderTransitLineDocument> {
    return this.ownerModels.getModel<CardtraderTransitLineDocument>(CardtraderTransitLine.name);
  }

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

  async findByCt0ItemIds(
    ct0ItemIds: number[],
  ): Promise<CardtraderTransitLineDocument[]> {
    const ids = [
      ...new Set(
        ct0ItemIds.filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    if (!ids.length) return [];
    return this.lineModel.find({ ct0_item_id: { $in: ids } }).exec();
  }

  /** Marca not_arrived_at solo si aún no estaba; no toca remaining_quantity. */
  async setNotArrivedAtIfUnset(
    lineId: string,
    at: Date,
  ): Promise<CardtraderTransitLineDocument | null> {
    return this.lineModel
      .findOneAndUpdate(
        {
          _id: lineId,
          $or: [
            { not_arrived_at: { $exists: false } },
            { not_arrived_at: null },
          ],
        },
        { $set: { not_arrived_at: at } },
        { new: true },
      )
      .exec();
  }

  /** Líneas con ct0_item_id pero sin product_id (candidatas a backfill desde CT0 API). */
  async findMissingProductIdWithCt0ItemId(): Promise<
    CardtraderTransitLineDocument[]
  > {
    return this.lineModel
      .find({
        ct0_item_id: { $exists: true, $type: 'number', $gt: 0 },
        $or: [
          { product_id: { $exists: false } },
          { product_id: null },
          { product_id: 0 },
        ],
      })
      .exec();
  }

  async setProductId(
    lineId: string,
    productId: number,
  ): Promise<CardtraderTransitLineDocument | null> {
    if (!Number.isFinite(productId) || productId <= 0) return null;
    return this.lineModel
      .findByIdAndUpdate(lineId, { product_id: productId }, { new: true })
      .exec();
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
