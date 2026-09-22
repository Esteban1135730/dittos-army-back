import { Injectable } from '@nestjs/common';
import TCGdex, { CardResume, Query } from '@tcgdex/sdk';
import _ from 'lodash';
import { mapSetResume, SetResumeDto } from './dto/set.resume.dto';
import { CardDto, mapCardFromApi } from './dto/card.dto';
import { isPublicRemoteImageUrl } from '../../utils/store-image-localize';
import {
  officialPokemonComCardImageUrl,
  sanitizeCardImageUrl,
  tcgdexJaSwordShieldCdnUrl,
  tcgdexJaSwordShieldCdnUrlFromCardId,
} from '../../utils/card-image-url';
import type { TCGdexCardApiResponse } from './dto/tcgdex-api.types';
import { CardResumeDto, mapCardResume } from './dto/card.resume.dto';
import { SetNameHomologsService } from './set-name-homologs.service';
import { LocalCardImagesService } from './local-card-images.service';
import {
  storeCardMetaFromDto,
  resolveStoreExportCardMeta,
  isUnreliableStoreCardName,
  type StoreCardExportMeta,
} from '../../utils/store-card-meta';
import {
  buildTcgdexCardIdLookupCandidates,
  tcgDexCatalogLocaleForExpansion,
} from '../../utils/tcgdex-set-resolve';
import {
  parseExpansionFromSetField,
  parseSetIdFromSetField,
} from '../../utils/store-card-meta';

export const TCGDEX_SUPPORTED_LOCALES = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'ja',
  'ko',
  'zh-cn',
  'zh-tw',
] as const;

export type TcgDexLocale = (typeof TCGDEX_SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: TcgDexLocale = 'en';

/** Locales to try when a card id exists only in a regional catalog (e.g. ja / zh-cn). */
export function buildCardLocaleFallbackChain(
  preferred: TcgDexLocale,
): TcgDexLocale[] {
  const western: TcgDexLocale[] = ['en', 'es', 'fr', 'de', 'it', 'pt'];
  if (western.includes(preferred) && preferred !== 'en') {
    const chain: TcgDexLocale[] = [preferred, 'en'];
    for (const locale of ['ja', 'zh-cn'] as const) {
      if (!chain.includes(locale)) chain.push(locale);
    }
    return chain;
  }
  const chain: TcgDexLocale[] = [preferred];
  for (const locale of ['ja', 'zh-cn', 'en'] as const) {
    if (!chain.includes(locale)) {
      chain.push(locale);
    }
  }
  return chain;
}

export const TCGDEX_PRODUCTION_API_BASE = 'https://api.tcgdex.net/v2';

/**
 * Base URL de la API v2 (sin barra final).
 * Dev local: `TCGDEX_PORT` → `http://localhost:{puerto}/v2`.
 * Override explícito: `TCGDEX_API_BASE_URL`.
 */
export function resolveTcgdexApiBaseUrl(): string {
  const fromEnv = process.env.TCGDEX_API_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  const localPort = process.env.TCGDEX_PORT?.trim();
  if (localPort) {
    return `http://localhost:${localPort}/v2`;
  }
  return TCGDEX_PRODUCTION_API_BASE;
}

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

@Injectable()
export class TCGDexService {
  private readonly apiBaseUrl = resolveTcgdexApiBaseUrl();

  constructor(
    private readonly setNameHomologs: SetNameHomologsService,
    private readonly localCardImages: LocalCardImagesService,
  ) {
    if (this.apiBaseUrl !== TCGDEX_PRODUCTION_API_BASE) {
      console.warn(`[TCGDexService] API TCGdex local: ${this.apiBaseUrl}`);
    }
  }

  private readonly clients = new Map<TcgDexLocale, TCGdex>();
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  private readonly TTL_SETS_MS = 24 * 60 * 60 * 1000;
  private readonly TTL_SET_CARDS_MS = 24 * 60 * 60 * 1000;
  private readonly TTL_CARD_SEARCH_MS = 10 * 60 * 1000;
  private readonly TTL_CARD_DETAIL_MS = 24 * 60 * 60 * 1000;

  private getClient(locale: TcgDexLocale): TCGdex {
    const current = this.clients.get(locale);
    if (current) {
      return current;
    }
    // El SDK tipa menos locales que los realmente disponibles en la API.
    const created = new TCGdex(locale as any);
    created.setEndpoint(this.apiBaseUrl);
    this.clients.set(locale, created);
    return created;
  }

  normalizeLocale(locale?: string): TcgDexLocale {
    if (!locale) {
      return DEFAULT_LOCALE;
    }
    const normalized = locale.trim().toLowerCase();
    if ((TCGDEX_SUPPORTED_LOCALES as readonly string[]).includes(normalized)) {
      return normalized as TcgDexLocale;
    }
    return DEFAULT_LOCALE;
  }

  isSupportedLocale(locale?: string): locale is TcgDexLocale {
    if (!locale) return false;
    const normalized = locale.trim().toLowerCase();
    return (TCGDEX_SUPPORTED_LOCALES as readonly string[]).includes(normalized);
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private setCached<T>(key: string, value: T, ttlMs: number): T {
    this.cache.set(key, { expiresAt: Date.now() + ttlMs, value });
    return value;
  }

  async getSets(locale?: string): Promise<SetResumeDto[] | null> {
    const normalizedLocale = this.normalizeLocale(locale);
    const cacheKey = `${normalizedLocale}:sets`;
    const cached = this.getCached<SetResumeDto[] | null>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const response = await this.getClient(normalizedLocale).set.list();

    let englishById: Map<string, string> | undefined;
    if (normalizedLocale !== DEFAULT_LOCALE) {
      const englishResponse = await this.getClient(DEFAULT_LOCALE).set.list();
      englishById = new Map(englishResponse.map((set) => [set.id, set.name]));
    }

    return this.setCached(
      cacheKey,
      response.map((res) => {
        const homologEnglish = this.setNameHomologs.getEnglishLabel(
          normalizedLocale,
          res.id,
          res.name,
        );
        const englishName =
          homologEnglish ??
          englishById?.get(res.id) ??
          (normalizedLocale === DEFAULT_LOCALE ? res.name : undefined);
        return mapSetResume(res, englishName);
      }),
      this.TTL_SETS_MS,
    );
  }

  async getSetCards(
    setId: string,
    locale?: string,
  ): Promise<CardResumeDto[] | undefined> {
    const normalizedLocale = this.normalizeLocale(locale);
    const cacheKey = `${normalizedLocale}:set-cards:${setId}`;
    const cached = this.getCached<CardResumeDto[] | undefined>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const response = await this.getClient(normalizedLocale).set.get(setId);
    const cards = response?.cards.map((card) => {
      const dto = mapCardResume(card);
      const remoteImageBase =
        typeof (card as { image?: string }).image === 'string'
          ? (card as { image: string }).image
          : undefined;
      const urls = this.localCardImages.applyRemoteFallback(
        {
          cardId: dto.id,
          locale: normalizedLocale,
          setId,
          remoteImageBase,
        },
        {
          image: dto.image ?? '',
          small: dto.image ?? '',
          large: dto.image ?? '',
        },
      );
      return { ...dto, image: urls.small };
    });
    return this.setCached(cacheKey, cards, this.TTL_SET_CARDS_MS);
  }

  async findCardByName(
    cardName: string,
    locale?: string,
  ): Promise<CardResumeDto[] | undefined> {
    const normalizedLocale = this.normalizeLocale(locale);
    const cacheKey = `${normalizedLocale}:card-search:${cardName.trim().toLowerCase()}`;
    const cached = this.getCached<CardResumeDto[] | undefined>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const cards = await this.getClient(normalizedLocale).card.list(
      Query.create().contains('name', cardName),
    );
    const mapped = cards.map((card) => {
      const dto = mapCardResume(card);
      const remoteImageBase =
        typeof (card as { image?: string }).image === 'string'
          ? (card as { image: string }).image
          : undefined;
      const setIdFromCard = (card as { set?: { id?: string } }).set?.id;
      const urls = this.localCardImages.applyRemoteFallback(
        {
          cardId: dto.id,
          locale: normalizedLocale,
          setId: setIdFromCard,
          remoteImageBase,
        },
        {
          image: dto.image ?? '',
          small: dto.image ?? '',
          large: dto.image ?? '',
        },
      );
      return { ...dto, image: urls.small };
    });
    return this.setCached(cacheKey, mapped, this.TTL_CARD_SEARCH_MS);
  }

  /**
   * Obtiene una carta con precios de mercado desde la API TCGdex (pricing TCGplayer/Cardmarket).
   * Usa el id tal cual; sin mapeo entre APIs. Si falla en el locale pedido, prueba ja / zh-cn / en.
   */
  async getCard(cardId: string, locale?: string): Promise<CardDto | undefined> {
    if (!cardId || typeof cardId !== 'string') {
      console.error('[TCGDexService] getCard: cardId inválido', { cardId });
      return undefined;
    }
    const id = cardId.trim();
    if (!id) {
      console.error('[TCGDexService] getCard: cardId vacío después de trim', {
        cardId,
      });
      return undefined;
    }

    const preferredLocale = this.normalizeLocale(locale);
    const candidates = buildTcgdexCardIdLookupCandidates(id, locale);
    for (const candidate of candidates) {
      for (const tryLocale of buildCardLocaleFallbackChain(preferredLocale)) {
        const card = await this.fetchCardForLocale(candidate, tryLocale);
        if (card) {
          return card;
        }
      }
    }
    return undefined;
  }

  /** Lookup exacto (sin candidatos ni fallback de locale). Para colisiones `{id}_{blueprintId}`. */
  async getCardExact(
    cardId: string,
    locale?: string,
  ): Promise<CardDto | undefined> {
    const id = typeof cardId === 'string' ? cardId.trim() : '';
    if (!id) return undefined;
    return this.fetchCardForLocale(id, this.normalizeLocale(locale));
  }

  private async fetchCardForLocale(
    id: string,
    normalizedLocale: TcgDexLocale,
  ): Promise<CardDto | undefined> {
    const cacheKey = `${normalizedLocale}:card:${id}`;
    const cached = this.getCached<CardDto | undefined>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const url = `${this.apiBaseUrl}/${normalizedLocale}/cards/${encodeURIComponent(id)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return undefined;
      }
      const raw = (await res.json()) as TCGdexCardApiResponse;
      if (!raw || typeof raw !== 'object' || !raw.name) {
        return undefined;
      }
      const dto = mapCardFromApi(raw);
      if (!dto.setEnglishName && raw.set?.id) {
        const homologEnglish = this.setNameHomologs.getEnglishLabel(
          normalizedLocale,
          raw.set.id,
          raw.set.name,
        );
        if (homologEnglish) {
          dto.setEnglishName = homologEnglish;
        }
      }
      const urls = this.localCardImages.applyRemoteFallback(
        {
          cardId: id,
          locale: normalizedLocale,
          setId: raw.set?.id,
          remoteImageBase: raw.image,
        },
        {
          image: dto.image,
          small: dto.images.small,
          large: dto.images.large,
        },
      );
      dto.image = urls.image;
      dto.images = { small: urls.small, large: urls.large };
      return this.setCached(cacheKey, dto, this.TTL_CARD_DETAIL_MS);
    } catch (err) {
      console.error('[TCGDexService] getCard: excepción al llamar TCGdex', {
        cardId: id,
        url,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  /**
   * Metadatos para export de tienda: prueba variantes de id TCGdex y descarta nombres corruptos.
   */
  async resolveStoreExportMeta(
    cardId: string,
    language?: string,
    sourceName?: string | null,
  ): Promise<StoreCardExportMeta | undefined> {
    const candidates = buildTcgdexCardIdLookupCandidates(cardId, language);
    if (candidates.length === 0) return undefined;

    let localizedMeta: StoreCardExportMeta | undefined;
    let englishMeta: StoreCardExportMeta | undefined;

    for (const id of candidates) {
      const card = await this.getCard(id, language);
      if (card && !isUnreliableStoreCardName(card.name)) {
        localizedMeta = storeCardMetaFromDto(card);
        break;
      }
    }

    for (const id of candidates) {
      const card = await this.getCard(id, 'en');
      if (card && !isUnreliableStoreCardName(card.name)) {
        englishMeta = storeCardMetaFromDto(card);
        break;
      }
    }

    if (
      !localizedMeta &&
      !englishMeta &&
      isUnreliableStoreCardName(sourceName)
    ) {
      return undefined;
    }

    return resolveStoreExportCardMeta({
      cardId,
      sourceName,
      localized: localizedMeta,
      english: englishMeta,
    });
  }

  /**
   * Imagen pública en CDN TCGdex (API de producción).
   * Fallback del export de tienda cuando no hay archivo local que copiar.
   */
  async getRemoteStoreCardImageUrl(
    cardId: string,
    locale?: string,
  ): Promise<string | undefined> {
    const lookup = await this.lookupProductionCardImage(cardId, locale);
    return lookup.status === 'found' ? lookup.url : undefined;
  }

  /**
   * Distingue carta con arte en **nube** vs 404 vs error de red.
   * No usa el endpoint TCGdex local (`TCGDEX_PORT`).
   */
  async lookupProductionCardImage(
    cardId: string,
    locale?: string,
  ): Promise<
    | { status: 'found'; url: string }
    | { status: 'missing' }
    | { status: 'error' }
  > {
    if (!cardId || typeof cardId !== 'string') return { status: 'missing' };
    const id = cardId.trim();
    if (!id) return { status: 'missing' };

    const preferredLocale = this.normalizeLocale(locale);
    const candidates = buildTcgdexCardIdLookupCandidates(id, locale);
    let sawError = false;
    for (const tryLocale of buildCardLocaleFallbackChain(preferredLocale)) {
      for (const candidateId of candidates) {
        const hit = await this.fetchProductionImageStatus(
          candidateId,
          tryLocale,
        );
        if (hit.status === 'found') return hit;
        if (hit.status === 'error') sawError = true;
      }
    }
    const cdn = tcgdexJaSwordShieldCdnUrlFromCardId(id);
    if (cdn && (await this.probePublicImageUrl(cdn))) {
      return { status: 'found', url: cdn };
    }
    if (sawError) return { status: 'error' };
    return { status: 'missing' };
  }

  private async fetchProductionImageStatus(
    id: string,
    normalizedLocale: TcgDexLocale,
  ): Promise<
    | { status: 'found'; url: string }
    | { status: 'missing' }
    | { status: 'error' }
  > {
    const cacheKey = `remote-store-img-status:${normalizedLocale}:${id}`;
    const cached = this.getCached<
      { status: 'found'; url: string } | { status: 'missing' }
    >(cacheKey);
    if (cached) return cached;

    const url = `${TCGDEX_PRODUCTION_API_BASE}/${normalizedLocale}/cards/${encodeURIComponent(id)}`;
    try {
      const res = await fetch(url);
      if (res.status === 404) {
        return this.setCached(cacheKey, { status: 'missing' }, this.TTL_CARD_DETAIL_MS);
      }
      if (!res.ok) return { status: 'error' };
      const raw = (await res.json()) as TCGdexCardApiResponse;
      if (!raw || typeof raw !== 'object' || !raw.name) {
        return this.setCached(cacheKey, { status: 'missing' }, this.TTL_CARD_DETAIL_MS);
      }
      const dto = mapCardFromApi(raw);
      const candidate =
        sanitizeCardImageUrl(dto.images?.small || dto.image || '') ||
        officialPokemonComCardImageUrl(raw.set?.id, raw.localId) ||
        tcgdexJaSwordShieldCdnUrl(raw.set?.id, raw.localId) ||
        '';
      if (!isPublicRemoteImageUrl(candidate)) {
        return this.setCached(cacheKey, { status: 'missing' }, this.TTL_CARD_DETAIL_MS);
      }
      return this.setCached(
        cacheKey,
        { status: 'found', url: candidate },
        this.TTL_CARD_DETAIL_MS,
      );
    } catch (err) {
      console.warn('[TCGDexService] lookup TCGdex nube falló', {
        cardId: id,
        locale: normalizedLocale,
        url,
        error: err instanceof Error ? err.message : String(err),
      });
      return { status: 'error' };
    }
  }

  private async probePublicImageUrl(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async fetchRemoteStoreImageForLocale(
    id: string,
    normalizedLocale: TcgDexLocale,
  ): Promise<string | undefined> {
    const hit = await this.fetchProductionImageStatus(id, normalizedLocale);
    return hit.status === 'found' ? hit.url : undefined;
  }

  /**
   * Carta en un locale concreto (sin cadena ja/zh/en). Prueba variantes de id según idioma.
   */
  async getCardStrictLocale(
    cardId: string,
    locale: TcgDexLocale,
    language?: string | null,
  ): Promise<CardDto | undefined> {
    const candidates = buildTcgdexCardIdLookupCandidates(cardId, language);
    for (const id of candidates) {
      const card = await this.fetchCardForLocale(id, locale);
      if (card) return card;
    }
    return undefined;
  }

  /**
   * Nombre de expansión en inglés para etiquetas/escaneo:
   * catálogo regional según idioma de stock (en / ja / zh-cn) + homologación EN en BD.
   */
  async resolveEnglishExpansionName(
    cardId: string,
    language?: string | null,
  ): Promise<string> {
    const catalogLocale = tcgDexCatalogLocaleForExpansion(language);
    const fetchLocale: TcgDexLocale =
      catalogLocale === 'zh-tw' ? 'zh-cn' : catalogLocale;
    const candidates = buildTcgdexCardIdLookupCandidates(cardId, language);

    let setId = '';
    let localizedSetName = '';

    for (const id of candidates) {
      const card = await this.fetchCardForLocale(id, fetchLocale);
      if (card?.set) {
        setId = parseSetIdFromSetField(card.set) ?? '';
        localizedSetName = parseExpansionFromSetField(card.set) ?? '';
        break;
      }
    }

    if (setId) {
      const homologEnglish = this.setNameHomologs.getEnglishLabel(
        catalogLocale,
        setId,
        localizedSetName,
      );
      if (homologEnglish) return homologEnglish;
    }

    for (const id of candidates) {
      const enCard = await this.fetchCardForLocale(id, 'en');
      if (enCard?.set) {
        const enName = parseExpansionFromSetField(enCard.set);
        if (enName) return enName;
      }
    }

    if (catalogLocale === 'en' && localizedSetName) {
      return localizedSetName;
    }

    return '';
  }

  async getCardSet(
    cardId: string,
    locale?: string,
  ): Promise<string | undefined> {
    const normalizedLocale = this.normalizeLocale(locale);
    const card = await this.getClient(normalizedLocale).card.get(cardId);
    if (card) {
      return card.set.id;
    }
  }
}
