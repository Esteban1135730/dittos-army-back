import { databaseNameFor } from '../config/owners.config';

/** Physical DB `{tcg}-{owner}` for Yu-Gi-Oh (único owner: Tefa). */
export const YUGIOH_TEFA_DB = databaseNameFor('yugioh', 'tefa');

export const YUGIOH_TEFA_CONNECTION = 'yugioh-tefa';

export const YGOPRODECK_API = 'https://db.ygoprodeck.com/api/v7';
