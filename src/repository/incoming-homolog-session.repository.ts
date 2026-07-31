import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  IncomingHomologSession,
  IncomingHomologSessionDocument,
  IncomingHomologUnit,
} from '../schema/incoming-homolog-session.schema';

@Injectable()
export class IncomingHomologSessionRepository {
  constructor(
    @InjectModel(IncomingHomologSession.name)
    private model: Model<IncomingHomologSessionDocument>,
  ) {}

  async create(
    data: Partial<IncomingHomologSession>,
  ): Promise<IncomingHomologSessionDocument> {
    const now = new Date();
    const doc = new this.model({
      status: 'in_progress',
      units: [],
      created_at: now,
      updated_at: now,
      cardtrader_synced_at: now,
      ...data,
    });
    return doc.save();
  }

  async findById(id: string): Promise<IncomingHomologSessionDocument | null> {
    return this.model.findById(id).exec();
  }

  async findActive(): Promise<IncomingHomologSessionDocument | null> {
    return this.model
      .findOne({ status: { $in: ['in_progress', 'ready'] } })
      .sort({ created_at: -1 })
      .exec();
  }

  /** Última sesión convertida (para pantalla de recuperación si no hay activa). */
  async findLatestConverted(): Promise<IncomingHomologSessionDocument | null> {
    return this.model
      .findOne({ status: 'converted' })
      .sort({ converted_at: -1, updated_at: -1 })
      .exec();
  }

  async updateUnits(
    id: string,
    units: IncomingHomologUnit[],
    status?: string,
  ): Promise<IncomingHomologSessionDocument | null> {
    const plainUnits = units.map((u) => {
      const maybe = u as IncomingHomologUnit & {
        toObject?: () => IncomingHomologUnit;
      };
      const base =
        typeof maybe.toObject === 'function' ? maybe.toObject() : { ...maybe };
      return JSON.parse(JSON.stringify(base)) as IncomingHomologUnit;
    });

    const doc = await this.model.findById(id).exec();
    if (!doc) return null;

    doc.units = plainUnits;
    doc.updated_at = new Date();
    if (status) doc.status = status as IncomingHomologSession['status'];
    doc.markModified('units');
    return doc.save();
  }

  async updateUnitBySentKey(
    id: string,
    sentUnitKey: string,
    unitPatch: Record<string, unknown>,
  ): Promise<IncomingHomologSessionDocument | null> {
    const $set: Record<string, unknown> = { updated_at: new Date() };
    const $unset: Record<string, ''> = {};
    for (const [key, value] of Object.entries(unitPatch)) {
      if (value === undefined) continue;
      if (value === null && key === 'verified_at') {
        $unset[`units.$.${key}`] = '';
        continue;
      }
      $set[`units.$.${key}`] = value;
    }
    const update: Record<string, unknown> = { $set };
    if (Object.keys($unset).length > 0) update.$unset = $unset;
    return this.model
      .findOneAndUpdate(
        { _id: id, 'units.sent_unit_key': sentUnitKey },
        update,
        { new: true },
      )
      .exec();
  }

  async updateStatus(
    id: string,
    status: string,
  ): Promise<IncomingHomologSessionDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { $set: { status, updated_at: new Date() } },
        { new: true },
      )
      .exec();
  }

  async markConverted(
    id: string,
    shipRoundId: string | null,
    shippingTotalCop: number,
    createdStockIds: string[] = [],
  ): Promise<IncomingHomologSessionDocument | null> {
    const now = new Date();
    const $set: Record<string, unknown> = {
      status: 'converted',
      shipping_total_cop: shippingTotalCop,
      converted_at: now,
      updated_at: now,
      created_stock_ids: createdStockIds,
    };
    if (shipRoundId?.trim()) {
      $set.ship_round_id = shipRoundId.trim();
    } else {
      $set.ship_round_id = null;
    }
    return this.model.findByIdAndUpdate(id, { $set }, { new: true }).exec();
  }

  async cancel(id: string): Promise<boolean> {
    const result = await this.model
      .findByIdAndUpdate(id, {
        $set: { status: 'cancelled', updated_at: new Date() },
      })
      .exec();
    return Boolean(result);
  }

  async revertConverted(id: string): Promise<IncomingHomologSessionDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: 'in_progress',
            ship_round_id: null,
            shipping_total_cop: null,
            created_stock_ids: [],
            updated_at: new Date(),
          },
          $unset: { converted_at: '' },
        },
        { new: true },
      )
      .exec();
  }
}
