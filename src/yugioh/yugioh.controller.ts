import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { YugiohCatalogService } from './yugioh-catalog.service';
import {
  YugiohStockService,
  type CreateYugiohStockInput,
} from './yugioh-stock.service';

@Controller('yugioh')
export class YugiohController {
  constructor(
    private readonly catalog: YugiohCatalogService,
    private readonly stock: YugiohStockService,
  ) {}

  @Get('sets')
  listSets(@Query('q') q?: string) {
    return this.catalog.listSets(q);
  }

  @Get('cards')
  searchCards(@Query('q') q?: string) {
    return this.catalog.searchByName(q ?? '');
  }

  @Get('sets/:setName/cards')
  cardsInSet(@Param('setName') setName: string) {
    return this.catalog.cardsInSet(setName);
  }

  @Get('stock')
  recent(@Query('limit') limit?: string) {
    return this.stock.recent(limit);
  }

  @Post('stock')
  create(@Body() body: CreateYugiohStockInput) {
    return this.stock.create(body ?? {});
  }
}
