import { Reserva, ReservaDocument } from '../schema/reserva.schema';
import { Injectable } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Model } from 'mongoose';
import { ReservaDto } from 'src/Dto/reserva.dto';

/** Reservas de stock que nunca se ligaron a un Pedido (legado o materializadas desde incoming). */
export const RESERVA_ORPHAN_PEDIDO_QUERY = {
  $or: [
    { pedido_id: { $exists: false } },
    { pedido_id: null },
    { pedido_id: '' },
  ],
};

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

  /** Liga reservas sin `pedido_id` del cliente al pedido reservado. */
  async attachOrphansToPedido(
    clientId: string,
    pedidoId: string,
  ): Promise<number> {
    if (!clientId?.trim() || !pedidoId?.trim()) return 0;
    const result = await this.reservaModel
      .updateMany(
        { client_id: clientId, ...RESERVA_ORPHAN_PEDIDO_QUERY },
        { $set: { pedido_id: pedidoId, updated_at: new Date() } },
      )
      .exec();
    return result.modifiedCount ?? 0;
  }

  async setPedidoId(id: string, pedidoId: string): Promise<Reserva | null> {
    if (!id?.trim() || !pedidoId?.trim()) return null;
    return this.reservaModel
      .findByIdAndUpdate(
        id,
        { $set: { pedido_id: pedidoId, updated_at: new Date() } },
        { new: true },
      )
      .exec();
  }

  async findByStockId(stockId: string): Promise<Reserva | null> {
    return this.reservaModel.findOne({ stock_id: stockId }).exec();
  }

  async findAllByStockId(stockId: string): Promise<Reserva[]> {
    if (!stockId?.trim()) return [];
    return this.reservaModel.find({ stock_id: stockId }).exec();
  }

  async findByClientAndStockId(
    clientId: string,
    stockId: string,
  ): Promise<Reserva | null> {
    if (!clientId?.trim() || !stockId?.trim()) return null;
    return this.reservaModel
      .findOne({ client_id: clientId, stock_id: stockId })
      .exec();
  }

  async findAllByClientAndStockId(
    clientId: string,
    stockId: string,
  ): Promise<Reserva[]> {
    if (!clientId?.trim() || !stockId?.trim()) return [];
    return this.reservaModel
      .find({ client_id: clientId, stock_id: stockId })
      .exec();
  }

  async addQuantity(id: string, n: number): Promise<Reserva | null> {
    if (!id?.trim() || !Number.isFinite(n) || n < 1) return null;
    const doc = await this.reservaModel.findById(id).exec();
    if (!doc) return null;
    const current =
      typeof doc.quantity === 'number' && Number.isInteger(doc.quantity) && doc.quantity >= 1
        ? doc.quantity
        : 1;
    return this.reservaModel
      .findByIdAndUpdate(
        id,
        { $set: { quantity: current + n, updated_at: new Date() } },
        { new: true },
      )
      .exec();
  }

  async deleteById(id: string): Promise<boolean> {
    if (!id?.trim()) return false;
    const result = await this.reservaModel.deleteOne({ _id: id }).exec();
    return (result.deletedCount ?? 0) > 0;
  }

  async deleteByStockId(stockId: string): Promise<boolean> {
    const result = await this.reservaModel
      .deleteOne({ stock_id: stockId })
      .exec();
    return (result.deletedCount ?? 0) > 0;
  }

  async updateById(
    id: string,
    data: { precio?: number; currency?: string },
  ): Promise<Reserva | null> {
    if (!id?.trim()) return null;
    return this.reservaModel
      .findByIdAndUpdate(
        id,
        { ...data, updated_at: new Date() },
        { new: true },
      )
      .exec();
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

  async updateByClientAndStockId(
    clientId: string,
    stockId: string,
    data: { precio?: number; currency?: string },
  ): Promise<Reserva | null> {
    if (!clientId?.trim() || !stockId?.trim()) return null;
    return this.reservaModel
      .findOneAndUpdate(
        { client_id: clientId, stock_id: stockId },
        { ...data, updated_at: new Date() },
        { new: true },
      )
      .exec();
  }

  async findById(id: string): Promise<Reserva | null> {
    return this.reservaModel.findById(id).exec();
  }
}
