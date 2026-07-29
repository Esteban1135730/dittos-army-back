import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  CardtraderReceiptLine,
  CardtraderReceiptLineDocument,
} from '../schema/cardtrader-receipt-line.schema';

@Injectable()
export class CardtraderReceiptLineRepository {
  constructor(
    @InjectModel(CardtraderReceiptLine.name)
    private lineModel: Model<CardtraderReceiptLineDocument>,
  ) {}

  async createMany(
    lines: Partial<CardtraderReceiptLine>[],
  ): Promise<CardtraderReceiptLineDocument[]> {
    return this.lineModel.insertMany(lines as any) as any;
  }

  async findBySessionId(
    sessionId: string,
  ): Promise<CardtraderReceiptLineDocument[]> {
    return this.lineModel.find({ session_id: sessionId }).exec();
  }

  async findById(id: string): Promise<CardtraderReceiptLineDocument | null> {
    return this.lineModel.findById(id).exec();
  }

  async updateById(
    id: string,
    patch: Partial<CardtraderReceiptLine>,
  ): Promise<CardtraderReceiptLineDocument | null> {
    return this.lineModel
      .findByIdAndUpdate(
        id,
        { ...patch, updated_at: new Date() },
        { new: true },
      )
      .exec();
  }
}
