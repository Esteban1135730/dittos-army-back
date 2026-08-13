/**
 * Elimina líneas de stock en estado `disponible` cuya carta tiene el tag
 * operativo `bulk` (`card_stock_tags`, y tags legacy en el documento stock).
 *
 * Conserva el SKU fijo de producto cantidad:
 *   - card_id === `da-bulk`
 *   - card_name === `bulk` (case-insensitive)
 *
 * No toca líneas `vendida` / `propiedad` / otros estados.
 * Limpia el tag `bulk` en `card_stock_tags` de esos card_id (excepto da-bulk);
 * si el array queda vacío, elimina el documento de tags.
 *
 * Uso (desde `dittos-army-back/`):
 *   npx ts-node -r tsconfig-paths/register scripts/delete-stock-with-bulk-tag.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/delete-stock-with-bulk-tag.ts --owner=pablo
 *   npx ts-node -r tsconfig-paths/register scripts/delete-stock-with-bulk-tag.ts --owner=all
 */

import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { OwnerModelsService } from 'src/owner/owner-models.service';
import { runWithOwnerAsync } from 'src/owner/owner-context';
import {
  isOwnerKey,
  type OwnerKey,
  OWNERS_CONFIG,
} from 'src/config/owners.config';
import { Stock, type StockDocument } from 'src/schema/stock.schema';
import {
  CardStockTag,
  type CardStockTagDocument,
} from 'src/schema/card-stock-tag.schema';
import { BULK_CARD_ID, BULK_CARD_NAME } from 'src/constants/bulk-product';

function parseArgs() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const ownerArg = argv.find((a) => a.startsWith('--owner='));
  const ownerRaw = ownerArg?.slice('--owner='.length)?.trim().toLowerCase();
  let owners: OwnerKey[] | 'all' = [OWNERS_CONFIG.defaultOwner];
  if (ownerRaw === 'all') {
    owners = 'all';
  } else if (ownerRaw && isOwnerKey(ownerRaw)) {
    owners = [ownerRaw];
  } else if (ownerRaw) {
    throw new Error(
      `--owner inválido: "${ownerRaw}". Usa pablo | esteban | all`,
    );
  }
  return { dryRun, owners };
}

function isProtectedBulkSku(cardId: string, cardName: string): boolean {
  const cid = cardId.trim();
  const name = cardName.trim().toLowerCase();
  return cid === BULK_CARD_ID || name === BULK_CARD_NAME.toLowerCase();
}

async function runForOwner(
  owner: OwnerKey,
  ownerModels: OwnerModelsService,
  dryRun: boolean,
): Promise<void> {
  await runWithOwnerAsync(owner, async () => {
    const stockModel = ownerModels.getModel<StockDocument>(Stock.name);
    const tagModel = ownerModels.getModel<CardStockTagDocument>(
      CardStockTag.name,
    );
    const dbName = ownerModels.getDbName();

    const tagDocs = await tagModel.find({ tags: 'bulk' }).lean().exec();
    const cardIdsFromTags = new Set(
      tagDocs.map((d) => String(d.card_id ?? '').trim()).filter(Boolean),
    );

    const legacyTagged = await stockModel
      .find({ tags: 'bulk' })
      .select('_id card_id card_name tags')
      .lean()
      .exec();
    for (const row of legacyTagged) {
      const cid = String(row.card_id ?? '').trim();
      if (cid) cardIdsFromTags.add(cid);
    }

    const allCardIds = [...cardIdsFromTags];
    const stocks =
      allCardIds.length === 0
        ? []
        : await stockModel
            .find({ card_id: { $in: allCardIds } })
            .select('_id card_id card_name card_state product_kind quantity')
            .lean()
            .exec();

    const toDeleteStockIds: string[] = [];
    const toCleanCardIds = new Set<string>();
    let protectedKept = 0;
    const byState: Record<string, number> = {};

    const DELETE_STATES = new Set(['disponible']);

    for (const row of stocks) {
      const cid = String(row.card_id ?? '').trim();
      const name = String(row.card_name ?? '');
      if (isProtectedBulkSku(cid, name)) {
        protectedKept += 1;
        continue;
      }
      const st = String(row.card_state ?? '(vacío)');
      byState[st] = (byState[st] ?? 0) + 1;
      if (!DELETE_STATES.has(st)) {
        continue;
      }
      toDeleteStockIds.push(String(row._id));
      if (cid) toCleanCardIds.add(cid);
    }

    // Tags huérfanos (card_id con tag bulk sin líneas, o tras borrar stock)
    for (const cid of allCardIds) {
      if (cid === BULK_CARD_ID) continue;
      toCleanCardIds.add(cid);
    }
    // No limpiar tags del SKU protegido si no tiene stock con otro nombre
    toCleanCardIds.delete(BULK_CARD_ID);

    console.log(
      `[delete-bulk-tag] owner=${owner} db=${dbName} dryRun=${dryRun}`,
    );
    console.log(
      `  card_ids con tag bulk: ${allCardIds.length}; líneas stock candidatas: ${stocks.length}; a borrar (solo disponible): ${toDeleteStockIds.length}; SKU bulk conservado: ${protectedKept}; card_ids tags a limpiar: ${toCleanCardIds.size}`,
    );
    console.log(`  candidatas por estado: ${JSON.stringify(byState)}`);

    if (dryRun) {
      const sample = stocks
        .filter((s) => {
          if (
            isProtectedBulkSku(
              String(s.card_id ?? ''),
              String(s.card_name ?? ''),
            )
          ) {
            return false;
          }
          return DELETE_STATES.has(String(s.card_state ?? ''));
        })
        .slice(0, 15);
      for (const s of sample) {
        console.log(
          `  [dry-run] stock_id=${s._id} card_id=${s.card_id} name=${JSON.stringify(s.card_name)} state=${s.card_state}`,
        );
      }
      if (toDeleteStockIds.length > 15) {
        console.log(`  [dry-run] … y ${toDeleteStockIds.length - 15} más`);
      }
      return;
    }

    if (toDeleteStockIds.length > 0) {
      const del = await stockModel
        .deleteMany({ _id: { $in: toDeleteStockIds } })
        .exec();
      console.log(`  stock eliminados: ${del.deletedCount ?? 0}`);
    }

    let tagsUpdated = 0;
    let tagsRemoved = 0;
    for (const cid of toCleanCardIds) {
      const doc = await tagModel.findOne({ card_id: cid }).exec();
      if (!doc) continue;
      const next = (Array.isArray(doc.tags) ? doc.tags : []).filter(
        (t) => String(t).trim().toLowerCase() !== 'bulk',
      );
      if (next.length === 0) {
        await tagModel.deleteOne({ card_id: cid }).exec();
        tagsRemoved += 1;
      } else if (next.length !== (doc.tags?.length ?? 0)) {
        doc.tags = next;
        await doc.save();
        tagsUpdated += 1;
      }
    }
    console.log(
      `  card_stock_tags: actualizados=${tagsUpdated} eliminados=${tagsRemoved}`,
    );
  });
}

async function main() {
  const { dryRun, owners } = parseArgs();
  const list: OwnerKey[] =
    owners === 'all'
      ? (Object.keys(OWNERS_CONFIG.owners) as OwnerKey[])
      : owners;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const ownerModels = app.get(OwnerModelsService);
    for (const owner of list) {
      await runForOwner(owner, ownerModels, dryRun);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
