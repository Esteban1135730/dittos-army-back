import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  StockReviewSession,
  StockReviewSessionDocument,
  StockReviewSessionStatus,
} from '../schema/stock-review-session.schema';

const ACTIVE_STATUSES: StockReviewSessionStatus[] = [
  'en_verificacion',
  'pendiente_resolucion',
];

@Injectable()
export class StockReviewSessionRepository {
  constructor(
    @InjectModel(StockReviewSession.name)
    private readonly model: Model<StockReviewSessionDocument>,
  ) {}

  async findActive(): Promise<StockReviewSessionDocument | null> {
    return this.model
      .findOne({ status: { $in: ACTIVE_STATUSES } })
      .exec();
  }

  async findById(id: string): Promise<StockReviewSessionDocument | null> {
    return this.model.findById(id).exec();
  }

  async create(
    data: Pick<StockReviewSession, 'tag' | 'status' | 'items'>,
  ): Promise<StockReviewSessionDocument> {
    const now = new Date();
    const doc = new this.model({
      ...data,
      created_at: now,
      updated_at: now,
    });
    return doc.save();
  }

  async save(
    doc: StockReviewSessionDocument,
  ): Promise<StockReviewSessionDocument> {
    doc.updated_at = new Date();
    return doc.save();
  }

  async markCancelled(id: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, {
        status: 'cancelada',
        updated_at: new Date(),
      })
      .exec();
  }
}
