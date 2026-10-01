import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { Stock } from 'src/schema/stock.schema';
import { StockRepository } from 'src/repository/stock.repository';
import { CardStockTagRepository } from 'src/repository/card-stock-tag.repository';
import { PvpRepository } from 'src/repository/pvp.repository';
import { ReservaRepository } from 'src/repository/reserva.repository';
import { SaleRepository } from 'src/repository/sale.repository';
import { StockDto } from 'src/Dto/stock.dto';
import { FromOpenedSealedBodyDto } from 'src/Dto/from-opened-sealed.dto';
import { StoreInventoryService } from 'src/service/store-inventory.service';
import { OpenedSealedStockService } from 'src/service/opened-sealed-stock.service';
import { StockScanService } from 'src/service/stock-scan.service';
import { StockReviewService } from 'src/service/stock-review.service';
import { BulkProductService } from 'src/service/bulk-product.service';
import { effectiveProductKind } from 'src/constants/bulk-product';
import { LocalCardImagesService } from 'src/pokemon';
import { StockPhotoService } from 'src/service/stock-photo.service';
import { isStockPhotoPublicPath } from 'src/utils/stock-photo-path';
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
import {
  normalizeInventoryCardState,
  SELLABLE_STOCK_STATES,
} from 'src/utils/stock-sellable';
import { FeatureAclGuard, RequireFeature } from 'src/owner/feature-acl.guard';

const ALLOWED_STOCK_LANGUAGES = new Set([
  'es',
  'en',
  'fr',
  'de',
  'it',
  'pt',
  'ja',
  'ko',
  'zh',
  'zh-cn',
  'otro',
]);

@Controller('stock')
export class StockController {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly cardStockTagRepository: CardStockTagRepository,
    private readonly pvpRepository: PvpRepository,
    private readonly storeInventoryService: StoreInventoryService,
    private readonly openedSealedStockService: OpenedSealedStockService,
    private readonly reservaRepository: ReservaRepository,
    private readonly saleRepository: SaleRepository,
    private readonly stockScanService: StockScanService,
    private readonly stockReviewService: StockReviewService,
    private readonly bulkProductService: BulkProductService,
    private readonly stockPhotoService: StockPhotoService,
    private readonly localCardImages: LocalCardImagesService,
  ) {}

  private validatedRareza(stockDto: StockDto): string | null {
    const rz = normalizeOperationalRareza(stockDto.rareza);
    if (!isValidOperationalRareza(rz)) {
      throw new BadRequestException('rareza inválida');
    }
    return rz;
  }

  private normalizeAndValidateLanguage(language?: string): string | undefined {
    if (language === undefined || language === null) {
      return undefined;
    }
    const normalized = language.trim().toLowerCase();
    if (normalized === '') {
      return undefined;
    }
    if (!ALLOWED_STOCK_LANGUAGES.has(normalized)) {
      throw new BadRequestException('language inválido');
    }
    return normalized;
  }

  /** Tags persistidos por `card_id` (colección `card_stock_tags`), no en cada línea de stock. */
  private resolveTagsForLine(
    cardId: string,
    tagByCardId: Map<string, string[]>,
    legacyTags: unknown,
  ): string[] {
    if (tagByCardId.has(cardId)) {
      return tagByCardId.get(cardId)!;
    }
    return Array.isArray(legacyTags) ? legacyTags : [];
  }

  @Post()
  async saveStock(@Body() stockDto: StockDto): Promise<Stock | null> {
    const rz = this.validatedRareza(stockDto);
    const language = this.normalizeAndValidateLanguage(stockDto.language);
    let normalizedTags: string[] | undefined;
    if (stockDto.tags !== undefined) {
      normalizedTags = normalizeStockTagsInput(stockDto.tags);
    }
    const {
      tags: _t,
      rareza: _drop,
      ...rest
    } = stockDto as StockDto & {
      rareza?: string;
    };
    const payload: StockDto = {
      ...rest,
      card_name: stockDto.card_name ?? '',
    };
    if (language !== undefined) {
      payload.language = language;
    }
    if (rz != null) {
      payload.rareza = rz;
    }
    const normalizedState = normalizeInventoryCardState(payload.card_state);
    if (normalizedState !== undefined) {
      payload.card_state = normalizedState;
    }
    const created = await this.stockRepository.create(payload);
    if (created && normalizedTags !== undefined) {
      await this.cardStockTagRepository.setTagsForCardId(
        created.card_id,
        normalizedTags,
      );
    }
    return created;
  }

  @Post('update')
  async updateStock(@Body() stockDto: StockDto): Promise<Stock | null> {
    const rz = this.validatedRareza(stockDto);
    const language = this.normalizeAndValidateLanguage(stockDto.language);
    let normalizedTags: string[] | undefined;
    if (stockDto.tags !== undefined) {
      normalizedTags = normalizeStockTagsInput(stockDto.tags);
    }
    const { tags: _tags, ...withoutTags } = stockDto;
    const normalizedState = normalizeInventoryCardState(withoutTags.card_state);
    const updated = await this.stockRepository.update({
      ...withoutTags,
      card_name: stockDto.card_name ?? '',
      language,
      rareza: rz === null ? null : rz,
      ...(normalizedState !== undefined ? { card_state: normalizedState } : {}),
    } as StockDto);
    if (updated && normalizedTags !== undefined && stockDto.card_id) {
      await this.cardStockTagRepository.setTagsForCardId(
        stockDto.card_id,
        normalizedTags,
      );
    }
    return updated;
  }

  @Post('export-store-inventory')
  @UseGuards(FeatureAclGuard)
  @RequireFeature('export-tienda')
  async exportStoreInventory(): Promise<{
    success: boolean;
    path?: string;
    count?: number;
    error?: string;
  }> {
    return this.storeInventoryService.exportStoreInventory();
  }

  @Post('export-store-upcoming')
  @UseGuards(FeatureAclGuard)
  @RequireFeature('export-tienda')
  async exportStoreUpcoming(): Promise<{
    success: boolean;
    path?: string;
    count?: number;
    error?: string;
  }> {
    return this.storeInventoryService.exportStoreUpcoming();
  }

  @Post('publish-store-catalog')
  @UseGuards(FeatureAclGuard)
  @RequireFeature('export-tienda')
  async publishStoreCatalog() {
    return this.storeInventoryService.publishStoreCatalog();
  }

  @Post('from-opened-sealed')
  @HttpCode(HttpStatus.CREATED)
  async fromOpenedSealed(@Body() body: FromOpenedSealedBodyDto) {
    return this.openedSealedStockService.createFromOpenedSealed(body);
  }

  @Post('ensure-bulk')
  @HttpCode(HttpStatus.OK)
  async ensureBulk() {
    return this.bulkProductService.ensureBulk();
  }

  @Get('perdidas')
  async listPerdidas() {
    const items = await this.stockReviewService.listPerdidas();
    return { items };
  }

  @Get('qr-export')
  async exportStockQr() {
    return this.stockScanService.listQrExportRows();
  }

  @Get('inventory-photos/missing')
  @UseGuards(FeatureAclGuard)
  @RequireFeature('stock-inventario-fotos')
  async listMissingInventoryPhotos() {
    return this.stockPhotoService.listMissingInventoryPhotos();
  }

  @Get('inventory-photos/index')
  @UseGuards(FeatureAclGuard)
  @RequireFeature('stock-inventario-fotos')
  async listInventoryPhotoIndex() {
    return this.stockPhotoService.listInventoryPhotoIndex();
  }

  @Post(':id/inventory-photo')
  @UseGuards(FeatureAclGuard)
  @RequireFeature('stock-inventario-fotos')
  async uploadInventoryPhoto(
    @Param('id') id: string,
    @Body() body: { imageBase64?: string },
  ) {
    const imageBase64 = String(body?.imageBase64 ?? '').trim();
    if (!imageBase64) {
      throw new BadRequestException('imageBase64 requerido');
    }
    return this.stockPhotoService.saveInventoryPhoto(id, imageBase64);
  }

  /** @deprecated Usar GET /stock/qr-export */
  @Get('barcode-export')
  async exportStockBarcodes() {
    return this.stockScanService.listBarcodeExportRows();
  }

  @Get(':id/scan')
  async scanStockLine(
    @Param('id') id: string,
    @Query('exclude') exclude?: string,
    /**
     * Venta asistida QR: lookup cross-DB (activo → otro; o `scan_owner` desde prefijo).
     * Spec 034 — single-owner (default) solo DB del X-Owner.
     */
    @Query('multi') multi?: string,
    @Query('scan_owner') scanOwner?: string,
  ) {
    const excludeIds = (exclude ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const multiMode =
      multi === '1' || multi === 'true' || Boolean(scanOwner?.trim());
    if (multiMode) {
      const forced =
        scanOwner === 'pablo' || scanOwner === 'esteban' ? scanOwner : null;
      return this.stockScanService.getScanViewMulti(id, excludeIds, forced);
    }
    return this.stockScanService.getScanView(id, excludeIds);
  }

  @Get()
  async listStock(@Query('q') q?: string): Promise<Stock[] | null> {
    const query = q?.trim() ?? '';
    const stockItems: any[] = query
      ? await this.stockRepository.searchByQuery(query)
      : await this.stockRepository.findAll();
    const cardIds = [...new Set(stockItems.map((s) => s.card_id))];
    const tagByCardId =
      await this.cardStockTagRepository.findMapByCardIds(cardIds);

    const pvpByCard = new Map<
      string,
      {
        card_id: string;
        rareza?: string | null;
        pvp: number;
        currency: string;
      }[]
    >();
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
      const product_kind = effectiveProductKind(stock.product_kind);
      const quantity =
        product_kind === 'quantity'
          ? typeof stock.quantity === 'number'
            ? stock.quantity
            : 0
          : null;

      let image_url = String(stock.image_url ?? '').trim();
      if (isStockPhotoPublicPath(image_url)) {
        const locale = String(stock.language ?? 'en').trim() || 'en';
        const local = this.localCardImages.resolve({
          cardId: stock.card_id,
          locale,
        });
        image_url = local?.small ?? local?.image ?? '';
      }

      return {
        ...stock._doc,
        image_url,
        card_name: stock.card_name ?? '',
        tags: this.resolveTagsForLine(stock.card_id, tagByCardId, stock.tags),
        card_cost: stock.shipment / stock.cards_in_shipmet + stock.unity_cost,
        pvp: pvpData?.pvp,
        pvp_currency: pvpData?.pvp_currency,
        product_kind,
        quantity,
      };
    });

    return response;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStock(@Param('id') id: string): Promise<void> {
    const trimmed = id?.trim() ?? '';
    if (!trimmed || !isValidObjectId(trimmed)) {
      throw new BadRequestException('id inválido');
    }
    const stock = await this.stockRepository.findById(trimmed);
    if (!stock) {
      throw new NotFoundException('Stock no encontrado');
    }
    const reserva = await this.reservaRepository.findByStockId(trimmed);
    if (reserva) {
      throw new ConflictException(
        'No se puede eliminar: hay una reserva asociada a esta línea.',
      );
    }
    const sale = await this.saleRepository.findOneByStockId(trimmed);
    if (sale) {
      throw new ConflictException(
        'No se puede eliminar: hay un registro de venta asociado.',
      );
    }
    const deleted = await this.stockRepository.deleteById(trimmed);
    if (!deleted) {
      throw new NotFoundException('Stock no encontrado');
    }
  }

  @Get(':id')
  async getStock(@Param() params: any): Promise<any | null> {
    const findCard = (await this.stockRepository.findById(params.id)) as any;
    if (findCard != undefined) {
      const tagMap = await this.cardStockTagRepository.findMapByCardIds([
        findCard.card_id,
      ]);
      let pvp: number | undefined;
      let pvp_currency: string | undefined;
      try {
        const pvps = await this.pvpRepository.findByCardIds([findCard.card_id]);
        const list = groupPvpsByCardId(pvps).get(findCard.card_id) ?? [];
        const pvpData = resolvePvpForLine(
          list,
          effectiveOperationalRarezaFromStock(findCard),
        );
        pvp = pvpData?.pvp;
        pvp_currency = pvpData?.pvp_currency;
      } catch {
        // PVP opcional
      }
      const product_kind = effectiveProductKind(findCard.product_kind);
      const quantity =
        product_kind === 'quantity'
          ? typeof findCard.quantity === 'number'
            ? findCard.quantity
            : 0
          : null;
      return {
        ...findCard._doc,
        card_name: findCard.card_name ?? '',
        tags: this.resolveTagsForLine(findCard.card_id, tagMap, findCard.tags),
        card_cost:
          findCard.shipment / findCard.cards_in_shipmet + findCard.unity_cost,
        pvp,
        pvp_currency,
        product_kind,
        quantity,
      };
    }
    return null;
  }

  @Get('group/:card_id')
  async listStockByCardId(@Param() params: any): Promise<any | null> {
    const stocks = await this.stockRepository.findByCardId(params.card_id);
    // Solo unidades vendibles: el costo/PVP de referencia no debe diluirse
    // con reserva, vendida, propiedad u otros estados no disponibles.
    const available =
      stocks?.filter((s) =>
        SELLABLE_STOCK_STATES.has(String(s.card_state ?? '')),
      ) ?? [];
    let card_value_EUR = 0;
    let quantity_EUR = 0;
    let card_value_COP = 0;
    let quantity_COP = 0;
    available.forEach((stockCard) => {
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
