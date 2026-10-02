import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import {
  CardTraderQuoteResolveService,
  type QuoteLineInput,
} from 'src/service/cardtrader/cardtrader-quote-resolve.service';
import { CardTraderQuoteSessionService } from 'src/service/cardtrader/cardtrader-quote-session.service';
import { CardTraderCatalogSearchService } from 'src/service/cardtrader/cardtrader-catalog-search.service';
import { RequireFeature } from 'src/owner/feature-acl.guard';
import {
  CARDTRADER_SUPPORTED_GAME_IDS,
  cardTraderGameIdForTcg,
  isCardTraderGameId,
  tcgForCardTraderGameId,
} from 'src/constants/cardtrader-games';
import { getCurrentTcg } from 'src/owner/tcg-context';

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
@RequireFeature('cardtrader')
export class CardTraderController {
  constructor(
    private readonly cardTrader: CardTraderService,
    private readonly tcgdxResolve: CardTraderTcgdexResolveService,
    private readonly quoteResolve: CardTraderQuoteResolveService,
    private readonly quoteSessions: CardTraderQuoteSessionService,
    private readonly catalogSearch: CardTraderCatalogSearchService,
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

  @Get('blueprints/search')
  async searchBlueprints(
    @Query('q') q?: string,
    @Query('game_id') gameId?: string,
  ): Promise<unknown> {
    const query = q?.trim() ?? '';
    if (query.length < 2 || query.length > 80) {
      throw new BadRequestException('q debe tener entre 2 y 80 caracteres');
    }
    let game: number = cardTraderGameIdForTcg(getCurrentTcg());
    if (gameId !== undefined && gameId.trim() !== '') {
      const g = Number(gameId);
      if (!Number.isInteger(g) || !isCardTraderGameId(g)) {
        throw new BadRequestException(
          `game_id debe ser uno de: ${CARDTRADER_SUPPORTED_GAME_IDS.join(', ')}`,
        );
      }
      game = g;
    }
    const tcg = tcgForCardTraderGameId(game) ?? 'pokemon';
    if (tcg === 'pokemon') {
      return this.quoteResolve.searchBlueprintsByName(query);
    }
    return this.catalogSearch.searchBlueprintsByName(query, tcg);
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
  async ct0BoxItems(
    @Query('quantity_state') quantityState?: string,
  ): Promise<unknown> {
    const clean = quantityState?.trim();
    if (clean && !CT0_QUANTITY_STATES.has(clean)) {
      throw new BadRequestException(
        'quantity_state debe ser ok, pending o missing',
      );
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
    @Query('name') cardName?: string,
    @Query('language') language?: string,
    @Query('blueprint_id') blueprintId?: string,
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
    const bpId =
      blueprintId !== undefined && blueprintId !== ''
        ? Number(blueprintId)
        : undefined;
    if (bpId !== undefined && (!Number.isInteger(bpId) || bpId < 1)) {
      throw new BadRequestException('blueprint_id inválido');
    }
    return this.tcgdxResolve.resolveTcgdexCardId({
      expansionName: expName,
      expansionId: expId,
      collectorNumber: collectorNumber?.trim() || undefined,
      cardName: cardName?.trim() || undefined,
      language: language?.trim() || undefined,
      blueprint_id: bpId,
    });
  }

  @Post('quote-lines/resolve')
  async resolveQuoteLines(
    @Body() body: { lines?: QuoteLineInput[] },
  ): Promise<{ results: unknown[] }> {
    if (!body || !Array.isArray(body.lines) || body.lines.length === 0) {
      throw new BadRequestException('lines es obligatorio y debe ser un array');
    }
    if (body.lines.length > 100) {
      throw new BadRequestException('máximo 100 líneas por solicitud');
    }
    const normalized: QuoteLineInput[] = body.lines.map((line, index) => {
      const name = line?.name?.trim() ?? '';
      const expansion = line?.expansion?.trim() ?? '';
      const collector = line?.collector_number?.trim() ?? '';
      if (!name || !expansion || !collector) {
        throw new BadRequestException(
          `name, expansion y collector_number obligatorios en línea ${index + 1}`,
        );
      }
      return {
        name,
        expansion,
        collector_number: collector,
        language_label: line?.language_label?.trim() || undefined,
        condition_label: line?.condition_label?.trim() || undefined,
      };
    });
    return this.quoteResolve.resolveLines(normalized);
  }

  @Post('quote-sessions')
  async createQuoteSession(
    @Body()
    body: {
      source?: string;
      raw_paste?: string;
      lines?: Array<{
        name?: string;
        expansion?: string;
        collector_number?: string;
        language_label?: string | null;
        condition_label?: string | null;
        resolve?: Record<string, unknown>;
      }>;
    },
  ): Promise<unknown> {
    return this.quoteSessions.create(body);
  }

  @Get('quote-sessions')
  async listQuoteSessions(@Query('status') status?: string): Promise<unknown> {
    return this.quoteSessions.list(status);
  }

  @Get('quote-sessions/:id')
  async getQuoteSession(@Param('id') id: string): Promise<unknown> {
    return this.quoteSessions.getById(id);
  }

  @Patch('quote-sessions/:id')
  async patchQuoteSession(
    @Param('id') id: string,
    @Body() body: { active_index?: number; status?: string },
  ): Promise<unknown> {
    return this.quoteSessions.patchSession(id, body ?? {});
  }

  @Patch('quote-sessions/:id/lines/:lineIndex')
  async patchQuoteSessionLine(
    @Param('id') id: string,
    @Param('lineIndex') lineIndex: string,
    @Body()
    body: {
      action?: string;
      blueprint_id?: number;
      expansion_id?: number;
      expansion_name?: string;
      name?: string;
      collector_number?: string;
      image_url?: string | null;
    },
  ): Promise<unknown> {
    return this.quoteSessions.patchLine(id, lineIndex, body ?? {});
  }

  @Post('tcgdex/resolve-batch')
  async resolveTcgdexBatch(
    @Body()
    body: {
      lines?: Array<{
        expansion?: string;
        expansion_id?: number;
        collector_number?: string;
        name?: string;
        language?: string;
        blueprint_id?: number;
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
        throw new BadRequestException(
          `expansion_id inválido en línea ${index + 1}`,
        );
      }
      if (!expName && expId === undefined) {
        throw new BadRequestException(
          `expansion o expansion_id obligatorio en línea ${index + 1}`,
        );
      }
      const bpId =
        line?.blueprint_id != null ? Number(line.blueprint_id) : undefined;
      if (bpId !== undefined && (!Number.isInteger(bpId) || bpId < 1)) {
        throw new BadRequestException(
          `blueprint_id inválido en línea ${index + 1}`,
        );
      }
      return {
        expansionName: expName,
        expansionId: expId,
        collectorNumber: line?.collector_number?.trim() || undefined,
        cardName: line?.name?.trim() || undefined,
        language: line?.language?.trim() || undefined,
        blueprint_id: bpId,
      };
    });

    return {
      results: await this.tcgdxResolve.resolveTcgdexCardIdBatch(normalized),
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
