import { TCGDexService } from '../service/tcgdex/tcgdex.service';
import { Card, Set } from 'pokemon-tcg-sdk-typescript/dist/sdk';
export declare class CardController {
    private readonly tcgService;
    constructor(tcgService: TCGDexService);
    getSets(): Promise<Set[] | null>;
    getCardsSets(params: any): Promise<Card[] | null>;
    getCard(params: any): Promise<Card | null>;
}
