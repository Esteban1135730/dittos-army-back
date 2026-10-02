import type { TcgKey } from '../config/owners.config';

/** CardTrader `game_id` values (GET /games). */
export const CARDTRADER_MAGIC_GAME_ID = 1;
export const CARDTRADER_YUGIOH_GAME_ID = 4;
export const CARDTRADER_POKEMON_GAME_ID = 5;
export const CARDTRADER_ONEPIECE_GAME_ID = 15;

export const CARDTRADER_GAME_ID_BY_TCG = {
  pokemon: CARDTRADER_POKEMON_GAME_ID,
  yugioh: CARDTRADER_YUGIOH_GAME_ID,
  magic: CARDTRADER_MAGIC_GAME_ID,
  onepiece: CARDTRADER_ONEPIECE_GAME_ID,
} as const satisfies Record<TcgKey, number>;

export const CARDTRADER_SUPPORTED_GAME_IDS = Object.values(
  CARDTRADER_GAME_ID_BY_TCG,
);

export type CardTraderGameId =
  (typeof CARDTRADER_GAME_ID_BY_TCG)[keyof typeof CARDTRADER_GAME_ID_BY_TCG];

export function isCardTraderGameId(value: number): value is CardTraderGameId {
  return (CARDTRADER_SUPPORTED_GAME_IDS as readonly number[]).includes(value);
}

export function cardTraderGameIdForTcg(tcg: TcgKey): CardTraderGameId {
  return CARDTRADER_GAME_ID_BY_TCG[tcg];
}

export function tcgForCardTraderGameId(gameId: number): TcgKey | null {
  for (const [tcg, id] of Object.entries(CARDTRADER_GAME_ID_BY_TCG)) {
    if (id === gameId) return tcg as TcgKey;
  }
  return null;
}
