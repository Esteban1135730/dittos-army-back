import { BadRequestException, Injectable } from '@nestjs/common';
import type { TcgKey } from '../config/owners.config';
import { MagicCatalogService } from './providers/magic-catalog.service';
import { OnePieceCatalogService } from './providers/onepiece-catalog.service';
import { YugiohCatalogService } from './providers/yugioh-catalog.service';
import type { CatalogTcg, TcgCatalogProvider } from './tcg-catalog.types';

@Injectable()
export class TcgCatalogRegistry {
  private readonly providers: Record<CatalogTcg, TcgCatalogProvider>;

  constructor(
    yugioh: YugiohCatalogService,
    magic: MagicCatalogService,
    onepiece: OnePieceCatalogService,
  ) {
    this.providers = { yugioh, magic, onepiece };
  }

  forTcg(tcg: TcgKey): TcgCatalogProvider {
    if (tcg === 'pokemon') {
      throw new BadRequestException(
        'Pokémon usa el catálogo TCGdex; este endpoint es para otros TCG',
      );
    }
    return this.providers[tcg];
  }
}
