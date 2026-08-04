import { Injectable } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Model } from 'mongoose';
import { Sale, SaleDocument } from 'src/schema/sale.schema';

@Injectable()
export class SaleRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get saleModel(): Model<SaleDocument> {
    return this.ownerModels.getModel<SaleDocument>(Sale.name);
  }

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

  async findActiveVentas(): Promise<SaleDocument[]> {
    return this.saleModel
      .find({
        type: 'venta',
        $or: [
          { cycle_closed_at: null },
          { cycle_closed_at: { $exists: false } },
        ],
      })
      .sort({ created_at: -1 })
      .exec();
  }

  async findHistoricalVentas(): Promise<SaleDocument[]> {
    return this.saleModel
      .find({ type: 'venta', cycle_closed_at: { $ne: null, $exists: true } })
      .sort({ cycle_closed_at: -1, created_at: -1 })
      .exec();
  }

  async findVentasByClientId(
    clientId: string,
    opts: { limit: number },
  ): Promise<SaleDocument[]> {
    return this.saleModel
      .find({ type: 'venta', client_id: clientId })
      .sort({ created_at: -1 })
      .limit(opts.limit)
      .exec();
  }

  async closeCurrentCycle(): Promise<number> {
    const closedAt = new Date();
    const result = await this.saleModel
      .updateMany(
        {
          type: 'venta',
          $or: [
            { cycle_closed_at: null },
            { cycle_closed_at: { $exists: false } },
          ],
        },
        { $set: { cycle_closed_at: closedAt } },
      )
      .exec();
    return result.modifiedCount;
  }

  /**
   * Marca una sola venta como cerrada en el ciclo (histórico).
   * Idempotente: si ya tenía cycle_closed_at, devuelve already_closed.
   */
  async finalizeCycleForSale(
    saleId: string,
  ): Promise<'updated' | 'already_closed' | 'wrong_type' | 'not_found'> {
    const sale = await this.saleModel.findById(saleId).exec();
    if (!sale) {
      return 'not_found';
    }
    if (sale.type !== 'venta') {
      return 'wrong_type';
    }
    if (sale.cycle_closed_at != null) {
      return 'already_closed';
    }
    const closedAt = new Date();
    await this.saleModel
      .updateOne(
        { _id: saleId, type: 'venta' },
        { $set: { cycle_closed_at: closedAt } },
      )
      .exec();
    return 'updated';
  }

  async reopenSale(id: string): Promise<boolean> {
    const result = await this.saleModel
      .updateOne(
        {
          _id: id,
          type: 'venta',
          cycle_closed_at: { $exists: true, $ne: null },
        },
        { $unset: { cycle_closed_at: 1 } },
      )
      .exec();
    return result.modifiedCount > 0;
  }

  async findAll(): Promise<Sale[]> {
    return this.saleModel.find().sort({ created_at: -1 }).exec();
  }

  async findById(id: string): Promise<SaleDocument | null> {
    return this.saleModel.findById(id).exec();
  }

  async findOneByStockId(stockId: string): Promise<SaleDocument | null> {
    return this.saleModel.findOne({ stock_id: stockId }).exec();
  }

  async update(id: string, data: Partial<Sale>): Promise<SaleDocument | null> {
    return this.saleModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async delete(id: string): Promise<any> {
    return this.saleModel.findByIdAndDelete(id).exec();
  }
}
