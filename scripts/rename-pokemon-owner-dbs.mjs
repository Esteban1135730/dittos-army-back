/**
 * Restores Pokémon owner collections after a failed cross-database rename.
 * The Node driver rename stays in the same database, so collections were left
 * as `pokemon-pablo.stocks` inside `test` (and the esteban equivalent).
 * This cluster cannot rename across databases. Physical DBs stay `test` and
 * `esteban` (both Pokémon). New TCGs use `{tcg}-{owner}` via databaseNameFor.
 * Loads MONGO_URI from .env. Never logs the URI or credentials.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const PAIRS = [
  { from: 'test', to: 'pokemon-pablo', owner: 'pablo' },
  { from: 'esteban', to: 'pokemon-esteban', owner: 'esteban' },
];

/**
 * Rename `pokemon-pablo.stocks` back to `stocks` inside the same database.
 * Same-database rename is allowed on this cluster; cross-database is not.
 *
 * @param {import('mongodb').MongoClient} client
 * @param {string} dbName
 * @param {string} dottedPrefix database name that was prefixed onto collection names
 */
async function restoreDottedWithinDatabase(client, dbName, dottedPrefix) {
  const prefix = `${dottedPrefix}.`;
  const db = client.db(dbName);
  const cols = await db.listCollections().toArray();
  const dotted = cols
    .map((c) => c.name)
    .filter((n) => n.startsWith(prefix) && !n.startsWith('system.'));
  let restored = 0;
  /** @type {string[]} */
  const skipped = [];

  for (const dottedName of dotted) {
    const realName = dottedName.slice(prefix.length);
    if (!realName) {
      skipped.push(`${dottedName}: empty real name`);
      continue;
    }
    const existing = await db.listCollections({ name: realName }).toArray();
    if (existing.length > 0) {
      const count = await db.collection(realName).countDocuments();
      skipped.push(`${dbName}.${realName} already exists (${count} docs)`);
      continue;
    }
    await db.renameCollection(dottedName, realName);
    restored += 1;
  }

  return { restored, skipped };
}

async function main() {
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    console.error('SKIP: MONGO_URI missing');
    process.exitCode = 2;
    return;
  }

  /** @type {Record<string, { ok: boolean, dbName: string, detail: string }>} */
  const results = {};

  let client;
  try {
    client = new MongoClient(uri);
    await client.connect();
    await client.db('admin').command({ ping: 1 });
  } catch {
    console.error('FAIL: connection');
    process.exitCode = 1;
    return;
  }

  try {
    for (const pair of PAIRS) {
      try {
        const admin = client.db().admin();
        const { databases } = await admin.listDatabases({ nameOnly: true });
        const names = new Set(databases.map((d) => d.name));

        if (!names.has(pair.from)) {
          if (names.has(pair.to)) {
            results[pair.owner] = {
              ok: true,
              dbName: pair.to,
              detail: 'source missing; destination already present',
            };
          } else {
            results[pair.owner] = {
              ok: false,
              dbName: pair.from,
              detail: 'source missing',
            };
          }
          continue;
        }

        const restored = await restoreDottedWithinDatabase(client, pair.from, pair.to);
        if (restored.skipped.length > 0) {
          results[pair.owner] = {
            ok: false,
            dbName: pair.from,
            detail: `restored=${restored.restored}; skipped=${restored.skipped.join(',')}`,
          };
        } else {
          results[pair.owner] = {
            ok: true,
            dbName: pair.from,
            detail: `restored collection names in ${pair.from}; count=${restored.restored}`,
          };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error';
        results[pair.owner] = {
          ok: false,
          dbName: pair.from,
          detail: `error: ${msg.split('\n')[0]}`,
        };
      }
    }
  } finally {
    await client.close().catch(() => undefined);
  }

  for (const pair of PAIRS) {
    const r = results[pair.owner];
    console.log(
      `${pair.owner}: ${r.ok ? 'OK' : 'KEEP'} dbName=${r.dbName} (${r.detail})`,
    );
  }
}

main();
