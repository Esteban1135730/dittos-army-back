import { Module } from '@nestjs/common';
import { CardController } from './tcgdex/card.controller';
import { LocalCardImagesService } from './tcgdex/local-card-images.service';
import { SetNameHomologsService } from './tcgdex/set-name-homologs.service';
import { TcgDexController } from './tcgdex/tcg-dex.controller';
import { TCGDexService } from './tcgdex/tcgdex.service';

/**
 * Catálogo Pokémon (TCGdex). El inventario, las ventas y CardTrader viven fuera
 * y consumen este módulo; no al revés.
 */
@Module({
  controllers: [CardController, TcgDexController],
  providers: [SetNameHomologsService, LocalCardImagesService, TCGDexService],
  exports: [LocalCardImagesService, TCGDexService],
})
export class PokemonModule {}
