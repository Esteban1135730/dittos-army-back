import { Module } from '@nestjs/common';
import { TCGSdkService } from './service/tcg-sdk.service';
import { MongooseModule } from '@nestjs/mongoose';
import { StockRepository } from './repository/stock.repository';
import { Stock, StockSchema } from './schema/stock.schema';
import { TCGDexService } from './service/tcgdex/tcgdex.service';
import { StockController } from './controller/stock.controller';
import { TcgDexController } from './controller/tcg-dex.controller';
import { TcgSdkController } from './controller/tcg-sdk.controller';

@Module({
  controllers: [StockController, TcgDexController, TcgSdkController],
  providers: [TCGSdkService, TCGDexService, StockRepository],
  imports: [
    MongooseModule.forRoot(
      'mongodb+srv://pabloangola97:aaySea7SeIvobAlb@local-database.r04uoca.mongodb.net',
    ),
    MongooseModule.forFeature([{ name: Stock.name, schema: StockSchema }]),
  ],
})
export class AppModule {}
