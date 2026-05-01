/**
 * Migra documentos de **stock**: pasa `league_card` / `holofoil` al campo canónico `rareza`
 * (`league card`, `holofoil`) y deja los booleanos en `false`. Normaliza alias y minúsculas
 * en `rareza` (p. ej. `league_card` → `league card`, `HOLOFOIL` → `holofoil`).
 *
 * Uso (desde `dittos-army-back/`):
 *   npm run script:migrate-stock-rareza:dry
 *   npm run script:migrate-stock-rareza
 *
 * Requiere la misma conexión Mongo que `AppModule` (misma app / env que el resto de scripts).
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from 'src/app.module';
import { Stock, StockDocument } from 'src/schema/stock.schema';
import { effectiveOperationalRarezaFromStock } from 'src/utils/pvp-resolve';

function parseArgs() {
  const argv = process.argv.slice(2);
  return { dryRun: argv.includes('--dry-run') };
}

function idOf(doc: StockDocument): string {
  return String(doc._id);
}

function targetRarezaFor(doc: StockDocument): string | null {
  return effectiveOperationalRarezaFromStock({
    rareza: doc.rareza,
    league_card: doc.league_card === true,
    holofoil: doc.holofoil === true,
  });
}

/** True si hay que escribir: flags legacy o valor de `rareza` distinto del canónico. */
function needsMigration(doc: StockDocument): boolean {
  const flagsDirty =
    doc.league_card === true || doc.holofoil === true;
  const targetRareza = targetRarezaFor(doc);
  const rarezaStr = doc.rareza == null ? '' : String(doc.rareza).trim();

  if (flagsDirty) return true;
  if (targetRareza == null) {
    return rarezaStr !== '';
  }
  return rarezaStr !== targetRareza;
}

function buildUpdate(doc: StockDocument): {
  $set: Record<string, unknown>;
  $unset?: Record<string, ''>;
} {
  const targetRareza = targetRarezaFor(doc);

  const $set: Record<string, unknown> = {
    league_card: false,
    holofoil: false,
  };

  if (targetRareza == null) {
    return {
      $set,
      $unset: { rareza: '' },
    };
  }

  $set.rareza = targetRareza;
  return { $set };
}

async function main() {
  const { dryRun } = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const stockModel = app.get<Model<StockDocument>>(getModelToken(Stock.name));

  const candidates = await stockModel
    .find({
      $or: [
        { league_card: true },
        { holofoil: true },
        { rareza: { $regex: /^league[\s_-]+card$/i } },
        { rareza: { $regex: /^holofoil$/i } },
      ],
    })
    .exec();

  let examined = 0;
  let wouldUpdate = 0;
  let skipped = 0;
  let updated = 0;

  for (const doc of candidates) {
    examined += 1;
    if (!needsMigration(doc)) {
      skipped += 1;
      continue;
    }
    wouldUpdate += 1;
    const upd = buildUpdate(doc);

    if (dryRun) {
      console.log(
        `[dry-run] ${idOf(doc)} card_id=${doc.card_id} ->`,
        JSON.stringify(upd),
      );
      continue;
    }

    await stockModel.updateOne({ _id: doc._id }, upd).exec();
    updated += 1;
  }

  console.log(
    `[migrate-stock-rareza] dryRun=${dryRun} candidatos=${candidates.length} examinados=${examined} a_migrar=${wouldUpdate} omitidos_sin_cambio=${skipped} actualizados=${updated}`,
  );

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
