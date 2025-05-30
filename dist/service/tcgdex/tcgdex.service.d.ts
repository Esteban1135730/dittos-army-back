import { Card, Set } from 'pokemon-tcg-sdk-typescript/dist/sdk';
export declare class TCGDexService {
    getSets(): Promise<Set[] | null>;
    getSetCards(setId: string): Promise<Card[] | null>;
    getCard(id: string): Promise<Card | null>;
}
