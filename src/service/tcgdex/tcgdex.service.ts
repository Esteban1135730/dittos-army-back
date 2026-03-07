import { Injectable } from '@nestjs/common';
import TCGdex, { CardResume, Query } from '@tcgdex/sdk';
import _ from 'lodash';
import { mapSetResume, SetResumeDto } from './dto/set.resume.dto';
import { CardDto, mapCardFromApi } from './dto/card.dto';
import type { TCGdexCardApiResponse } from './dto/tcgdex-api.types';
import { CardResumeDto, mapCardResume } from './dto/card.resume.dto';

@Injectable()
export class TCGDexService {
  tcgdex = new TCGdex('en');

  async getSets(): Promise<SetResumeDto[] | null> {
    const response = await this.tcgdex.set.list();
    return response.map((res) => mapSetResume(res));
  }

  async getSetCards(setId: string): Promise<CardResumeDto[] | undefined> {
    const response = await this.tcgdex.set.get(setId);
    return response?.cards.map((card) => mapCardResume(card));
  }

  async findCardByName(cardName: string): Promise<CardResumeDto[] | undefined> {
    const cards = await this.tcgdex.card.list(
      Query.create().contains('name', cardName),
    );
    return cards.map((card) => mapCardResume(card));
  }

  /**
   * Obtiene una carta con precios de mercado desde la API TCGdex (pricing TCGplayer/Cardmarket).
   * Usa el id tal cual; sin mapeo entre APIs.
   */
  async getCard(cardId: string): Promise<CardDto | undefined> {
    if (!cardId || typeof cardId !== 'string') {
      console.error('[TCGDexService] getCard: cardId inválido', { cardId });
      return undefined;
    }
    const id = cardId.trim();
    if (!id) {
      console.error('[TCGDexService] getCard: cardId vacío después de trim', { cardId });
      return undefined;
    }

    const url = `https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error('[TCGDexService] getCard: API TCGdex respondió con error', {
          cardId: id,
          status: res.status,
          statusText: res.statusText,
        });
        return undefined;
      }
      const raw = await res.json() as TCGdexCardApiResponse;
      if (!raw || typeof raw !== 'object' || !raw.name) {
        console.error('[TCGDexService] getCard: respuesta sin nombre de carta', {
          cardId: id,
          hasRaw: !!raw,
          hasName: !!(raw && raw.name),
        });
        return undefined;
      }
      return mapCardFromApi(raw);
    } catch (err) {
      console.error('[TCGDexService] getCard: excepción al llamar TCGdex', {
        cardId: id,
        url,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  async getCardSet(cardId: string): Promise<string | undefined> {
    const card = await this.tcgdex.card.get(cardId);
    if (card) {
      return card.set.id;
    }
  }
}
