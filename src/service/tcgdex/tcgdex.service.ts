import { Injectable } from '@nestjs/common';
import TCGdex, { CardResume, Query } from '@tcgdex/sdk';
import _ from 'lodash';
import { mapSetResume, SetResumeDto } from './dto/set.resume.dto';
import { CardDto, mapCard } from './dto/card.dto';
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

  async getCard(cardId: string): Promise<CardDto | undefined> {
    const card = await this.tcgdex.card.get(cardId);
    if (card) {
      return mapCard(card, card.getImageURL('low', 'png'));
    }
  }

  async getCardSet(cardId: string): Promise<string | undefined> {
    const card = await this.tcgdex.card.get(cardId);
    if (card) {
      return card.set.id;
    }
  }
}
