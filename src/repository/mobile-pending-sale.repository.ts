import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { OwnerModelsService } from '../owner/owner-models.service';
import {
  MobilePendingSale,
  MobilePendingSaleDocument,
  type MobilePendingStatus,
} from '../schema/mobile-pending-sale.schema';

export type CreateMobilePendingSaleInput = {
  stock_id: string;
  stock_owner: MobilePendingSale['stock_owner'];
  amount_cop: number;
  notes?: string;
  client_sale_id: string;
  card_name?: string;
  image_url?: string;
  card_id?: string;
};

@Injectable()
export class MobilePendingSaleRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get model(): Model<MobilePendingSaleDocument> {
    return this.ownerModels.getModel<MobilePendingSaleDocument>(
      MobilePendingSale.name,
    );
  }

  async create(
    input: CreateMobilePendingSaleInput,
  ): Promise<MobilePendingSaleDocument> {
    const created = new this.model({
      ...input,
      status: 'pending',
      created_at: new Date(),
    });
    return created.save();
  }

  async findById(id: string): Promise<MobilePendingSaleDocument | null> {
    return this.model.findById(id).exec();
  }

  async findByClientSaleId(
    clientSaleId: string,
  ): Promise<MobilePendingSaleDocument | null> {
    return this.model.findOne({ client_sale_id: clientSaleId }).exec();
  }

  async findOpenPendingByStockId(
    stockId: string,
  ): Promise<MobilePendingSaleDocument | null> {
    return this.model.findOne({ stock_id: stockId, status: 'pending' }).exec();
  }

  async findByIds(ids: string[]): Promise<MobilePendingSaleDocument[]> {
    if (ids.length === 0) return [];
    return this.model.find({ _id: { $in: ids } }).exec();
  }

  async list(filter: {
    statuses?: MobilePendingStatus[];
    ids?: string[];
    client_sale_id?: string;
  }): Promise<MobilePendingSaleDocument[]> {
    const query: Record<string, unknown> = {};
    if (filter.statuses && filter.statuses.length > 0) {
      query.status = { $in: filter.statuses };
    }
    if (filter.ids && filter.ids.length > 0) {
      query._id = { $in: filter.ids };
    }
    if (filter.client_sale_id) {
      query.client_sale_id = filter.client_sale_id;
    }
    return this.model.find(query).sort({ created_at: -1 }).exec();
  }

  async save(
    doc: MobilePendingSaleDocument,
  ): Promise<MobilePendingSaleDocument> {
    return doc.save();
  }
}
