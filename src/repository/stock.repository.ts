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
    const createdStock = new this.stockModel({
      ...stockDto,
      card_name: stockDto.card_name ?? '',
    });
    return createdStock.save();
  }

  async createMany(stockDtos: StockDto[]): Promise<any[]> {
    if (!Array.isArray(stockDtos) || stockDtos.length === 0) return [];
    const normalized = stockDtos.map((d) => ({
      ...d,
      card_name: d.card_name ?? '',
    }));
    return this.stockModel.insertMany(normalized as any);
  }

  async update(stockDto: StockDto): Promise<Stock | null> {
    const { id, ...rest } = stockDto;
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
}
