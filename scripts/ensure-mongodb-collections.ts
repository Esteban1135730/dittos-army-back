/**
 * Crea en MongoDB las colecciones que Nest/Mongoose usará (vacías si no existen).
 * No sustituye migraciones: solo evita tener que "tocar" Atlas a mano.
 *
 * Uso (desde la carpeta dittos-army-back, con MONGODB_URI en .env):
 *   npm run script:db-init
 *
 * La URI debe incluir el nombre de la base, ej:
 *   mongodb+srv://user:pass@cluster.mongodb.net/ditto-army-db?retryWrites=true&w=majority
 */

import 'reflect-metadata';
import * as dns from 'node:dns';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const MONGO_CONNECT_OPTS = {
  family: 4 as const,
  serverSelectionTimeoutMS: 60_000,
};

import { Stock, StockSchema } from '../src/schema/stock.schema';
import { Pvp, PvpSchema } from '../src/schema/pvp.schema';
import { Sale, SaleSchema } from '../src/schema/sale.schema';
import { Client, ClientSchema } from '../src/schema/client.schema';
import { Reserva, ReservaSchema } from '../src/schema/reserva.schema';
import { IncomingBatch, IncomingBatchSchema } from '../src/schema/incoming-batch.schema';
import {
  IncomingBatchItem,
  IncomingBatchItemSchema,
} from '../src/schema/incoming-batch-item.schema';
import { IncomingRound, IncomingRoundSchema } from '../src/schema/incoming-round.schema';
import {
  IncomingRoundItem,
  IncomingRoundItemSchema,
} from '../src/schema/incoming-round-item.schema';
import {
  IncomingShipRound,
  IncomingShipRoundSchema,
} from '../src/schema/incoming-ship-round.schema';
import {
  IncomingShipRoundItem,
  IncomingShipRoundItemSchema,
} from '../src/schema/incoming-ship-round-item.schema';
import {
  ElectronicInvoice,
  ElectronicInvoiceSchema,
} from '../src/schema/electronic-invoice.schema';

function loadMongoUriFromEnvFile(): string | undefined {
  const candidates = [
    join(process.cwd(), '.env'),
    join(process.cwd(), '..', '.env'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (key.trim() !== 'MONGODB_URI') continue;
      let val = rest.join('=').trim();
      val = val.replace(/^["']|["']$/g, '');
      if (val) return val;
    }
  }
  return undefined;
}

function resolveMongoUri(): string {
  const fromEnv = process.env.MONGODB_URI?.trim();
  if (fromEnv) return fromEnv;
  const fromFile = loadMongoUriFromEnvFile();
  if (fromFile) return fromFile;
  throw new Error(
    'Define MONGODB_URI en el entorno o en dittos-army-back/.env (o .env en la raíz del workspace).',
  );
}

/** True si la URI trae nombre de base en la ruta (p. ej. .../ditto-army-db?...). */
function uriSpecifiesDatabase(uri: string): boolean {
  const q = uri.indexOf('?');
  const base = q >= 0 ? uri.slice(0, q) : uri;
  const at = base.lastIndexOf('@');
  const tail = at >= 0 ? base.slice(at + 1) : base.replace(/^mongodb(\+srv)?:\/\//i, '');
  const slash = tail.indexOf('/');
  if (slash === -1) return false;
  const dbName = tail.slice(slash + 1).trim();
  return dbName.length > 0;
}

type Pair = { name: string; schema: mongoose.Schema };

async function ensureCollections() {
  const pairs: Pair[] = [
    { name: Stock.name, schema: StockSchema },
    { name: Pvp.name, schema: PvpSchema },
    { name: Sale.name, schema: SaleSchema },
    { name: Client.name, schema: ClientSchema },
    { name: Reserva.name, schema: ReservaSchema },
    { name: IncomingBatch.name, schema: IncomingBatchSchema },
    { name: IncomingBatchItem.name, schema: IncomingBatchItemSchema },
    { name: IncomingRound.name, schema: IncomingRoundSchema },
    { name: IncomingRoundItem.name, schema: IncomingRoundItemSchema },
    { name: IncomingShipRound.name, schema: IncomingShipRoundSchema },
    { name: IncomingShipRoundItem.name, schema: IncomingShipRoundItemSchema },
    { name: ElectronicInvoice.name, schema: ElectronicInvoiceSchema },
  ];

  const uri = resolveMongoUri();
  const explicitDb = uriSpecifiesDatabase(uri);
  if (/^mongodb\+srv:\/\//i.test(uri.trim())) {
    console.log(
      '\n[INFO] Estás usando mongodb+srv:// (requiere DNS TXT/SRV). ' +
        'Si aparece queryTxt ETIMEOUT, tu red no resuelve ese DNS: ' +
        'sustituye MONGODB_URI por la cadena mongodb:// estándar que muestra Atlas ' +
        '(Connect → Drivers → cadena con hosts ...shard-00-....mongodb.net:27017).\n' +
        'Guía: docs/ATLAS-DNS-ETIMEOUT.md\n',
    );
  }
  try {
    await mongoose.connect(uri, MONGO_CONNECT_OPTS);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('queryTxt') || msg.includes('ETIMEOUT')) {
      console.error(
        '\nFallo DNS típico de mongodb+srv. Opciones:\n' +
          '  • Cambiar DNS del PC (8.8.8.8) o probar otra red.\n' +
          '  • Usar la cadena estándar mongodb:// (sin srv) desde Atlas: Connect → Drivers.\n' +
          '  • Ver: docs/ATLAS-DNS-ETIMEOUT.md\n',
      );
    }
    throw e;
  }
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Sin base de datos en la conexión');
  }

  if (db.databaseName === 'test' && !explicitDb) {
    console.warn(
      '\n[AVISO] Estás usando la base por defecto "test" porque MONGODB_URI no incluye nombre de BD en la ruta.\n' +
        '  Añade antes del "?": /ditto-army-db  (o el nombre que quieras)\n' +
        '  Ejemplo: ...mongodb.net/ditto-army-db?retryWrites=true...\n',
    );
  }

  console.log('Base de datos:', db.databaseName);
  console.log('Creando colecciones si no existen...\n');

  for (const { name, schema } of pairs) {
    if (mongoose.models[name]) {
      mongoose.deleteModel(name);
    }
    const Model = mongoose.model(name, schema);
    const collName = Model.collection.name;

    try {
      await db.createCollection(collName);
      console.log(`+ creada: ${collName}`);
    } catch (e: unknown) {
      const err = e as { code?: number; codeName?: string };
      if (err.code === 48 || err.codeName === 'NamespaceExists') {
        console.log(`· ya existe: ${collName}`);
      } else {
        throw e;
      }
    }
    mongoose.deleteModel(name);
  }

  await mongoose.disconnect();
  console.log('\nListo.');
}

ensureCollections().catch((err) => {
  console.error(err);
  process.exit(1);
});
