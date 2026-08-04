import { Stock, StockDocument } from '../schema/stock.schema';
import { Injectable } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { Model } from 'mongoose';
import { StockDto } from 'src/Dto/stock.dto';

@Injectable()
export class StockRepository {
  constructor(private readonly ownerModels: OwnerModelsService) {}

  private get stockModel(): Model<StockDocument> {
    return this.ownerModels.getModel<StockDocument>(Stock.name);
  }

  async create(stockDto: StockDto): Promise<Stock> {
    const {
      tags: _tags,
      id: _id,
      ...rest
    } = stockDto as StockDto & {
      tags?: string[];
    };
    const createdStock = new this.stockModel({
      ...rest,
      card_name: stockDto.card_name ?? '',
    });
    return createdStock.save();
  }

  async createMany(stockDtos: StockDto[]): Promise<any[]> {
    if (!Array.isArray(stockDtos) || stockDtos.length === 0) return [];
    const normalized = stockDtos.map((d) => {
      const {
        tags: _tags,
        id: _id,
        ...rest
      } = d as StockDto & {
        tags?: string[];
      };
      return {
        ...rest,
        card_name: d.card_name ?? '',
      };
    });
    return this.stockModel.insertMany(normalized as any);
  }

  async update(stockDto: StockDto): Promise<Stock | null> {
    const {
      id,
      tags: _tags,
      ...rest
    } = stockDto as StockDto & {
      tags?: string[];
    };
    if (!id) return null;
    return this.stockModel.findByIdAndUpdate(
      id,
      { ...rest, card_name: rest.card_name ?? '' },
      { new: true },
    );
  }

  async findAll(): Promise<Stock[]> {
    return this.stockModel.find().exec();
  }

  async findById(id: string): Promise<Stock | null> {
    return this.stockModel.findById(id);
  }

  /** Una sola query por muchos `_id` (evita N× findById). */
  async findByIds(ids: string[]): Promise<Stock[]> {
    const unique = [
      ...new Set(
        ids.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0),
      ),
    ];
    if (unique.length === 0) return [];
    return this.stockModel.find({ _id: { $in: unique } }).exec();
  }

  async updateById(
    id: string,
    patch: Partial<
      Pick<
        Stock,
        | 'card_id'
        | 'card_name'
        | 'image_url'
        | 'product_kind'
        | 'quantity'
        | 'card_state'
      >
    >,
  ): Promise<Stock | null> {
    if (!id?.trim()) return null;
    return this.stockModel
      .findByIdAndUpdate(id, { $set: patch }, { new: true })
      .exec();
  }

  async findByCardId(cardId: string): Promise<Stock[] | null> {
    return this.stockModel.find({ card_id: cardId }).exec();
  }

  /** Primera línea con ese `card_id` (p. ej. SKU seed único `da-bulk`). */
  async findOneByCardId(cardId: string): Promise<Stock | null> {
    return this.stockModel.findOne({ card_id: cardId }).exec();
  }

  /**
   * Decrementa cantidad de forma atómica si hay stock suficiente.
   * @returns documento actualizado o null si no había qty >= n.
   */
  async decrementQuantityAtomic(
    stockId: string,
    n: number,
  ): Promise<Stock | null> {
    if (!stockId?.trim() || !Number.isFinite(n) || n < 1) return null;
    return this.stockModel
      .findOneAndUpdate(
        {
          _id: stockId,
          product_kind: 'quantity',
          quantity: { $gte: n },
        },
        { $inc: { quantity: -n } },
        { new: true },
      )
      .exec();
  }

  async findByCardState(cardState: string): Promise<Stock[]> {
    return this.stockModel.find({ card_state: cardState }).exec();
  }

  async findByCardIdsInStates(
    cardIds: string[],
    states: string[],
  ): Promise<Stock[]> {
    const ids = [...new Set(cardIds.map((c) => String(c ?? '').trim()).filter(Boolean))];
    if (ids.length === 0 || states.length === 0) return [];
    return this.stockModel
      .find({ card_id: { $in: ids }, card_state: { $in: states } })
      .exec();
  }

  async findByCardStates(states: string[]): Promise<Stock[]> {
    if (states.length === 0) return [];
    return this.stockModel.find({ card_state: { $in: states } }).exec();
  }

  async updateCardState(
    stockId: string,
    cardState: string,
  ): Promise<Stock | null> {
    return this.stockModel.findByIdAndUpdate(
      stockId,
      { card_state: cardState },
      { new: true },
    );
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.stockModel.findByIdAndDelete(id).exec();
    return result != null;
  }
}
