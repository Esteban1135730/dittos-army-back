import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { OwnerModelsService } from '../owner/owner-models.service';
import {
  ReservaIncomingAbono,
  ReservaIncomingAbonoDocument,
} from '../schema/reserva-incoming-abono.schema';

@Injectable()
export class ReservaIncomingAbonoRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get model(): Model<ReservaIncomingAbonoDocument> {
    return this.ownerModels.getModel<ReservaIncomingAbonoDocument>(
      ReservaIncomingAbono.name,
    );
  }

  async findByClientId(
    clientId: string,
  ): Promise<ReservaIncomingAbonoDocument[]> {
    return this.model
      .find({ client_id: clientId })
      .sort({ created_at: -1 })
      .exec();
  }

  async findById(id: string): Promise<ReservaIncomingAbonoDocument | null> {
    return this.model.findById(id).exec();
  }

  async create(
    clientId: string,
    amountCop: number,
  ): Promise<ReservaIncomingAbonoDocument> {
    const doc = new this.model({
      client_id: clientId,
      amount_cop: amountCop,
      created_at: new Date(),
    });
    return doc.save();
  }

  async deleteById(id: string): Promise<boolean> {
    const r = await this.model.deleteOne({ _id: id }).exec();
    return (r.deletedCount ?? 0) > 0;
  }
}
