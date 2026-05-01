import { Module } from '@nestjs/common';
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
  ],
  providers: [
    TCGDexService,
    StoreInventoryService,
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
  ],
  imports: [
    MongooseModule.forRoot(
      'mongodb+srv://pabloangola97:aaySea7SeIvobAlb@local-database.r04uoca.mongodb.net',
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
    ]),
  ],
})
export class AppModule {}
