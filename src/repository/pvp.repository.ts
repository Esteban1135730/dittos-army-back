import { Pvp, PvpDocument } from '../schema/pvp.schema';
import { Injectable } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Model } from 'mongoose';
import { PvpDto } from 'src/Dto/pvp.dto';
import { normalizeOperationalRareza } from '../constants/item-rareza';
import { applyLeanDefaults } from '../utils/lean-defaults';

function filterBasePvp(cardId: string) {
  return {
    card_id: cardId,
    $or: [{ rareza: { $exists: false } }, { rareza: null }, { rareza: '' }],
  };
}

@Injectable()
export class PvpRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get pvpModel(): Model<PvpDocument> {
    return this.ownerModels.getModel<PvpDocument>(Pvp.name);
  }

  private normalizeDtoRareza(dto: PvpDto): string | null {
    return normalizeOperationalRareza(dto.rareza);
  }

  async create(pvpDto: PvpDto): Promise<Pvp> {
    const rz = this.normalizeDtoRareza(pvpDto);
    const doc = {
      card_id: pvpDto.card_id,
      pvp: pvpDto.pvp,
      currency: pvpDto.currency,
      rareza: rz,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const createdPvp = new this.pvpModel(doc);
    return createdPvp.save();
  }

  async update(pvpDto: PvpDto): Promise<Pvp | null> {
    const rz = this.normalizeDtoRareza(pvpDto);
    const filter =
      rz == null
        ? filterBasePvp(pvpDto.card_id)
        : { card_id: pvpDto.card_id, rareza: rz };
    const existing = await this.pvpModel.findOne(filter).exec();
    const payload = {
      card_id: pvpDto.card_id,
      pvp: pvpDto.pvp,
      currency: pvpDto.currency,
      rareza: rz,
      updated_at: new Date(),
    };
    if (existing) {
      return this.pvpModel
        .findOneAndUpdate(filter, { $set: payload }, { new: true })
        .exec();
    }
    return this.create(pvpDto);
  }

  /** PVP base (sin variante), incl. documentos legacy sin campo `rareza`. */
  async findBaseByCardId(cardId: string): Promise<Pvp | null> {
    return this.pvpModel.findOne(filterBasePvp(cardId)).exec();
  }

  async findByCardIdAndRareza(
    cardId: string,
    rareza: string | null,
  ): Promise<Pvp | null> {
    if (rareza == null) return this.findBaseByCardId(cardId);
    return this.pvpModel.findOne({ card_id: cardId, rareza }).exec();
  }

  async findAllByCardId(cardId: string): Promise<Pvp[]> {
    return this.pvpModel.find({ card_id: cardId }).exec();
  }

  async findByCardIds(cardIds: string[]): Promise<Pvp[]> {
    if (!cardIds.length) return [];
    return this.pvpModel.find({ card_id: { $in: cardIds } }).exec();
  }

  /** @deprecated usar `findBaseByCardId` o `resolvePvpForLine` con lista */
  async findByCardId(cardId: string): Promise<Pvp | null> {
    return this.findBaseByCardId(cardId);
  }

  async findAll(): Promise<Pvp[]> {
    return this.pvpModel.find().exec();
  }

  /** Igual que `findAll` en objetos planos con defaults (solo lectura). */
  async findAllLean(): Promise<Pvp[]> {
    const rows = await this.pvpModel.find().lean<Pvp[]>().exec();
    return applyLeanDefaults(this.pvpModel, rows);
  }

  /** Igual que `findByCardIds` en objetos planos con defaults (solo lectura). */
  async findByCardIdsLean(cardIds: string[]): Promise<Pvp[]> {
    if (!cardIds.length) return [];
    const rows = await this.pvpModel
      .find({ card_id: { $in: cardIds } })
      .lean<Pvp[]>()
      .exec();
    return applyLeanDefaults(this.pvpModel, rows);
  }

  async deleteByCardId(cardId: string): Promise<any> {
    return this.pvpModel.deleteMany({ card_id: cardId }).exec();
  }

  async deleteAll(): Promise<{ deletedCount: number }> {
    const result = await this.pvpModel.deleteMany({}).exec();
    return { deletedCount: result.deletedCount };
  }
}
