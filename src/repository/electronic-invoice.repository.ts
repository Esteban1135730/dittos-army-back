import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ElectronicInvoice,
  ElectronicInvoiceDocument,
} from 'src/schema/electronic-invoice.schema';

@Injectable()
export class ElectronicInvoiceRepository {
  constructor(
    @InjectModel(ElectronicInvoice.name)
    private readonly model: Model<ElectronicInvoiceDocument>,
  ) {}

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
