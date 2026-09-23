import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import {
  ESTEBAN_CONNECTION_NAME,
  type OwnerKey,
} from '../config/owners.config';
import {
  YUGIOH_ESTEBAN_CONNECTION,
  YUGIOH_PABLO_CONNECTION,
} from '../yugioh/yugioh.constants';
import { getCurrentOwner } from './owner-context';
import { getCurrentTcg, type ActiveTcg } from './tcg-context';

/**
 * Returns Mongoose models bound to the active owner's database for the active TCG.
 * Pokémon: `test` / `esteban`. Yu-Gi-Oh: `yugioh-pablo` / `yugioh-esteban`.
 */
@Injectable()
export class OwnerModelsService {
  constructor(
    @InjectConnection() private readonly pokemonPablo: Connection,
    @InjectConnection(ESTEBAN_CONNECTION_NAME)
    private readonly pokemonEsteban: Connection,
    @InjectConnection(YUGIOH_PABLO_CONNECTION)
    private readonly yugiohPablo: Connection,
    @InjectConnection(YUGIOH_ESTEBAN_CONNECTION)
    private readonly yugiohEsteban: Connection,
  ) {}

  getConnection(owner?: OwnerKey, tcg?: ActiveTcg): Connection {
    const key = owner ?? getCurrentOwner();
    const game = tcg ?? getCurrentTcg();
    if (game === 'yugioh') {
      return key === 'esteban' ? this.yugiohEsteban : this.yugiohPablo;
    }
    return key === 'esteban' ? this.pokemonEsteban : this.pokemonPablo;
  }

  getModel<T>(name: string, owner?: OwnerKey, tcg?: ActiveTcg): Model<T> {
    return this.getConnection(owner, tcg).model<T>(name);
  }

  /** dbName of the connection for the given (or current) owner — useful in tests. */
  getDbName(owner?: OwnerKey, tcg?: ActiveTcg): string {
    const conn = this.getConnection(owner, tcg);
    return conn.name;
  }
}
