import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Stock } from 'src/schema/stock.schema';
import { StockRepository } from 'src/repository/stock.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { StockDto } from 'src/Dto/stock.dto';
import { FromOpenedSealedBodyDto } from 'src/Dto/from-opened-sealed.dto';
import { StoreInventoryService } from 'src/service/store-inventory.service';
import { OpenedSealedStockService } from 'src/service/opened-sealed-stock.service';
import {
  effectiveOperationalRarezaFromStock,
  groupPvpsByCardId,
  resolvePvpForLine,
  stockLineRareza,
} from 'src/utils/pvp-resolve';
import {
  isValidOperationalRareza,
  normalizeOperationalRareza,
} from 'src/constants/item-rareza';
import { normalizeStockTagsInput } from 'src/constants/stock-tags';

@Controller('stock')
export class StockController {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly pvpRepository: PvpRepository,
    private readonly storeInventoryService: StoreInventoryService,
    private readonly openedSealedStockService: OpenedSealedStockService,
  ) {}

  private validatedRareza(stockDto: StockDto): string | null {
    const rz = normalizeOperationalRareza(stockDto.rareza);
    if (!isValidOperationalRareza(rz)) {
      throw new BadRequestException('rareza inválida');
    }
    return rz;
  }

  private payloadWithNormalizedTags(stockDto: StockDto): StockDto {
    const tags = normalizeStockTagsInput(stockDto.tags);
    const { tags: _t, ...rest } = stockDto;
    return { ...rest, tags };
  }

  @Post()
  async saveStock(@Body() stockDto: StockDto): Promise<Stock | null> {
    const rz = this.validatedRareza(stockDto);
    const { rareza: _drop, ...rest } = this.payloadWithNormalizedTags(
      stockDto,
    ) as StockDto & { rareza?: string };
    const payload: StockDto = {
      ...rest,
      card_name: stockDto.card_name ?? '',
    };
    if (rz != null) {
      payload.rareza = rz;
    }
    return await this.stockRepository.create(payload);
  }

  @Post('update')
  async updateStock(@Body() stockDto: StockDto): Promise<Stock | null> {
    const rz = this.validatedRareza(stockDto);
    const normalized = this.payloadWithNormalizedTags(stockDto);
    return await this.stockRepository.update({
      ...normalized,
      card_name: stockDto.card_name ?? '',
      rareza: rz === null ? null : rz,
    } as StockDto);
  }

  @Post('export-store-inventory')
  async exportStoreInventory(): Promise<{ success: boolean; path?: string; count?: number; error?: string }> {
    return this.storeInventoryService.exportStoreInventory();
  }

  @Post('export-store-upcoming')
  async exportStoreUpcoming(): Promise<{ success: boolean; path?: string; count?: number; error?: string }> {
    return this.storeInventoryService.exportStoreUpcoming();
  }

  @Post('from-opened-sealed')
  @HttpCode(HttpStatus.CREATED)
  async fromOpenedSealed(@Body() body: FromOpenedSealedBodyDto) {
    return this.openedSealedStockService.createFromOpenedSealed(body);
  }

  @Get()
  async listStock(): Promise<Stock[] | null> {
    const stockItems: any[] = await this.stockRepository.findAll();
    const cardIds = [...new Set(stockItems.map((s) => s.card_id))];

    const pvpByCard = new Map<string, { card_id: string; rareza?: string | null; pvp: number; currency: string }[]>();
    try {
      const pvps = await this.pvpRepository.findByCardIds(cardIds);
      for (const [cid, list] of groupPvpsByCardId(pvps)) {
        pvpByCard.set(cid, list);
      }
    } catch (error) {
      console.log('Error obteniendo PVP:', error);
    }

    const response = stockItems.map((stock) => {
      const list = pvpByCard.get(stock.card_id) ?? [];
      const pvpData = resolvePvpForLine(
        list,
        effectiveOperationalRarezaFromStock(stock),
      );
      return {
        ...stock._doc,
        card_name: stock.card_name ?? '',
        tags: Array.isArray(stock.tags) ? stock.tags : [],
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
        tags: Array.isArray(findCard.tags) ? findCard.tags : [],
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
