import { Reserva, ReservaDocument } from '../schema/reserva.schema';
import { Injectable } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Model } from 'mongoose';
import { ReservaDto } from 'src/Dto/reserva.dto';

@Injectable()
export class ReservaRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get reservaModel(): Model<ReservaDocument> {
    return this.ownerModels.getModel<ReservaDocument>(Reserva.name);
  }

  async create(dto: ReservaDto): Promise<Reserva> {
    const created = new this.reservaModel({
      ...dto,
      currency: dto.currency ?? 'COP',
      created_at: new Date(),
      updated_at: new Date(),
    });
    return created.save();
  }

  async findAll(): Promise<Reserva[]> {
    return this.reservaModel.find().sort({ created_at: -1 }).exec();
  }

  async findByClientId(clientId: string): Promise<Reserva[]> {
    return this.reservaModel
      .find({ client_id: clientId })
      .sort({ created_at: -1 })
      .exec();
  }

  async findByPedidoId(pedidoId: string): Promise<Reserva[]> {
    return this.reservaModel
      .find({ pedido_id: pedidoId })
      .sort({ created_at: -1 })
      .exec();
  }

  async findByStockId(stockId: string): Promise<Reserva | null> {
    return this.reservaModel.findOne({ stock_id: stockId }).exec();
  }

  async deleteByStockId(stockId: string): Promise<boolean> {
    const result = await this.reservaModel
      .deleteOne({ stock_id: stockId })
      .exec();
    return (result.deletedCount ?? 0) > 0;
  }

  async updateByStockId(
    stockId: string,
    data: { precio?: number; currency?: string },
  ): Promise<Reserva | null> {
    return this.reservaModel
      .findOneAndUpdate(
        { stock_id: stockId },
        { ...data, updated_at: new Date() },
        { new: true },
      )
      .exec();
  }

  async findById(id: string): Promise<Reserva | null> {
    return this.reservaModel.findById(id).exec();
  }
}
