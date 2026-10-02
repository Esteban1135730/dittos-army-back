import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { getCurrentTcg } from '../owner/tcg-context';
import {
  CatalogStockService,
  type CreateCatalogStockInput,
} from './catalog-stock.service';
import { TcgCatalogRegistry } from './tcg-catalog.registry';

const MAX_QUERY_LENGTH = 80;
const MAX_SET_KEY_LENGTH = 120;

function boundedText(value: string | undefined, max: number, field: string): string {
  const text = value?.trim() ?? '';
  if (text.length > max) {
    throw new BadRequestException(`${field} admite hasta ${max} caracteres`);
  }
  return text;
}

/**
 * Catálogo + alta de stock para TCG no Pokémon. El TCG sale de X-Tcg y el
 * stock se escribe en la DB del owner activo (X-Owner).
 */
@Controller('catalog')
export class TcgCatalogController {
  constructor(
    private readonly catalogs: TcgCatalogRegistry,
    private readonly stock: CatalogStockService,
  ) {}

  @Get('sets')
  listSets(@Query('q') q?: string) {
    const query = boundedText(q, MAX_QUERY_LENGTH, 'q');
    return this.catalogs.forTcg(getCurrentTcg()).listSets(query);
  }

  @Get('cards')
  searchCards(@Query('q') q?: string) {
    const query = boundedText(q, MAX_QUERY_LENGTH, 'q');
    return this.catalogs.forTcg(getCurrentTcg()).searchByName(query);
  }

  @Get('sets/:setKey/cards')
  cardsInSet(@Param('setKey') setKey: string) {
    const key = boundedText(setKey, MAX_SET_KEY_LENGTH, 'setKey');
    if (!key) throw new BadRequestException('setKey es obligatorio');
    return this.catalogs.forTcg(getCurrentTcg()).cardsInSet(key);
  }

  @Get('stock')
  recent(@Query('limit') limit?: string) {
    return this.stock.recent(limit);
  }

  @Post('stock')
  create(@Body() body: CreateCatalogStockInput) {
    return this.stock.create(body ?? {});
  }
}
