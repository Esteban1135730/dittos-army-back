import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { OwnerModelsService } from '../owner/owner-models.service';
import {
  ElectronicInvoice,
  ElectronicInvoiceDocument,
} from 'src/schema/electronic-invoice.schema';

@Injectable()
export class ElectronicInvoiceRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get model(): Model<ElectronicInvoiceDocument> {
    return this.ownerModels.getModel<ElectronicInvoiceDocument>(
      ElectronicInvoice.name,
    );
  }

  async create(data: Partial<ElectronicInvoice>): Promise<ElectronicInvoice> {
    const now = new Date();
    const document = new this.model({ ...data, created_at: now, updated_at: now });
    return document.save();
  }

  async findById(id: string): Promise<ElectronicInvoiceDocument | null> {
    return this.model.findById(id).exec();
  }

  async updateById(
    id: string,
    data: Partial<ElectronicInvoice>,
  ): Promise<ElectronicInvoiceDocument | null> {
    return this.model
      .findByIdAndUpdate(id, { ...data, updated_at: new Date() }, { new: true })
      .exec();
  }
}
