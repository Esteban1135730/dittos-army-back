import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  IncomingShipRoundCardUnit,
  IncomingShipRoundCardUnitDocument,
} from '../schema/incoming-ship-round-card-unit.schema';

@Injectable()
export class IncomingShipRoundCardUnitRepository {
  constructor(
    @InjectModel(IncomingShipRoundCardUnit.name)
    private model: Model<IncomingShipRoundCardUnitDocument>,
  ) {}

  async createMany(
    units: Partial<IncomingShipRoundCardUnit>[],
  ): Promise<IncomingShipRoundCardUnitDocument[]> {
    if (units.length === 0) return [];
    return this.model.insertMany(units as any) as Promise<
      IncomingShipRoundCardUnitDocument[]
    >;
  }

  async findByRoundId(
    roundId: string,
  ): Promise<IncomingShipRoundCardUnitDocument[]> {
    return this.model.find({ ship_round_id: roundId }).exec();
  }

  async deleteByRoundId(roundId: string): Promise<number> {
    const result = await this.model.deleteMany({ ship_round_id: roundId }).exec();
    return result.deletedCount ?? 0;
  }
}
