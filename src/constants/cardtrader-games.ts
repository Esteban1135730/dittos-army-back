/** CardTrader `game_id` values (GET /games). */
export const CARDTRADER_POKEMON_GAME_ID = 5;
export const CARDTRADER_YUGIOH_GAME_ID = 4;

export const CARDTRADER_SUPPORTED_GAME_IDS = [
  CARDTRADER_POKEMON_GAME_ID,
  CARDTRADER_YUGIOH_GAME_ID,
] as const;

export type CardTraderGameId = (typeof CARDTRADER_SUPPORTED_GAME_IDS)[number];

export function isCardTraderGameId(value: number): value is CardTraderGameId {
  return (CARDTRADER_SUPPORTED_GAME_IDS as readonly number[]).includes(value);
}

export function cardTraderGameIdForTcg(
  tcg: 'pokemon' | 'yugioh',
): CardTraderGameId {
  return tcg === 'yugioh'
    ? CARDTRADER_YUGIOH_GAME_ID
    : CARDTRADER_POKEMON_GAME_ID;
}
