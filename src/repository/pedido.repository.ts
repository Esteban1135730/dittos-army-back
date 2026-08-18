import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { OwnerModelsService } from '../owner/owner-models.service';
import {
  Pedido,
  PedidoDocument,
  PedidoLineSnapshot,
  PedidoStatus,
} from '../schema/pedido.schema';

const OPEN_STATUSES: PedidoStatus[] = ['reservado', 'pagado'];

export type PedidoCreateFields = {
  client_id: string;
  status: PedidoStatus;
  entrega_en_tienda: boolean;
  store_id?: string;
  store_name?: string;
  store_address?: string;
  ciudad?: string;
  direccion_o_punto?: string;
  notas_entrega?: string;
  fecha_tentativa_entrega?: Date;
};

export type PedidoUpdateFields = Partial<
  Omit<PedidoCreateFields, 'client_id' | 'status'>
> & {
  status?: PedidoStatus;
  paid_at?: Date;
  delivered_at?: Date;
  lines_snapshot?: PedidoLineSnapshot[];
};

@Injectable()
export class PedidoRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get pedidoModel(): Model<PedidoDocument> {
    return this.ownerModels.getModel<PedidoDocument>(Pedido.name);
  }

  async create(data: PedidoCreateFields): Promise<PedidoDocument> {
    const now = new Date();
    const created = new this.pedidoModel({
      ...data,
      created_at: now,
      updated_at: now,
    });
    return created.save();
  }

  async findById(id: string): Promise<PedidoDocument | null> {
    return this.pedidoModel.findById(id).exec();
  }

  async findByClientId(clientId: string): Promise<PedidoDocument[]> {
    return this.pedidoModel
      .find({ client_id: clientId })
      .sort({ created_at: -1 })
      .exec();
  }

  async findOpenByClientId(clientId: string): Promise<PedidoDocument | null> {
    return this.pedidoModel
      .findOne({ client_id: clientId, status: { $in: OPEN_STATUSES } })
      .sort({ created_at: -1 })
      .exec();
  }

  async findReservadoByClientId(
    clientId: string,
  ): Promise<PedidoDocument | null> {
    return this.pedidoModel
      .findOne({ client_id: clientId, status: 'reservado' })
      .sort({ created_at: -1 })
      .exec();
  }

  async update(
    id: string,
    data: PedidoUpdateFields,
  ): Promise<PedidoDocument | null> {
    const $set: Record<string, unknown> = { updated_at: new Date() };
    const $unset: Record<string, 1> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) {
        $unset[key] = 1;
      } else {
        $set[key] = value;
      }
    }
    const update: { $set: Record<string, unknown>; $unset?: Record<string, 1> } =
      { $set };
    if (Object.keys($unset).length > 0) {
      update.$unset = $unset;
    }
    return this.pedidoModel.findByIdAndUpdate(id, update, { new: true }).exec();
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.pedidoModel.deleteOne({ _id: id }).exec();
    return (result.deletedCount ?? 0) > 0;
  }
}
