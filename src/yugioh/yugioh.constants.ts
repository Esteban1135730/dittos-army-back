import { databaseNameFor } from '../config/owners.config';

/** Physical DB `{tcg}-{owner}` for the Yu-Gi-Oh MVP. */
export const YUGIOH_PABLO_DB = databaseNameFor('yugioh', 'pablo');
export const YUGIOH_ESTEBAN_DB = databaseNameFor('yugioh', 'esteban');

export const YUGIOH_PABLO_CONNECTION = 'yugioh-pablo';
export const YUGIOH_ESTEBAN_CONNECTION = 'yugioh-esteban';

export const YGOPRODECK_API = 'https://db.ygoprodeck.com/api/v7';
