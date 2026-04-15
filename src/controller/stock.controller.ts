import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Stock } from 'src/schema/stock.schema';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { StockDto } from 'src/Dto/stock.dto';
import { StoreInventoryService } from 'src/service/store-inventory.service';

@Controller('stock')
export class StockController {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly pvpRepository: PvpRepository,
    private readonly storeInventoryService: StoreInventoryService,
  ) {}

  @Post()
  async saveStock(@Body() stockDto: StockDto): Promise<Stock | null> {
    return await this.stockRepository.create({
      ...stockDto,
      card_name: stockDto.card_name ?? '',
    });
  }

  @Post('update')
  async updateStock(@Body() stockDto: StockDto): Promise<Stock | null> {
    return await this.stockRepository.update({
      ...stockDto,
      card_name: stockDto.card_name ?? '',
    });
  }

  @Post('export-store-inventory')
  async exportStoreInventory(): Promise<{ success: boolean; path?: string; count?: number; error?: string }> {
    return this.storeInventoryService.exportStoreInventory();
  }

  @Post('export-store-upcoming')
  async exportStoreUpcoming(): Promise<{ success: boolean; path?: string; count?: number; error?: string }> {
    return this.storeInventoryService.exportStoreUpcoming();
  }

  @Get()
  async listStock(): Promise<Stock[] | null> {
    const stockItems: any[] = await this.stockRepository.findAll();
    const cardIds = [...new Set(stockItems.map((s) => s.card_id))];

    const pvpMap = new Map();
    try {
      const pvps = await this.pvpRepository.findByCardIds(cardIds);
      pvps.forEach((pvp) => {
        pvpMap.set(pvp.card_id, { pvp: pvp.pvp, pvp_currency: pvp.currency });
      });
    } catch (error) {
      console.log('Error obteniendo PVP:', error);
    }

    const response = stockItems.map((stock) => {
      const pvpData = pvpMap.get(stock.card_id);
      return {
        ...stock._doc,
        card_name: stock.card_name ?? '',
        card_cost: stock.shipment / stock.cards_in_shipmet + stock.unity_cost,
        pvp: pvpData?.pvp,
        pvp_currency: pvpData?.pvp_currency,
      };
    });
    
    return response;
  }

  @Get(':id')
  async getStock(@Param() params: any): Promise<any | null> {
    const findCard = (await this.stockRepository.findById(params.id)) as any;
    if (findCard != undefined) {
      return {
        ...findCard._doc,
        card_name: findCard.card_name ?? '',
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
    card_value_EUR = quantity_EUR > 0 ? card_value_EUR / quantity_EUR : 0;
    card_value_COP = quantity_COP > 0 ? card_value_COP / quantity_COP : 0;
    
    // Determinar moneda principal (la que tiene más items)
    let primaryCurrency = 'EUR';
    if (quantity_COP > quantity_EUR) {
      primaryCurrency = 'COP';
    } else if (quantity_EUR > quantity_COP) {
      primaryCurrency = 'EUR';
    } else if (quantity_COP > 0) {
      primaryCurrency = 'COP';
    }

    return {
      quantity: quantity_COP + quantity_EUR,
      card_value_EUR: card_value_EUR,
      card_value_COP: card_value_COP,
      primary_currency: primaryCurrency,
    };
  }
}
