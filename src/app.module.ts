import { Module } from '@nestjs/common';
import { TCGDexService } from './service/tcgdex/tcgdex.service';
import { CardController } from './controller/card.controller';

@Module({
  imports: [],
  controllers: [CardController],
  providers: [TCGDexService],
})
export class AppModule {}
