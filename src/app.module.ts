import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StockRepository } from './repository/stock.repository';
import { Stock, StockSchema } from './schema/stock.schema';
import { Pvp, PvpSchema } from './schema/pvp.schema';
import { Client, ClientSchema } from './schema/client.schema';
import { Reserva, ReservaSchema } from './schema/reserva.schema';
import { PvpRepository } from './repository/pvp.repository';
import { Sale, SaleSchema } from './schema/sale.schema';
import { SaleRepository } from './repository/sale.repository';
import { ClientRepository } from './repository/client.repository';
import { ReservaRepository } from './repository/reserva.repository';
import { IncomingBatchRepository } from './repository/incoming-batch.repository';
import { IncomingBatchItemRepository } from './repository/incoming-batch-item.repository';
import { IncomingRoundRepository } from './repository/incoming-round.repository';
import { IncomingRoundItemRepository } from './repository/incoming-round-item.repository';
import { TCGDexService } from './service/tcgdex/tcgdex.service';
import { StoreInventoryService } from './service/store-inventory.service';
import { OpenedSealedStockService } from './service/opened-sealed-stock.service';
import { PvpCardRowsService } from './service/pvp-card-rows.service';
import { StockController } from './controller/stock.controller';
import { PvpController } from './controller/pvp.controller';
import { CardController } from './controller/card.controller';
import { TcgDexController } from './controller/tcg-dex.controller';
import { SaleController } from './controller/sale.controller';
import { ClientController } from './controller/client.controller';
import { ReservaController } from './controller/reserva.controller';
import { IncomingController } from './controller/incoming.controller';
import { IncomingBatch, IncomingBatchSchema } from './schema/incoming-batch.schema';
import { IncomingBatchItem, IncomingBatchItemSchema } from './schema/incoming-batch-item.schema';
import { IncomingRound, IncomingRoundSchema } from './schema/incoming-round.schema';
import { IncomingRoundItem, IncomingRoundItemSchema } from './schema/incoming-round-item.schema';
import { IncomingShipRound, IncomingShipRoundSchema } from './schema/incoming-ship-round.schema';
import { IncomingShipRoundItem, IncomingShipRoundItemSchema } from './schema/incoming-ship-round-item.schema';
import { IncomingShipRoundController } from './controller/incoming-ship-round.controller';
import { IncomingShipRoundRepository } from './repository/incoming-ship-round.repository';
import { IncomingShipRoundItemRepository } from './repository/incoming-ship-round-item.repository';
import { IntegrationsModule } from './integrations/integrations.module';
import { BillingFactusService } from './service/billing-factus.service';
import { ElectronicInvoiceRepository } from './repository/electronic-invoice.repository';
import {
  ElectronicInvoice,
  ElectronicInvoiceSchema,
} from './schema/electronic-invoice.schema';
import { FactusBillingController } from './controller/factus-billing.controller';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';

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
    FactusBillingController,
  ],
  providers: [
    TCGDexService,
    StoreInventoryService,
    OpenedSealedStockService,
    PvpCardRowsService,
    StockRepository,
    PvpRepository,
    SaleRepository,
    ClientRepository,
    ReservaRepository,
    IncomingBatchRepository,
    IncomingBatchItemRepository,
    IncomingRoundRepository,
    IncomingRoundItemRepository,
    IncomingShipRoundRepository,
    IncomingShipRoundItemRepository,
    BillingFactusService,
    ElectronicInvoiceRepository,
  ],
  imports: [
    IntegrationsModule,
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/ditto-army',
      {
        family: 4,
        serverSelectionTimeoutMS: 60_000,
      },
    ),
    MongooseModule.forFeature([
      { name: Stock.name, schema: StockSchema },
      { name: Pvp.name, schema: PvpSchema },
      { name: Sale.name, schema: SaleSchema },
      { name: Client.name, schema: ClientSchema },
      { name: Reserva.name, schema: ReservaSchema },
      { name: IncomingBatch.name, schema: IncomingBatchSchema },
      { name: IncomingBatchItem.name, schema: IncomingBatchItemSchema },
      { name: IncomingRound.name, schema: IncomingRoundSchema },
      { name: IncomingRoundItem.name, schema: IncomingRoundItemSchema },
      { name: IncomingShipRound.name, schema: IncomingShipRoundSchema },
      { name: IncomingShipRoundItem.name, schema: IncomingShipRoundItemSchema },
      { name: ElectronicInvoice.name, schema: ElectronicInvoiceSchema },
    ]),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
