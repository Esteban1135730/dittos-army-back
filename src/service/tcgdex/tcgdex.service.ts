import { Injectable } from '@nestjs/common';
import TCGdex, { CardResume, Query } from '@tcgdex/sdk';
import _ from 'lodash';
import { mapSetResume, SetResumeDto } from './dto/set.resume.dto';
import { CardDto, mapCardFromApi } from './dto/card.dto';
import type { TCGdexCardApiResponse } from './dto/tcgdex-api.types';
import { CardResumeDto, mapCardResume } from './dto/card.resume.dto';
import { SetNameHomologsService } from './set-name-homologs.service';
import { LocalCardImagesService } from './local-card-images.service';

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
] as const;

export type TcgDexLocale = (typeof TCGDEX_SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: TcgDexLocale = 'en';

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

@Injectable()
export class TCGDexService {
  constructor(
    private readonly setNameHomologs: SetNameHomologsService,
    private readonly localCardImages: LocalCardImagesService,
  ) {}

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
   * Usa el id tal cual; sin mapeo entre APIs.
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

    const normalizedLocale = this.normalizeLocale(locale);
    const cacheKey = `${normalizedLocale}:card:${id}`;
    const cached = this.getCached<CardDto | undefined>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const url = `https://api.tcgdex.net/v2/${normalizedLocale}/cards/${encodeURIComponent(id)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(
          '[TCGDexService] getCard: API TCGdex respondió con error',
          {
            cardId: id,
            status: res.status,
            statusText: res.statusText,
          },
        );
        return undefined;
      }
      const raw = (await res.json()) as TCGdexCardApiResponse;
      if (!raw || typeof raw !== 'object' || !raw.name) {
        console.error(
          '[TCGDexService] getCard: respuesta sin nombre de carta',
          {
            cardId: id,
            hasRaw: !!raw,
            hasName: !!(raw && raw.name),
          },
        );
        return undefined;
      }
      const dto = mapCardFromApi(raw);
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
