import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { OwnerModelsService } from '../owner/owner-models.service';
import {
  PedidoAbono,
  PedidoAbonoDocument,
} from '../schema/pedido-abono.schema';

@Injectable()
export class PedidoAbonoRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get model(): Model<PedidoAbonoDocument> {
    return this.ownerModels.getModel<PedidoAbonoDocument>(PedidoAbono.name);
  }

  async findByPedidoId(pedidoId: string): Promise<PedidoAbonoDocument[]> {
    return this.model
      .find({ pedido_id: pedidoId })
      .sort({ created_at: -1 })
      .exec();
  }

  async findById(id: string): Promise<PedidoAbonoDocument | null> {
    return this.model.findById(id).exec();
  }

  async create(
    pedidoId: string,
    amountCop: number,
  ): Promise<PedidoAbonoDocument> {
    const doc = new this.model({
      pedido_id: pedidoId,
      amount_cop: amountCop,
      created_at: new Date(),
    });
    return doc.save();
  }

  async deleteById(id: string): Promise<boolean> {
    const r = await this.model.deleteOne({ _id: id }).exec();
    return (r.deletedCount ?? 0) > 0;
  }

  async deleteByPedidoId(pedidoId: string): Promise<number> {
    const r = await this.model.deleteMany({ pedido_id: pedidoId }).exec();
    return r.deletedCount ?? 0;
  }
}
