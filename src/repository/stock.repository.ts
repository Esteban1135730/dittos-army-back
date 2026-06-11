import { InjectModel } from '@nestjs/mongoose';
import { Stock, StockDocument, StockSchema } from '../schema/stock.schema';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { StockDto } from 'src/Dto/stock.dto';

@Injectable()
export class StockRepository {
  constructor(
    @InjectModel(Stock.name) private stockModel: Model<StockDocument>,
  ) {}

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

  async findByCardId(cardId: string): Promise<Stock[] | null> {
    return this.stockModel.find({ card_id: cardId }).exec();
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
