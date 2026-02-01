import { Module } from '@nestjs/common';
import { TCGSdkService } from './service/tcg-sdk.service';
import { MongooseModule } from '@nestjs/mongoose';
import { StockRepository } from './repository/stock.repository';
import { Stock, StockSchema } from './schema/stock.schema';
import { Pvp, PvpSchema } from './schema/pvp.schema';
import { PvpRepository } from './repository/pvp.repository';
import { Sale, SaleSchema } from './schema/sale.schema';
import { SaleRepository } from './repository/sale.repository';
import { TCGDexService } from './service/tcgdex/tcgdex.service';
import { StockController } from './controller/stock.controller';
import { PvpController } from './controller/pvp.controller';
import { TcgDexController } from './controller/tcg-dex.controller';
import { TcgSdkController } from './controller/tcg-sdk.controller';
import { SaleController } from './controller/sale.controller';

@Module({
  controllers: [
    StockController,
    PvpController,
    SaleController,
    TcgDexController,
    TcgSdkController,
  ],
  providers: [
    TCGSdkService,
    TCGDexService,
    StockRepository,
    PvpRepository,
    SaleRepository,
  ],
  imports: [
    MongooseModule.forRoot(
      'mongodb+srv://pabloangola97:aaySea7SeIvobAlb@local-database.r04uoca.mongodb.net',
    ),
    MongooseModule.forFeature([
      { name: Stock.name, schema: StockSchema },
      { name: Pvp.name, schema: PvpSchema },
      { name: Sale.name, schema: SaleSchema },
    ]),
  ],
})
export class AppModule {}
