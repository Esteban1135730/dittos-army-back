import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Stock } from 'src/schema/stock.schema';
import { StockRepository } from 'src/repository/stock.repository';
import { StockDto } from 'src/dto/stock.dto';
import { TcgSdkController } from './tcg-sdk.controller';
import { TCGSdkService } from 'src/service/tcg-sdk.service';
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';

@Controller('stock')
export class StockController {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly tcgDexService: TCGDexService,
  ) {}

  @Post()
  async saveStock(@Body() stockDto: StockDto): Promise<Stock | null> {
    return await this.stockRepository.create(stockDto);
  }

  @Post('update')
  async updateStock(@Body() stockDto: StockDto): Promise<Stock | null> {
    return await this.stockRepository.update(stockDto);
  }

  @Get()
  async listStock(): Promise<Stock[] | null> {
    const stockItems: any[] = await this.stockRepository.findAll();
    var response: any[] = [];
    for (var stock of stockItems) {
      const card = await this.tcgDexService.getCard(stock.card_id);
      response.push({
        ...stock._doc,
        card_name: card ? card?.name : '',
        card_cost: stock.shipment / stock.cards_in_shipmet + stock.unity_cost,
      });
    }
    return response;
  }

  @Get(':id')
  async getStock(@Param() params: any): Promise<any | null> {
    const findCard = (await this.stockRepository.findById(params.id)) as any;
    if (findCard != undefined) {
      const card = await this.tcgDexService.getCard(findCard.card_id);
      return {
        ...findCard._doc,
        card_name: card ? card?.name : '',
        card_cost:
          findCard.shipment / findCard.cards_in_shipmet + findCard.unity_cost,
      };
    }
    return null;
  }

  @Get('group/:card_id')
  async listStockByCardId(@Param() params: any): Promise<any | null> {
    const stocks = await this.stockRepository.findByCardId(params.card_id);
    let card_value_EUR = 0;
    let quantity_EUR = 0;
    let card_value_COP = 0;
    let quantity_COP = 0;
    stocks?.forEach((stockCard) => {
      if (stockCard.currency == 'EUR') {
        card_value_EUR +=
          stockCard.unity_cost +
          stockCard.shipment / stockCard.cards_in_shipmet;
        quantity_EUR = quantity_EUR + 1;
      }
      if (stockCard.currency == 'COP') {
        card_value_COP +=
          stockCard.unity_cost +
          stockCard.shipment / stockCard.cards_in_shipmet;
        quantity_COP += 1;
      }
    });
    card_value_EUR = card_value_EUR / quantity_EUR;
    card_value_COP = card_value_COP / quantity_COP;

    return {
      quantity: quantity_COP + quantity_EUR,
      card_value_EUR: card_value_EUR,
      card_value_COP: card_value_COP,
    };
  }
}
