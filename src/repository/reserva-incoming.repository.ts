import { Injectable } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Model } from 'mongoose';
import {
  ReservaIncoming,
  ReservaIncomingDocument,
} from '../schema/reserva-incoming.schema';

@Injectable()
export class ReservaIncomingRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get model(): Model<ReservaIncomingDocument> {
    return this.ownerModels.getModel<ReservaIncomingDocument>(ReservaIncoming.name);
  }

  async sumQuantityForBatchItem(batchItemId: string): Promise<number> {
    const agg = await this.model
      .aggregate<{
        _id: null;
        total: number;
      }>([
        { $match: { batch_item_id: batchItemId } },
        { $group: { _id: null, total: { $sum: '$quantity' } } },
      ])
      .exec();
    return agg[0]?.total ?? 0;
  }

  async findByClientAndBatchItem(
    clientId: string,
    batchItemId: string,
  ): Promise<ReservaIncomingDocument | null> {
    return this.model
      .findOne({ client_id: clientId, batch_item_id: batchItemId })
      .exec();
  }

  async upsertQuantity(
    clientId: string,
    batchItemId: string,
    quantity: number,
    precioCop?: number | null,
  ): Promise<ReservaIncomingDocument | null> {
    if (quantity <= 0) {
      await this.model
        .deleteOne({ client_id: clientId, batch_item_id: batchItemId })
        .exec();
      return null;
    }
    const now = new Date();
    const set: Record<string, unknown> = { quantity, updated_at: now };
    if (precioCop !== undefined) {
      set.precio_cop =
        typeof precioCop === 'number' && Number.isFinite(precioCop) && precioCop > 0
          ? Math.round(precioCop)
          : null;
    }
    const doc = await this.model
      .findOneAndUpdate(
        { client_id: clientId, batch_item_id: batchItemId },
        {
          $set: set,
          $setOnInsert: {
            client_id: clientId,
            batch_item_id: batchItemId,
            created_at: now,
          },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .exec();
    return doc;
  }

  async setPrecioCop(
    id: string,
    precioCop: number | null,
  ): Promise<ReservaIncomingDocument | null> {
    const value =
      typeof precioCop === 'number' && Number.isFinite(precioCop) && precioCop > 0
        ? Math.round(precioCop)
        : null;
    return this.model
      .findByIdAndUpdate(
        id,
        { $set: { precio_cop: value, updated_at: new Date() } },
        { new: true },
      )
      .exec();
  }

  async findById(id: string): Promise<ReservaIncomingDocument | null> {
    return this.model.findById(id).exec();
  }

  async findAll(clientId?: string): Promise<ReservaIncomingDocument[]> {
    const q = clientId ? { client_id: clientId } : {};
    return this.model.find(q).sort({ created_at: -1 }).exec();
  }

  async deleteById(id: string): Promise<boolean> {
    const r = await this.model.deleteOne({ _id: id }).exec();
    return (r.deletedCount ?? 0) > 0;
  }

  /**
   * Consume una unidad pendiente FIFO por batch_item_id.
   * Devuelve client_id si hubo fila y decremento atómico; null si no hay cupo pendiente.
   */
  async consumeOneFifo(
    batchItemId: string,
  ): Promise<{ client_id: string; precio_cop: number | null } | null> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const doc = await this.model
        .findOne({ batch_item_id: batchItemId, quantity: { $gt: 0 } })
        .sort({ created_at: 1 })
        .exec();
      if (!doc) return null;

      const updated = await this.model
        .findOneAndUpdate(
          { _id: doc._id, quantity: { $gte: 1 } },
          { $inc: { quantity: -1 }, $set: { updated_at: new Date() } },
          { new: true },
        )
        .exec();

      if (updated) {
        if (updated.quantity <= 0) {
          await this.model.deleteOne({ _id: updated._id }).exec();
        }
        return { client_id: doc.client_id, precio_cop: doc.precio_cop ?? null };
      }
    }
    throw new Error('consumeOneFifo: demasiados reintentos por concurrencia');
  }
}
