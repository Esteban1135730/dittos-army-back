import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import {
  connectionNameFor,
  OWNER_KEYS,
  OWNERS_CONFIG,
} from './config/owners.config';
import { OwnerMiddleware } from './owner/owner.middleware';
import { AnalyticsCacheInvalidationMiddleware } from './owner/analytics-cache-invalidation.middleware';
import { OwnerModelsService } from './owner/owner-models.service';
import { FeatureAclGuard } from './owner/feature-acl.guard';
import { SyncTokenGuard } from './guard/sync-token.guard';
import { StockRepository } from './repository/stock.repository';
import { CardStockTagRepository } from './repository/card-stock-tag.repository';
import { Stock, StockSchema } from './schema/stock.schema';
import {
  CardStockTag,
  CardStockTagSchema,
} from './schema/card-stock-tag.schema';
import { Pvp, PvpSchema } from './schema/pvp.schema';
import { Client, ClientSchema } from './schema/client.schema';
import { Reserva, ReservaSchema } from './schema/reserva.schema';
import {
  ReservaIncoming,
  ReservaIncomingSchema,
} from './schema/reserva-incoming.schema';
import {
  ReservaIncomingAbono,
  ReservaIncomingAbonoSchema,
} from './schema/reserva-incoming-abono.schema';
import { PvpRepository } from './repository/pvp.repository';
import { Sale, SaleSchema } from './schema/sale.schema';
import { SaleRepository } from './repository/sale.repository';
import {
  MobilePendingSale,
  MobilePendingSaleSchema,
} from './schema/mobile-pending-sale.schema';
import { MobilePendingSaleRepository } from './repository/mobile-pending-sale.repository';
import { MobilePendingSaleService } from './service/mobile-pending-sale.service';
import { MobilePendingSaleController } from './controller/mobile-pending-sale.controller';
import { SaleBatchService } from './service/sale-batch.service';
import { ClientRepository } from './repository/client.repository';
import { ReservaRepository } from './repository/reserva.repository';
import { ReservaIncomingRepository } from './repository/reserva-incoming.repository';
import { ReservaIncomingAbonoRepository } from './repository/reserva-incoming-abono.repository';
import { IncomingBatchRepository } from './repository/incoming-batch.repository';
import { IncomingBatchItemRepository } from './repository/incoming-batch-item.repository';
import { IncomingRoundRepository } from './repository/incoming-round.repository';
import { IncomingRoundItemRepository } from './repository/incoming-round-item.repository';
import { PokemonModule } from './pokemon';
import { TcgCatalogModule } from './tcg-catalog/tcg-catalog.module';
import { StockCardImagesSyncService } from './service/stock-card-images-sync.service';
import { StoreInventoryService } from './service/store-inventory.service';
import { OpenedSealedStockService } from './service/opened-sealed-stock.service';
import { PvpCardRowsService } from './service/pvp-card-rows.service';
import { IncomingReservationService } from './service/incoming-reservation.service';
import { IncomingReservationAbonoService } from './service/incoming-reservation-abono.service';
import { StoreWhatsAppReservationImportService } from './service/store-whatsapp-reservation-import.service';
import { StoreWhatsAppIncomingImportService } from './service/store-whatsapp-incoming-import.service';
import { StockController } from './controller/stock.controller';
import { PvpController } from './controller/pvp.controller';
import { SaleController } from './controller/sale.controller';
import { ClientController } from './controller/client.controller';
import { ReservaController } from './controller/reserva.controller';
import { IncomingController } from './controller/incoming.controller';
import {
  IncomingBatch,
  IncomingBatchSchema,
} from './schema/incoming-batch.schema';
import {
  IncomingBatchItem,
  IncomingBatchItemSchema,
} from './schema/incoming-batch-item.schema';
import {
  IncomingRound,
  IncomingRoundSchema,
} from './schema/incoming-round.schema';
import {
  IncomingRoundItem,
  IncomingRoundItemSchema,
} from './schema/incoming-round-item.schema';
import {
  IncomingShipRound,
  IncomingShipRoundSchema,
} from './schema/incoming-ship-round.schema';
import {
  IncomingShipRoundItem,
  IncomingShipRoundItemSchema,
} from './schema/incoming-ship-round-item.schema';
import { IncomingShipRoundController } from './controller/incoming-ship-round.controller';
import { IncomingShipRoundRepository } from './repository/incoming-ship-round.repository';
import { IncomingShipRoundItemRepository } from './repository/incoming-ship-round-item.repository';
import { CardTraderController } from './controller/cardtrader.controller';
import { CardtraderTransitLotController } from './controller/cardtrader-transit-lot.controller';
import { CardTraderService } from './service/cardtrader/cardtrader.service';
import { CardTraderTcgdexResolveService } from './service/cardtrader/cardtrader-tcgdex-resolve.service';
import { CardTraderQuoteResolveService } from './service/cardtrader/cardtrader-quote-resolve.service';
import { CardtraderTransitLotService } from './service/cardtrader/cardtrader-transit-lot.service';
import { StockScanService } from './service/stock-scan.service';
import { BulkProductService } from './service/bulk-product.service';
import { StockPhotoService } from './service/stock-photo.service';
import { DashboardController } from './controller/dashboard.controller';
import { DashboardOverviewService } from './service/dashboard-overview.service';
import { MetricsController } from './controller/metrics.controller';
import { MetricsAnalyticsService } from './service/metrics-analytics.service';
import { StockPvpBenchmarkService } from './service/stock-pvp-benchmark.service';
import { StockReviewController } from './controller/stock-review.controller';
import { StockReviewService } from './service/stock-review.service';
import { StockReviewSessionRepository } from './repository/stock-review-session.repository';
import {
  StockReviewSession,
  StockReviewSessionSchema,
} from './schema/stock-review-session.schema';
import { IncomingHomologController } from './controller/incoming-homolog.controller';
import { IncomingHomologService } from './service/incoming-homolog.service';
import { CardtraderSentUnitRepository } from './repository/cardtrader-sent-unit.repository';
import { IncomingHomologSessionRepository } from './repository/incoming-homolog-session.repository';
import { IncomingBatchNovedadRepository } from './repository/incoming-batch-novedad.repository';
import { IncomingHomologNovedadStockRepository } from './repository/incoming-homolog-novedad-stock.repository';
import { IncomingShipRoundCardUnitRepository } from './repository/incoming-ship-round-card-unit.repository';
import {
  CardtraderSentUnit,
  CardtraderSentUnitSchema,
} from './schema/cardtrader-sent-unit.schema';
import {
  IncomingHomologSession,
  IncomingHomologSessionSchema,
} from './schema/incoming-homolog-session.schema';
import {
  IncomingBatchNovedad,
  IncomingBatchNovedadSchema,
} from './schema/incoming-batch-novedad.schema';
import {
  IncomingShipRoundCardUnit,
  IncomingShipRoundCardUnitSchema,
} from './schema/incoming-ship-round-card-unit.schema';
import {
  IncomingHomologNovedadStock,
  IncomingHomologNovedadStockSchema,
} from './schema/incoming-homolog-novedad-stock.schema';
import {
  CardtraderTransitLot,
  CardtraderTransitLotSchema,
} from './schema/cardtrader-transit-lot.schema';
import {
  CardtraderTransitLine,
  CardtraderTransitLineSchema,
} from './schema/cardtrader-transit-line.schema';
import { CardtraderTransitLotRepository } from './repository/cardtrader-transit-lot.repository';
import { CardtraderTransitLineRepository } from './repository/cardtrader-transit-line.repository';
import { CardtraderReceiptController } from './controller/cardtrader-receipt.controller';
import { CardtraderReceiptService } from './service/cardtrader/cardtrader-receipt.service';
import { CardtraderReceiptSessionRepository } from './repository/cardtrader-receipt-session.repository';
import { CardtraderReceiptLineRepository } from './repository/cardtrader-receipt-line.repository';
import {
  CardtraderReceiptSession,
  CardtraderReceiptSessionSchema,
} from './schema/cardtrader-receipt-session.schema';
import {
  CardtraderReceiptLine,
  CardtraderReceiptLineSchema,
} from './schema/cardtrader-receipt-line.schema';
import { Pedido, PedidoSchema } from './schema/pedido.schema';
import { PedidoAbono, PedidoAbonoSchema } from './schema/pedido-abono.schema';
import {
  CardtraderQuoteSession,
  CardtraderQuoteSessionSchema,
} from './schema/cardtrader-quote-session.schema';
import { CardtraderQuoteSessionRepository } from './repository/cardtrader-quote-session.repository';
import { CardTraderQuoteSessionService } from './service/cardtrader/cardtrader-quote-session.service';
import { CardTraderCatalogSearchService } from './service/cardtrader/cardtrader-catalog-search.service';
import { CardtraderOrdersHistorialService } from './service/cardtrader/cardtrader-orders-historial.service';
import { PedidoRepository } from './repository/pedido.repository';
import { PedidoAbonoRepository } from './repository/pedido-abono.repository';
import { PedidoService } from './service/pedido.service';
import { PedidoAbonoService } from './service/pedido-abono.service';
import { EnvioGeocodeService } from './service/envio-geocode.service';
import { PedidoController } from './controller/pedido.controller';
import { HealthController } from './controller/health.controller';

const MONGOOSE_FEATURE_MODELS = [
  { name: Stock.name, schema: StockSchema },
  { name: CardStockTag.name, schema: CardStockTagSchema },
  { name: Pvp.name, schema: PvpSchema },
  { name: Sale.name, schema: SaleSchema },
  { name: MobilePendingSale.name, schema: MobilePendingSaleSchema },
  { name: Client.name, schema: ClientSchema },
  { name: Reserva.name, schema: ReservaSchema },
  { name: ReservaIncoming.name, schema: ReservaIncomingSchema },
  { name: ReservaIncomingAbono.name, schema: ReservaIncomingAbonoSchema },
  { name: IncomingBatch.name, schema: IncomingBatchSchema },
  { name: IncomingBatchItem.name, schema: IncomingBatchItemSchema },
  { name: IncomingRound.name, schema: IncomingRoundSchema },
  { name: IncomingRoundItem.name, schema: IncomingRoundItemSchema },
  { name: IncomingShipRound.name, schema: IncomingShipRoundSchema },
  { name: IncomingShipRoundItem.name, schema: IncomingShipRoundItemSchema },
  { name: StockReviewSession.name, schema: StockReviewSessionSchema },
  { name: CardtraderSentUnit.name, schema: CardtraderSentUnitSchema },
  { name: IncomingHomologSession.name, schema: IncomingHomologSessionSchema },
  { name: IncomingBatchNovedad.name, schema: IncomingBatchNovedadSchema },
  {
    name: IncomingShipRoundCardUnit.name,
    schema: IncomingShipRoundCardUnitSchema,
  },
  {
    name: IncomingHomologNovedadStock.name,
    schema: IncomingHomologNovedadStockSchema,
  },
  { name: CardtraderTransitLot.name, schema: CardtraderTransitLotSchema },
  { name: CardtraderTransitLine.name, schema: CardtraderTransitLineSchema },
  {
    name: CardtraderReceiptSession.name,
    schema: CardtraderReceiptSessionSchema,
  },
  {
    name: CardtraderReceiptLine.name,
    schema: CardtraderReceiptLineSchema,
  },
  { name: Pedido.name, schema: PedidoSchema },
  { name: PedidoAbono.name, schema: PedidoAbonoSchema },
  {
    name: CardtraderQuoteSession.name,
    schema: CardtraderQuoteSessionSchema,
  },
];

@Module({
  controllers: [
    StockController,
    PvpController,
    SaleController,
    MobilePendingSaleController,
    ClientController,
    ReservaController,
    IncomingController,
    IncomingShipRoundController,
    CardTraderController,
    CardtraderTransitLotController,
    DashboardController,
    MetricsController,
    StockReviewController,
    IncomingHomologController,
    CardtraderReceiptController,
    PedidoController,
    HealthController,
  ],
  providers: [
    OwnerModelsService,
    { provide: APP_GUARD, useClass: FeatureAclGuard },
    { provide: APP_GUARD, useClass: SyncTokenGuard },
    StockCardImagesSyncService,
    StoreInventoryService,
    OpenedSealedStockService,
    PvpCardRowsService,
    IncomingReservationService,
    IncomingReservationAbonoService,
    StoreWhatsAppReservationImportService,
    StoreWhatsAppIncomingImportService,
    StockRepository,
    CardStockTagRepository,
    PvpRepository,
    SaleRepository,
    SaleBatchService,
    MobilePendingSaleRepository,
    MobilePendingSaleService,
    ClientRepository,
    ReservaRepository,
    ReservaIncomingRepository,
    ReservaIncomingAbonoRepository,
    IncomingBatchRepository,
    IncomingBatchItemRepository,
    IncomingRoundRepository,
    IncomingRoundItemRepository,
    IncomingShipRoundRepository,
    IncomingShipRoundItemRepository,
    CardTraderService,
    CardTraderTcgdexResolveService,
    CardTraderQuoteResolveService,
    CardtraderTransitLotService,
    StockScanService,
    BulkProductService,
    StockPhotoService,
    DashboardOverviewService,
    MetricsAnalyticsService,
    StockPvpBenchmarkService,
    StockReviewService,
    StockReviewSessionRepository,
    IncomingHomologService,
    CardtraderSentUnitRepository,
    IncomingHomologSessionRepository,
    IncomingBatchNovedadRepository,
    IncomingShipRoundCardUnitRepository,
    IncomingHomologNovedadStockRepository,
    CardtraderTransitLotRepository,
    CardtraderTransitLineRepository,
    CardtraderReceiptService,
    CardtraderReceiptSessionRepository,
    CardtraderReceiptLineRepository,
    PedidoRepository,
    PedidoAbonoRepository,
    PedidoService,
    PedidoAbonoService,
    EnvioGeocodeService,
    CardtraderQuoteSessionRepository,
    CardTraderQuoteSessionService,
    CardTraderCatalogSearchService,
    CardtraderOrdersHistorialService,
  ],
  imports: [
    ...OWNER_KEYS.flatMap((owner) => [
      MongooseModule.forRootAsync({
        connectionName: connectionNameFor(owner),
        useFactory: () => {
          const uri = process.env.MONGO_URI?.trim();
          if (!uri) {
            throw new Error(
              'MONGO_URI is required (set in .env). No embedded Mongo URI fallback.',
            );
          }
          return { uri, dbName: OWNERS_CONFIG.owners[owner].dbName };
        },
      }),
      MongooseModule.forFeature(
        MONGOOSE_FEATURE_MODELS,
        connectionNameFor(owner),
      ),
    ]),
    PokemonModule,
    TcgCatalogModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(OwnerMiddleware)
      .exclude({ path: 'health', method: RequestMethod.GET })
      .forRoutes('*');
    consumer.apply(AnalyticsCacheInvalidationMiddleware).forRoutes('*');
  }
}
