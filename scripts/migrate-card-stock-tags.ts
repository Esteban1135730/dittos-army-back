/**
 * Migra tags de clasificación desde cada documento de **stock** (por línea)
 * a la colección **card_stock_tags** (por `card_id` de carta TCG).
 *
 * - Une tags de todas las líneas con el mismo `card_id` (orden canónico: vintage, bulk, jugable).
 * - Ignora valores que no estén en el catálogo cerrado.
 * - Hace `$unset` de `tags` en todos los stocks.
 *
 * Uso (desde `dittos-army-back/`):
 *   npm run script:migrate-card-stock-tags:dry
 *   npm run script:migrate-card-stock-tags
 *
 * Requiere la misma conexión Mongo que `AppModule` (igual que otros scripts).
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from 'src/app.module';
import { Stock, StockDocument } from 'src/schema/stock.schema';
import {
  CardStockTag,
  CardStockTagDocument,
} from 'src/schema/card-stock-tag.schema';
import { STOCK_TAG_VALUES } from 'src/constants/stock-tags';

function parseArgs() {
  const argv = process.argv.slice(2);
  return { dryRun: argv.includes('--dry-run') };
}

const ALLOWED = new Set<string>(STOCK_TAG_VALUES);

function canonicalTagsFromLines(tagArrays: unknown[][]): string[] {
  const seen = new Set<string>();
  for (const arr of tagArrays) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      const u = item.trim().toLowerCase();
      if (ALLOWED.has(u)) {
        seen.add(u);
      }
    }
  }
  return STOCK_TAG_VALUES.filter((v) => seen.has(v));
}

async function main() {
  const { dryRun } = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const stockModel = app.get<Model<StockDocument>>(getModelToken(Stock.name));
  const cardTagModel = app.get<Model<CardStockTagDocument>>(
    getModelToken(CardStockTag.name),
  );

  const all = await stockModel.find().select('card_id tags').lean().exec();

  const byCard = new Map<string, unknown[][]>();
  for (const row of all) {
    const cid = String(row.card_id ?? '').trim();
    if (!cid) continue;
    if (!byCard.has(cid)) {
      byCard.set(cid, []);
    }
    byCard.get(cid)!.push(row.tags as unknown[]);
  }

  let upserts = 0;
  let unsetStock = 0;

  for (const [card_id, tagLines] of byCard) {
    const tags = canonicalTagsFromLines(tagLines);
    if (tags.length === 0) {
      continue;
    }
    upserts += 1;
    if (dryRun) {
      console.log(`[dry-run] card_id=${card_id} tags=${JSON.stringify(tags)}`);
    } else {
      await cardTagModel
        .findOneAndUpdate(
          { card_id },
          { $set: { card_id, tags } },
          { upsert: true, new: true },
        )
        .exec();
    }
  }

  if (!dryRun) {
    const unsetRes = await stockModel
      .updateMany(
        { tags: { $exists: true } },
        { $unset: { tags: '' } },
      )
      .exec();
    unsetStock = unsetRes.modifiedCount ?? 0;
  } else {
    const withField = await stockModel.countDocuments({ tags: { $exists: true } }).exec();
    console.log(`[dry-run] documentos stock con campo tags (se haría $unset): ${withField}`);
  }

  console.log(
    `[migrate-card-stock-tags] dryRun=${dryRun} stocks_leídos=${all.length} card_ids_distintos=${byCard.size} card_stock_tags_upsert=${upserts} stocks_tags_unset=${dryRun ? 'N/A' : unsetStock}`,
  );

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
