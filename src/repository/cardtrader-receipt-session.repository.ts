import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  CardtraderReceiptSession,
  CardtraderReceiptSessionDocument,
} from '../schema/cardtrader-receipt-session.schema';

@Injectable()
export class CardtraderReceiptSessionRepository {
  constructor(
    @InjectModel(CardtraderReceiptSession.name)
    private sessionModel: Model<CardtraderReceiptSessionDocument>,
  ) {}

  async create(data: {
    status: 'open' | 'finalized' | 'cancelled';
    lot_ids: string[];
  }): Promise<CardtraderReceiptSessionDocument> {
    const created = new this.sessionModel({
      ...data,
      shipping_total_cop: null,
      finalized_at: null,
      created_at: new Date(),
    });
    return created.save();
  }

  async findById(id: string): Promise<CardtraderReceiptSessionDocument | null> {
    return this.sessionModel.findById(id).exec();
  }

  async findActiveSession(): Promise<CardtraderReceiptSessionDocument | null> {
    return this.sessionModel.findOne({ status: 'open' }).exec();
  }

  async updateStatus(
    id: string,
    status: 'open' | 'finalized' | 'cancelled',
    extra?: Partial<{
      finalized_at: Date | null;
      shipping_total_cop: number | null;
    }>,
  ): Promise<CardtraderReceiptSessionDocument | null> {
    return this.sessionModel
      .findByIdAndUpdate(id, { status, ...extra }, { new: true })
      .exec();
  }
}
