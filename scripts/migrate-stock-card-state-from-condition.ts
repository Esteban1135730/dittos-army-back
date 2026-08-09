/**
 * Migra `card_state` de condiciones físicas legacy (mint / near_mint / …)
 * al estado de inventario `disponible`, para que venta QR y etiquetas QR
 * las traten como elegibles (misma semántica que create-tanda / recepción).
 *
 * Uso (desde `dittos-army-back/`):
 *   npm run script:migrate-stock-card-state:dry
 *   npm run script:migrate-stock-card-state
 *
 * Recorre ambas DBs de owner (pablo / esteban).
 */

import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { OWNERS_CONFIG, type OwnerKey } from 'src/config/owners.config';
import { OwnerModelsService } from 'src/owner/owner-models.service';
import { runWithOwnerAsync } from 'src/owner/owner-context';
import { Stock, type StockDocument } from 'src/schema/stock.schema';
import {
  LEGACY_CONDITION_CARD_STATES,
  normalizeInventoryCardState,
} from 'src/utils/stock-sellable';

function parseArgs() {
  const argv = process.argv.slice(2);
  return { dryRun: argv.includes('--dry-run') };
}

function isLegacyCondition(cardState: string | null | undefined): boolean {
  const raw = String(cardState ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return LEGACY_CONDITION_CARD_STATES.has(raw);
}

async function migrateOwner(
  owner: OwnerKey,
  ownerModels: OwnerModelsService,
  dryRun: boolean,
): Promise<{ examined: number; updated: number }> {
  return runWithOwnerAsync(owner, async () => {
    const stockModel = ownerModels.getModel<StockDocument>(Stock.name);
    const rows = await stockModel
      .find({ card_state: { $exists: true, $nin: [null, ''] } })
      .select('_id card_id card_name card_state')
      .exec();

    const toFix = rows.filter((doc) => isLegacyCondition(doc.card_state));

    let updated = 0;
    for (const doc of toFix) {
      const next = normalizeInventoryCardState(doc.card_state);
      if (next !== 'disponible') continue;
      if (dryRun) {
        console.log(
          `[dry-run][${owner}] ${doc._id} card_id=${doc.card_id} name=${doc.card_name} ${doc.card_state} -> disponible`,
        );
        continue;
      }
      await stockModel
        .updateOne({ _id: doc._id }, { $set: { card_state: 'disponible' } })
        .exec();
      updated += 1;
    }

    return { examined: toFix.length, updated: dryRun ? 0 : updated };
  });
}

async function main() {
  const { dryRun } = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const ownerModels = app.get(OwnerModelsService);
  const owners = Object.keys(OWNERS_CONFIG.owners) as OwnerKey[];

  let examined = 0;
  let updated = 0;

  for (const owner of owners) {
    const r = await migrateOwner(owner, ownerModels, dryRun);
    examined += r.examined;
    updated += r.updated;
    console.log(
      `[migrate-stock-card-state] owner=${owner} a_migrar=${r.examined} actualizados=${r.updated}`,
    );
  }

  console.log(
    `[migrate-stock-card-state] dryRun=${dryRun} total_a_migrar=${examined} total_actualizados=${updated}`,
  );

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
