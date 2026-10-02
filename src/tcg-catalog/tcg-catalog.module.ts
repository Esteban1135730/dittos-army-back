import { Module } from '@nestjs/common';
import { OwnerModelsService } from '../owner/owner-models.service';
import { CatalogStockService } from './catalog-stock.service';
import { MagicCatalogService } from './providers/magic-catalog.service';
import { OnePieceCatalogService } from './providers/onepiece-catalog.service';
import { YugiohCatalogService } from './providers/yugioh-catalog.service';
import { TcgCatalogController } from './tcg-catalog.controller';
import { TcgCatalogRegistry } from './tcg-catalog.registry';

/**
 * Catálogos externos (YGOPRODeck, Scryfall, optcgapi) para TCG no Pokémon.
 * El stock vive en `{tcg}-{owner}` vía OwnerModelsService (mismas schemas).
 */
@Module({
  controllers: [TcgCatalogController],
  providers: [
    YugiohCatalogService,
    MagicCatalogService,
    OnePieceCatalogService,
    TcgCatalogRegistry,
    CatalogStockService,
    OwnerModelsService,
  ],
  exports: [TcgCatalogRegistry],
})
export class TcgCatalogModule {}
