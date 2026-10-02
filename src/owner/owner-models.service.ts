import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { connectionNameFor, type OwnerKey } from '../config/owners.config';
import { getCurrentOwner } from './owner-context';
import type { ActiveTcg } from './tcg-context';

/**
 * Returns Mongoose models bound to the active owner's database.
 * Pokémon: Pablo → `test`, Esteban → `esteban`.
 * Yu-Gi-Oh: Tefa → `yugioh-tefa`. Magic: Pablo → `magic-pablo`.
 * One Piece: Ali → `onepiece-ali`.
 */
@Injectable()
export class OwnerModelsService {
  private readonly connections: Record<OwnerKey, Connection>;

  constructor(
    @InjectConnection() pablo: Connection,
    @InjectConnection(connectionNameFor('esteban')) esteban: Connection,
    @InjectConnection(connectionNameFor('tefa')) tefa: Connection,
    @InjectConnection(connectionNameFor('pablo-magic')) pabloMagic: Connection,
    @InjectConnection(connectionNameFor('ali')) ali: Connection,
  ) {
    this.connections = {
      pablo,
      esteban,
      tefa,
      'pablo-magic': pabloMagic,
      ali,
    };
  }

  getConnection(owner?: OwnerKey, _tcg?: ActiveTcg): Connection {
    return this.connections[owner ?? getCurrentOwner()] ?? this.connections.pablo;
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
