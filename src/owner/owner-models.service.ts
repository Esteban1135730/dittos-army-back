import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import {
  ESTEBAN_CONNECTION_NAME,
  type OwnerKey,
} from '../config/owners.config';
import { YUGIOH_TEFA_CONNECTION } from '../yugioh/yugioh.constants';
import { getCurrentOwner } from './owner-context';
import type { ActiveTcg } from './tcg-context';

/**
 * Returns Mongoose models bound to the active owner's database.
 * Pokémon: Pablo → `test`, Esteban → `esteban`.
 * Yu-Gi-Oh: Tefa → `yugioh-tefa`.
 */
@Injectable()
export class OwnerModelsService {
  constructor(
    @InjectConnection() private readonly pokemonPablo: Connection,
    @InjectConnection(ESTEBAN_CONNECTION_NAME)
    private readonly pokemonEsteban: Connection,
    @InjectConnection(YUGIOH_TEFA_CONNECTION)
    private readonly yugiohTefa: Connection,
  ) {}

  getConnection(owner?: OwnerKey, _tcg?: ActiveTcg): Connection {
    const key = owner ?? getCurrentOwner();
    if (key === 'tefa') return this.yugiohTefa;
    if (key === 'esteban') return this.pokemonEsteban;
    return this.pokemonPablo;
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
