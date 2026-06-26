import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  CardtraderTransitLot,
  CardtraderTransitLotDocument,
} from '../schema/cardtrader-transit-lot.schema';

@Injectable()
export class CardtraderTransitLotRepository {
  constructor(
    @InjectModel(CardtraderTransitLot.name)
    private lotModel: Model<CardtraderTransitLotDocument>,
  ) {}

  async create(data: {
    status: 'open' | 'completed';
    source: 'ct0' | 'manual';
    ct0_package_key?: string;
    purchase_date: Date;
    total_fx_cards_cost: number;
    registered_items_fx_subtotal?: number;
    total_cop_cards_cost: number;
    real_fx_rate_cop: number;
    cards_cost_currency?: string;
    legacy_incoming_batch_id?: string;
    legacy_incoming_cop_hint?: number;
  }): Promise<CardtraderTransitLotDocument> {
    const created = new this.lotModel({
      ...data,
      created_at: new Date(),
    });
    return created.save();
  }

  async findById(id: string): Promise<CardtraderTransitLotDocument | null> {
    return this.lotModel.findById(id).exec();
  }

  async findByCt0PackageKey(
    packageKey: string,
  ): Promise<CardtraderTransitLotDocument | null> {
    return this.lotModel.findOne({ ct0_package_key: packageKey }).exec();
  }

  async findOpenLots(): Promise<CardtraderTransitLotDocument[]> {
    return this.lotModel
      .find({ status: 'open' })
      .sort({ created_at: -1 })
      .exec();
  }

  async findOpenPackageKeys(): Promise<string[]> {
    const rows = await this.lotModel
      .find({ status: 'open', ct0_package_key: { $exists: true, $ne: null } })
      .select('ct0_package_key')
      .lean()
      .exec();
    return rows
      .map((r) => String(r.ct0_package_key ?? ''))
      .filter((k) => k.length > 0);
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.lotModel.deleteOne({ _id: id }).exec();
    return (result.deletedCount ?? 0) > 0;
  }

  async updateById(
    id: string,
    data: Partial<{
      purchase_date: Date;
      total_cop_cards_cost: number;
      real_fx_rate_cop: number;
      cards_cost_currency: string;
    }>,
  ): Promise<CardtraderTransitLotDocument | null> {
    return this.lotModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }
}
