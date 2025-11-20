import { InjectModel } from '@nestjs/mongoose';
import { Pvp, PvpDocument } from '../schema/pvp.schema';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { PvpDto } from 'src/Dto/pvp.dto';

@Injectable()
export class PvpRepository {
  constructor(
    @InjectModel(Pvp.name) private pvpModel: Model<PvpDocument>,
  ) {}

  async create(pvpDto: PvpDto): Promise<Pvp> {
    const createdPvp = new this.pvpModel({
      ...pvpDto,
      created_at: new Date(),
      updated_at: new Date(),
    });
    return createdPvp.save();
  }

  async update(pvpDto: PvpDto): Promise<Pvp | null> {
    const existing = await this.pvpModel.findOne({ card_id: pvpDto.card_id });
    
    if (existing) {
      // Si existe, actualizar
      return this.pvpModel.findOneAndUpdate(
        { card_id: pvpDto.card_id },
        {
          ...pvpDto,
          updated_at: new Date(),
        },
        { new: true },
      );
    } else {
      // Si no existe, crear nuevo
      return this.create(pvpDto);
    }
  }

  async findByCardId(cardId: string): Promise<Pvp | null> {
    return this.pvpModel.findOne({ card_id: cardId }).exec();
  }

  async findByCardIds(cardIds: string[]): Promise<Pvp[]> {
    return this.pvpModel.find({ card_id: { $in: cardIds } }).exec();
  }

  async findAll(): Promise<Pvp[]> {
    return this.pvpModel.find().exec();
  }

  async deleteByCardId(cardId: string): Promise<any> {
    return this.pvpModel.deleteOne({ card_id: cardId }).exec();
  }
}

