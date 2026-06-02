import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CardTraderCartAddPayload,
  CardTraderCartRemovePayload,
  CardTraderService,
} from 'src/service/cardtrader/cardtrader.service';

const MAX_QTY = 99;

@Controller('cardtrader')
export class CardTraderController {
  constructor(private readonly cardTrader: CardTraderService) {}

  @Get('expansions')
  async expansions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('game_id') gameId?: string,
  ): Promise<unknown> {
    const p = page !== undefined && page !== '' ? Number(page) : undefined;
    const l = limit !== undefined && limit !== '' ? Number(limit) : undefined;
    const g = gameId !== undefined && gameId !== '' ? Number(gameId) : undefined;
    if (p !== undefined && (!Number.isInteger(p) || p < 1)) {
      throw new BadRequestException('page debe ser un entero >= 1');
    }
    if (l !== undefined && (!Number.isInteger(l) || l < 1 || l > 10_000)) {
      throw new BadRequestException('limit debe ser un entero entre 1 y 10000');
    }
    if (g !== undefined && (!Number.isInteger(g) || g < 1)) {
      throw new BadRequestException('game_id debe ser un entero >= 1');
    }
    return this.cardTrader.getExpansions(p, l, g);
  }

  @Get('blueprints')
  async blueprints(@Query('expansion_id') expansionId: string): Promise<unknown> {
    if (!expansionId?.trim()) {
      throw new BadRequestException('expansion_id es obligatorio');
    }
    const id = Number(expansionId);
    if (!Number.isInteger(id) || id < 1) {
      throw new BadRequestException('expansion_id inválido');
    }
    return this.cardTrader.getBlueprintsExport(id);
  }

  @Get('marketplace/products')
  async marketplaceProducts(
    @Query('expansion_id') expansionId?: string,
    @Query('blueprint_id') blueprintId?: string,
    @Query('foil') foil?: string,
    @Query('language') language?: string,
  ): Promise<unknown> {
    const hasE = expansionId !== undefined && expansionId.trim() !== '';
    const hasB = blueprintId !== undefined && blueprintId.trim() !== '';
    if (hasE === hasB) {
      throw new BadRequestException('Debe enviarse exactamente uno: expansion_id o blueprint_id');
    }
    const e = hasE ? Number(expansionId) : NaN;
    const b = hasB ? Number(blueprintId) : NaN;
    if (hasE && (!Number.isInteger(e) || e < 1)) {
      throw new BadRequestException('expansion_id inválido');
    }
    if (hasB && (!Number.isInteger(b) || b < 1)) {
      throw new BadRequestException('blueprint_id inválido');
    }
    let foilBool: boolean | undefined;
    if (foil !== undefined && foil !== '') {
      if (foil !== 'true' && foil !== 'false') {
        throw new BadRequestException('foil debe ser true o false');
      }
      foilBool = foil === 'true';
    }
    return this.cardTrader.getMarketplaceProducts({
      expansionId: hasE ? e : undefined,
      blueprintId: hasB ? b : undefined,
      foil: foilBool,
      language: language?.trim() || undefined,
    });
  }

  @Get('cart')
  async cart(): Promise<unknown> {
    return this.cardTrader.getCart();
  }

  @Get('images/proxy')
  async proxyImage(@Query('url') url: string, @Res() res: Response): Promise<void> {
    const clean = url?.trim();
    if (!clean) {
      throw new BadRequestException('url es obligatorio');
    }
    const { buffer, contentType } = await this.cardTrader.proxyImage(clean);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(buffer);
  }

  @Get('shipping-methods')
  async shippingMethods(@Query('username') username?: string): Promise<unknown> {
    const clean = username?.trim();
    if (!clean) {
      throw new BadRequestException('username es obligatorio');
    }
    return this.cardTrader.getShippingMethods(clean);
  }

  @Post('cart/items')
  async addCartItem(@Body() body: CardTraderCartAddPayload): Promise<unknown> {
    if (body === null || typeof body !== 'object') {
      throw new BadRequestException('Cuerpo JSON inválido');
    }
    const productId = Number(body.product_id);
    const quantity = Number(body.quantity);
    if (!Number.isInteger(productId) || productId < 1) {
      throw new BadRequestException('product_id inválido');
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      throw new BadRequestException(`quantity debe ser un entero entre 1 y ${MAX_QTY}`);
    }
    return this.cardTrader.addToCart({
      product_id: productId,
      quantity,
      via_cardtrader_zero: body.via_cardtrader_zero,
      billing_address: body.billing_address,
      shipping_address: body.shipping_address,
    });
  }

  @Post('cart/items/remove')
  async removeCartItem(@Body() body: CardTraderCartRemovePayload): Promise<unknown> {
    if (body === null || typeof body !== 'object') {
      throw new BadRequestException('Cuerpo JSON inválido');
    }
    const productId = Number(body.product_id);
    const quantity = Number(body.quantity);
    if (!Number.isInteger(productId) || productId < 1) {
      throw new BadRequestException('product_id inválido');
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      throw new BadRequestException(`quantity debe ser un entero entre 1 y ${MAX_QTY}`);
    }
    return this.cardTrader.removeFromCart({ product_id: productId, quantity });
  }
}
