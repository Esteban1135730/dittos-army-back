/**
 * API pública del módulo Pokémon (conexión TCGdex y resolución de sets).
 * Importar desde `src/pokemon`. No reexportar inventario ni ventas.
 */
export { PokemonModule } from './pokemon.module';
export {
  TCGDexService,
  TCGDEX_SUPPORTED_LOCALES,
  buildCardLocaleFallbackChain,
} from './tcgdex/tcgdex.service';
export {
  LocalCardImagesService,
  resolveCardImagesRoot,
  inferSetIdFromCardId,
} from './tcgdex/local-card-images.service';
export { CardDto, mapCardFromApi } from './tcgdex/dto/card.dto';
export { CardResumeDto, mapCardResume } from './tcgdex/dto/card.resume.dto';
export { SetResumeDto, mapSetResume } from './tcgdex/dto/set.resume.dto';
export {
  resolveCardTraderHomologPath,
  loadTcgdexSetResolveIndex,
} from './tcgdex/tcgdex-homolog-loader';
export type {
  SetResolveMeta,
  TcgdexSetResolveIndex,
} from './tcgdex/tcgdex-homolog-loader';
export * from './tcgdex/tcgdex-set-resolve';
