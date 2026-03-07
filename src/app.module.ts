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
import { TCGDexService } from './service/tcgdex/tcgdex.service';
import { StockController } from './controller/stock.controller';
import { PvpController } from './controller/pvp.controller';
import { CardController } from './controller/card.controller';
import { TcgDexController } from './controller/tcg-dex.controller';
import { SaleController } from './controller/sale.controller';
import { ClientController } from './controller/client.controller';
import { ReservaController } from './controller/reserva.controller';

@Module({
  controllers: [
    StockController,
    PvpController,
    SaleController,
    CardController,
    TcgDexController,
    ClientController,
    ReservaController,
  ],
  providers: [
    TCGDexService,
    StockRepository,
    PvpRepository,
    SaleRepository,
    ClientRepository,
    ReservaRepository,
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
    ]),
  ],
})
export class AppModule {}
