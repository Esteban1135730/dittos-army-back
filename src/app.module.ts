import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
import { PvpRepository } from './repository/pvp.repository';
import { Sale, SaleSchema } from './schema/sale.schema';
import { SaleRepository } from './repository/sale.repository';
import { ClientRepository } from './repository/client.repository';
import { ReservaRepository } from './repository/reserva.repository';
import { ReservaIncomingRepository } from './repository/reserva-incoming.repository';
import { IncomingBatchRepository } from './repository/incoming-batch.repository';
import { IncomingBatchItemRepository } from './repository/incoming-batch-item.repository';
import { IncomingRoundRepository } from './repository/incoming-round.repository';
import { IncomingRoundItemRepository } from './repository/incoming-round-item.repository';
import { TCGDexService } from './service/tcgdex/tcgdex.service';
import { SetNameHomologsService } from './service/tcgdex/set-name-homologs.service';
import { LocalCardImagesService } from './service/tcgdex/local-card-images.service';
import { StoreInventoryService } from './service/store-inventory.service';
import { OpenedSealedStockService } from './service/opened-sealed-stock.service';
import { PvpCardRowsService } from './service/pvp-card-rows.service';
import { IncomingReservationService } from './service/incoming-reservation.service';
import { StoreWhatsAppReservationImportService } from './service/store-whatsapp-reservation-import.service';
import { StockController } from './controller/stock.controller';
import { PvpController } from './controller/pvp.controller';
import { CardController } from './controller/card.controller';
import { TcgDexController } from './controller/tcg-dex.controller';
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
import { CardTraderService } from './service/cardtrader/cardtrader.service';
import { CardTraderTcgdexResolveService } from './service/cardtrader/cardtrader-tcgdex-resolve.service';
import { StockScanService } from './service/stock-scan.service';
import { DashboardController } from './controller/dashboard.controller';
import { DashboardOverviewService } from './service/dashboard-overview.service';
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

@Module({
  controllers: [
    StockController,
    PvpController,
    SaleController,
    CardController,
    TcgDexController,
    ClientController,
    ReservaController,
    IncomingController,
    IncomingShipRoundController,
    CardTraderController,
    DashboardController,
    StockReviewController,
    IncomingHomologController,
  ],
  providers: [
    SetNameHomologsService,
    LocalCardImagesService,
    TCGDexService,
    StoreInventoryService,
    OpenedSealedStockService,
    PvpCardRowsService,
    IncomingReservationService,
    StoreWhatsAppReservationImportService,
    StockRepository,
    CardStockTagRepository,
    PvpRepository,
    SaleRepository,
    ClientRepository,
    ReservaRepository,
    ReservaIncomingRepository,
    IncomingBatchRepository,
    IncomingBatchItemRepository,
    IncomingRoundRepository,
    IncomingRoundItemRepository,
    IncomingShipRoundRepository,
    IncomingShipRoundItemRepository,
    CardTraderService,
    CardTraderTcgdexResolveService,
    StockScanService,
    DashboardOverviewService,
    StockReviewService,
    StockReviewSessionRepository,
    IncomingHomologService,
    CardtraderSentUnitRepository,
    IncomingHomologSessionRepository,
    IncomingBatchNovedadRepository,
    IncomingShipRoundCardUnitRepository,
    IncomingHomologNovedadStockRepository,
  ],
  imports: [
    MongooseModule.forRoot(
      'mongodb+srv://pabloangola97:aaySea7SeIvobAlb@local-database.r04uoca.mongodb.net',
    ),
    MongooseModule.forFeature([
      { name: Stock.name, schema: StockSchema },
      { name: CardStockTag.name, schema: CardStockTagSchema },
      { name: Pvp.name, schema: PvpSchema },
      { name: Sale.name, schema: SaleSchema },
      { name: Client.name, schema: ClientSchema },
      { name: Reserva.name, schema: ReservaSchema },
      { name: ReservaIncoming.name, schema: ReservaIncomingSchema },
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
    ]),
  ],
})
export class AppModule {}
