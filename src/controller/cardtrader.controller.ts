import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
import { CardTraderTcgdexResolveService } from 'src/service/cardtrader/cardtrader-tcgdex-resolve.service';

const ORDER_STATES = new Set([
  'paid',
  'sent',
  'arrived',
  'done',
  'hub_pending',
  'closed',
  'canceled',
  'request_for_cancel',
  'lost',
]);

const CT0_QUANTITY_STATES = new Set(['ok', 'pending', 'missing']);

const MAX_QTY = 99;

@Controller('cardtrader')
export class CardTraderController {
  constructor(
    private readonly cardTrader: CardTraderService,
    private readonly tcgdxResolve: CardTraderTcgdexResolveService,
  ) {}

  @Get('expansions')
  async expansions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('game_id') gameId?: string,
  ): Promise<unknown> {
    const p = page !== undefined && page !== '' ? Number(page) : undefined;
    const l = limit !== undefined && limit !== '' ? Number(limit) : undefined;
    const g =
      gameId !== undefined && gameId !== '' ? Number(gameId) : undefined;
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
  async blueprints(
    @Query('expansion_id') expansionId: string,
  ): Promise<unknown> {
    if (!expansionId?.trim()) {
      throw new BadRequestException('expansion_id es obligatorio');
    }
    const id = Number(expansionId);
    if (!Number.isInteger(id) || id < 1) {
      throw new BadRequestException('expansion_id inválido');
    }
    return this.cardTrader.getBlueprintsExport(id);
  }

  @Get('blueprints/item/:blueprintId')
  async blueprintById(
    @Param('blueprintId') blueprintId: string,
  ): Promise<unknown> {
    const id = Number(blueprintId);
    if (!Number.isInteger(id) || id < 1) {
      throw new BadRequestException('blueprint_id inválido');
    }
    return this.cardTrader.getBlueprintById(id);
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
      throw new BadRequestException(
        'Debe enviarse exactamente uno: expansion_id o blueprint_id',
      );
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

  @Get('orders')
  async orders(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('from_id') fromId?: string,
    @Query('to_id') toId?: string,
    @Query('state') state?: string,
    @Query('order_as') orderAs?: string,
    @Query('sort') sort?: string,
  ): Promise<unknown> {
    const p = page !== undefined && page !== '' ? Number(page) : 1;
    const l = limit !== undefined && limit !== '' ? Number(limit) : 50;
    if (!Number.isInteger(p) || p < 1) {
      throw new BadRequestException('page debe ser un entero >= 1');
    }
    if (!Number.isInteger(l) || l < 1 || l > 100) {
      throw new BadRequestException('limit debe ser un entero entre 1 y 100');
    }
    const cleanState = state?.trim();
    if (cleanState && !ORDER_STATES.has(cleanState)) {
      throw new BadRequestException(`state inválido: ${cleanState}`);
    }
    const role =
      orderAs !== undefined && orderAs !== ''
        ? orderAs.trim().toLowerCase()
        : 'buyer';
    if (role !== 'buyer' && role !== 'seller') {
      throw new BadRequestException('order_as debe ser buyer o seller');
    }
    const fid =
      fromId !== undefined && fromId !== '' ? Number(fromId) : undefined;
    const tid = toId !== undefined && toId !== '' ? Number(toId) : undefined;
    if (fid !== undefined && (!Number.isInteger(fid) || fid < 0)) {
      throw new BadRequestException('from_id inválido');
    }
    if (tid !== undefined && (!Number.isInteger(tid) || tid < 0)) {
      throw new BadRequestException('to_id inválido');
    }
    return this.cardTrader.getOrders({
      page: p,
      limit: l,
      from: from?.trim() || undefined,
      to: to?.trim() || undefined,
      fromId: fid,
      toId: tid,
      state: cleanState || undefined,
      orderAs: role,
      sort: sort?.trim() || undefined,
    });
  }

  @Get('orders/:id')
  async orderById(@Param('id') id: string): Promise<unknown> {
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId < 1) {
      throw new BadRequestException('id de pedido inválido');
    }
    return this.cardTrader.getOrderById(orderId);
  }

  @Get('ct0-box-items')
  async ct0BoxItems(@Query('quantity_state') quantityState?: string): Promise<unknown> {
    const clean = quantityState?.trim();
    if (clean && !CT0_QUANTITY_STATES.has(clean)) {
      throw new BadRequestException('quantity_state debe ser ok, pending o missing');
    }
    const raw = await this.cardTrader.getCt0BoxItems();
    if (!clean || !Array.isArray(raw)) return raw;
    return raw.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const q = (item as { quantity?: Record<string, number> }).quantity;
      const n = q?.[clean];
      return typeof n === 'number' && n > 0;
    });
  }

  @Get('ct0-box-items/:id')
  async ct0BoxItemById(@Param('id') id: string): Promise<unknown> {
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId < 1) {
      throw new BadRequestException('id de ítem CT Zero inválido');
    }
    return this.cardTrader.getCt0BoxItemById(itemId);
  }

  @Get('tcgdex/resolve')
  async resolveTcgdex(
    @Query('expansion') expansion?: string,
    @Query('expansion_id') expansionId?: string,
    @Query('collector_number') collectorNumber?: string,
  ): Promise<unknown> {
    const expName = expansion?.trim() || undefined;
    const expId =
      expansionId !== undefined && expansionId !== ''
        ? Number(expansionId)
        : undefined;
    if (expId !== undefined && (!Number.isInteger(expId) || expId < 1)) {
      throw new BadRequestException('expansion_id inválido');
    }
    if (!expName && expId === undefined) {
      throw new BadRequestException('expansion o expansion_id es obligatorio');
    }
    return this.tcgdxResolve.resolveTcgdexCardId({
      expansionName: expName,
      expansionId: expId,
      collectorNumber: collectorNumber?.trim() || undefined,
    });
  }

  @Post('tcgdex/resolve-batch')
  async resolveTcgdexBatch(
    @Body()
    body: {
      lines?: Array<{
        expansion?: string;
        expansion_id?: number;
        collector_number?: string;
      }>;
    },
  ): Promise<{ results: unknown[] }> {
    if (!body || !Array.isArray(body.lines) || body.lines.length === 0) {
      throw new BadRequestException('lines es obligatorio y debe ser un array');
    }
    if (body.lines.length > 500) {
      throw new BadRequestException('máximo 500 líneas por solicitud');
    }

    const normalized = body.lines.map((line, index) => {
      const expName = line?.expansion?.trim() || undefined;
      const expId =
        line?.expansion_id != null ? Number(line.expansion_id) : undefined;
      if (expId !== undefined && (!Number.isInteger(expId) || expId < 1)) {
        throw new BadRequestException(`expansion_id inválido en línea ${index + 1}`);
      }
      if (!expName && expId === undefined) {
        throw new BadRequestException(
          `expansion o expansion_id obligatorio en línea ${index + 1}`,
        );
      }
      return {
        expansionName: expName,
        expansionId: expId,
        collectorNumber: line?.collector_number?.trim() || undefined,
      };
    });

    return {
      results: this.tcgdxResolve.resolveTcgdexCardIdBatch(normalized),
    };
  }

  @Get('images/proxy')
  async proxyImage(
    @Query('url') url: string,
    @Res() res: Response,
  ): Promise<void> {
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
  async shippingMethods(
    @Query('username') username?: string,
  ): Promise<unknown> {
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
      throw new BadRequestException(
        `quantity debe ser un entero entre 1 y ${MAX_QTY}`,
      );
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
  async removeCartItem(
    @Body() body: CardTraderCartRemovePayload,
  ): Promise<unknown> {
    if (body === null || typeof body !== 'object') {
      throw new BadRequestException('Cuerpo JSON inválido');
    }
    const productId = Number(body.product_id);
    const quantity = Number(body.quantity);
    if (!Number.isInteger(productId) || productId < 1) {
      throw new BadRequestException('product_id inválido');
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      throw new BadRequestException(
        `quantity debe ser un entero entre 1 y ${MAX_QTY}`,
      );
    }
    return this.cardTrader.removeFromCart({ product_id: productId, quantity });
  }
}
