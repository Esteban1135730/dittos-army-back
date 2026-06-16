import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  IncomingHomologNovedadStock,
  IncomingHomologNovedadStockDocument,
  HomologNovedadStockStatus,
} from '../schema/incoming-homolog-novedad-stock.schema';

@Injectable()
export class IncomingHomologNovedadStockRepository {
  constructor(
    @InjectModel(IncomingHomologNovedadStock.name)
    private model: Model<IncomingHomologNovedadStockDocument>,
  ) {}

  async upsertBySentUnitKey(
    sentUnitKey: string,
    data: Partial<IncomingHomologNovedadStock>,
  ): Promise<IncomingHomologNovedadStockDocument> {
    const now = new Date();
    return this.model
      .findOneAndUpdate(
        { sent_unit_key: sentUnitKey },
        {
          $set: { ...data, updated_at: now },
          $setOnInsert: { created_at: now },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async findBySentUnitKey(
    sentUnitKey: string,
  ): Promise<IncomingHomologNovedadStockDocument | null> {
    return this.model.findOne({ sent_unit_key: sentUnitKey }).exec();
  }

  async listOpen(): Promise<IncomingHomologNovedadStockDocument[]> {
    return this.model
      .find({ status: { $in: ['pending', 'in_stock'] } })
      .sort({ created_at: -1 })
      .exec();
  }

  async listBySession(
    sessionId: string,
  ): Promise<IncomingHomologNovedadStockDocument[]> {
    return this.model
      .find({ session_id: sessionId })
      .sort({ created_at: -1 })
      .exec();
  }

  async findPendingBySession(
    sessionId: string,
  ): Promise<IncomingHomologNovedadStockDocument[]> {
    return this.model
      .find({ session_id: sessionId, status: 'pending' })
      .exec();
  }

  async findInStockBySession(
    sessionId: string,
  ): Promise<IncomingHomologNovedadStockDocument[]> {
    return this.model
      .find({
        session_id: sessionId,
        status: 'in_stock',
        stock_id: { $ne: null },
      })
      .exec();
  }

  async findInStockByIds(
    ids: string[],
  ): Promise<IncomingHomologNovedadStockDocument[]> {
    if (ids.length === 0) return [];
    return this.model
      .find({
        _id: { $in: ids },
        status: 'in_stock',
        stock_id: { $ne: null },
      })
      .exec();
  }

  async findById(
    id: string,
  ): Promise<IncomingHomologNovedadStockDocument | null> {
    return this.model.findById(id).exec();
  }

  async markInStock(
    id: string,
    patch: {
      stock_id: string;
      card_id: string;
      card_name: string;
      image_url: string;
      language: string;
      unit_cost_cop: number;
      purchase_price_fx: number | null;
      price_currency: string;
    },
  ): Promise<IncomingHomologNovedadStockDocument | null> {
    const now = new Date();
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            ...patch,
            status: 'in_stock' as HomologNovedadStockStatus,
            stock_created_at: now,
            updated_at: now,
          },
        },
        { new: true },
      )
      .exec();
  }

  async resolve(id: string): Promise<IncomingHomologNovedadStockDocument | null> {
    const now = new Date();
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: 'resolved' as HomologNovedadStockStatus,
            resolved_at: now,
            updated_at: now,
          },
        },
        { new: true },
      )
      .exec();
  }

  async revertToPending(
    id: string,
  ): Promise<IncomingHomologNovedadStockDocument | null> {
    const now = new Date();
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: 'pending' as HomologNovedadStockStatus,
            stock_id: null,
            stock_created_at: null,
            updated_at: now,
          },
        },
        { new: true },
      )
      .exec();
  }
}
