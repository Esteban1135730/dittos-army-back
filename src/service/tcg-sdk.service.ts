import { Injectable } from '@nestjs/common';
import { PokemonTCG } from 'pokemon-tcg-sdk-typescript';

import _ from 'lodash';
import { Card, Set } from 'pokemon-tcg-sdk-typescript/dist/sdk';

@Injectable()
export class TCGSdkService {

  async getSets(): Promise<Set[] | null> {
    return await PokemonTCG.getAllSets();
  }

  async getSetCards(setId: string): Promise<Card[] | null> {
    const paramsV2: PokemonTCG.Parameter = { q: `set.id:${setId}` };
    return await PokemonTCG.findCardsByQueries(paramsV2);
  }

  async getCard(id: string): Promise<Card | null> {
    return await PokemonTCG.findCardByID(id);
  }

  async findCardByName(name: string): Promise<Card[] | null> {
    const paramsV2: PokemonTCG.Parameter = { q: `name:${name}` };
    return await PokemonTCG.findCardsByQueries(paramsV2);
  }
}
