import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { Sale, SaleDocument } from 'src/schema/sale.schema';

@Injectable()
export class SaleRepository {
  constructor(
    @InjectModel(Sale.name) private saleModel: Model<SaleDocument>,
  ) {}

  async create(data: Partial<Sale>): Promise<Sale> {
    const sale = new this.saleModel({
      ...data,
      created_at: new Date(),
    });
    return sale.save();
  }

  async findByType(type: Sale['type']): Promise<SaleDocument[]> {
    return this.saleModel.find({ type }).sort({ created_at: -1 }).exec();
  }

  async findAll(): Promise<Sale[]> {
    return this.saleModel.find().sort({ created_at: -1 }).exec();
  }

  async findById(id: string): Promise<SaleDocument | null> {
    return this.saleModel.findById(id).exec();
  }

  async update(id: string, data: Partial<Sale>): Promise<SaleDocument | null> {
    return this.saleModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async delete(id: string): Promise<any> {
    return this.saleModel.findByIdAndDelete(id).exec();
  }
}

