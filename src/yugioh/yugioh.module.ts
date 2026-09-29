import { Module } from '@nestjs/common';
import { YugiohCatalogService } from './yugioh-catalog.service';
import { YugiohController } from './yugioh.controller';
import { YugiohStockService } from './yugioh-stock.service';
import { OwnerModelsService } from '../owner/owner-models.service';

/**
 * Catálogo Yu-Gi-Oh (YGOPRODeck). El stock y el resto de colecciones viven en
 * `yugioh-tefa` vía OwnerModelsService + X-Tcg (mismas schemas que Pokémon).
 */
@Module({
  controllers: [YugiohController],
  providers: [YugiohCatalogService, YugiohStockService, OwnerModelsService],
  exports: [YugiohCatalogService],
})
export class YugiohModule {}
