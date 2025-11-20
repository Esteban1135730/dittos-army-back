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
    const createdStock = new this.stockModel(stockDto);
    return createdStock.save();
  }

  async update(stockDto: StockDto): Promise<Stock | null> {
    return this.stockModel.findByIdAndUpdate(stockDto.id, stockDto);
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
