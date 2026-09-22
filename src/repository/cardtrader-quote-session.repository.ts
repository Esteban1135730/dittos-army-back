import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { OwnerModelsService } from '../owner/owner-models.service';
import {
  CardtraderQuoteSession,
  CardtraderQuoteSessionDocument,
  type QuoteSessionStatus,
} from '../schema/cardtrader-quote-session.schema';

@Injectable()
export class CardtraderQuoteSessionRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get model(): Model<CardtraderQuoteSessionDocument> {
    return this.ownerModels.getModel<CardtraderQuoteSessionDocument>(
      CardtraderQuoteSession.name,
    );
  }

  async create(
    data: Partial<CardtraderQuoteSession>,
  ): Promise<CardtraderQuoteSessionDocument> {
    return this.model.create(data);
  }

  async findById(id: string): Promise<CardtraderQuoteSessionDocument | null> {
    return this.model.findById(id).exec();
  }

  async listByStatus(
    status: QuoteSessionStatus,
    limit = 20,
  ): Promise<CardtraderQuoteSessionDocument[]> {
    return this.model
      .find({ status })
      .select('-raw_paste')
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async save(
    doc: CardtraderQuoteSessionDocument,
  ): Promise<CardtraderQuoteSessionDocument> {
    return doc.save();
  }
}
