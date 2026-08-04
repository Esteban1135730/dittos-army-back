import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import {
  ESTEBAN_CONNECTION_NAME,
  type OwnerKey,
} from '../config/owners.config';
import { getCurrentOwner } from './owner-context';

/**
 * Returns Mongoose models bound to the active owner's database connection.
 * Repositories must use this (or getters wrapping it) instead of a fixed @InjectModel.
 */
@Injectable()
export class OwnerModelsService {
  constructor(
    @InjectConnection() private readonly pabloConnection: Connection,
    @InjectConnection(ESTEBAN_CONNECTION_NAME)
    private readonly estebanConnection: Connection,
  ) {}

  getConnection(owner?: OwnerKey): Connection {
    const key = owner ?? getCurrentOwner();
    return key === 'esteban' ? this.estebanConnection : this.pabloConnection;
  }

  getModel<T>(name: string, owner?: OwnerKey): Model<T> {
    return this.getConnection(owner).model<T>(name);
  }

  /** dbName of the connection for the given (or current) owner — useful in tests. */
  getDbName(owner?: OwnerKey): string {
    const conn = this.getConnection(owner);
    return conn.name;
  }
}
