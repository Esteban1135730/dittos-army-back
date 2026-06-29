/**
 * Aplica overrides manuales de TCGdex a stock + novedad_stock (ct-bp-*).
 *
 *   npx ts-node -r tsconfig-paths/register scripts/apply-novedad-manual-tcgdex.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/apply-novedad-manual-tcgdex.ts
 */

import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from 'src/app.module';
import { Stock, StockDocument } from 'src/schema/stock.schema';
import {
  IncomingHomologNovedadStock,
  IncomingHomologNovedadStockDocument,
} from 'src/schema/incoming-homolog-novedad-stock.schema';

type ManualEntry = {
  card_id: string;
  card_name: string;
  image_url: string;
};

function loadManualMap(): Map<number, ManualEntry> {
  const filePath = path.join(
    process.cwd(),
    'data',
    'novedad-manual-tcgdex.json',
  );
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    by_blueprint_id?: Record<string, ManualEntry>;
  };
  const map = new Map<number, ManualEntry>();
  for (const [key, value] of Object.entries(raw.by_blueprint_id ?? {})) {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!value?.card_id?.trim()) continue;
    map.set(id, {
      card_id: value.card_id.trim(),
      card_name: value.card_name?.trim() ?? '',
      image_url: value.image_url?.trim() ?? '',
    });
  }
  return map;
}

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run');
  const manual = loadManualMap();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const stockModel = app.get<Model<StockDocument>>(getModelToken(Stock.name));
  const novedadModel = app.get<Model<IncomingHomologNovedadStockDocument>>(
    getModelToken(IncomingHomologNovedadStock.name),
  );

  const novedadRows = await novedadModel
    .find({
      $or: [
        { card_id: { $regex: /^ct-bp-/ } },
        { blueprint_id: { $in: [...manual.keys()] } },
      ],
    })
    .lean();

  let updatedStock = 0;
  let updatedNovedad = 0;

  for (const row of novedadRows) {
    const bpId = row.blueprint_id ?? 0;
    const entry =
      manual.get(bpId) ??
      (() => {
        const match = /^ct-bp-(\d+)$/.exec(String(row.card_id ?? '').trim());
        if (!match) return undefined;
        return manual.get(Number(match[1]));
      })();

    if (!entry) {
      console.warn(
        `[manual] SKIP novedad=${row._id} ${row.card_name} bp=${bpId} (${row.card_id})`,
      );
      continue;
    }

    const payload = {
      card_id: entry.card_id,
      card_name: entry.card_name || row.card_name,
      image_url: entry.image_url,
    };

    const stockId = row.stock_id?.trim();
    if (!stockId) {
      console.warn(`[manual] SKIP sin stock_id novedad=${row._id}`);
      continue;
    }

    if (dryRun) {
      console.log(
        `[dry-run] stock=${stockId} novedad=${row._id} ${row.card_id} -> ${payload.card_id} (${payload.card_name})`,
      );
      updatedStock += 1;
      updatedNovedad += 1;
      continue;
    }

    await stockModel.updateOne({ _id: stockId }, { $set: payload }).exec();
    await novedadModel.updateOne({ _id: row._id }, { $set: payload }).exec();
    updatedStock += 1;
    updatedNovedad += 1;
    console.log(
      `[manual] OK stock=${stockId} ${row.card_id} -> ${payload.card_id}`,
    );
  }

  await app.close();
  console.log(
    `[manual] Listo. filas_stock=${updatedStock} filas_novedad=${updatedNovedad} dryRun=${dryRun}`,
  );
}

main().catch((err) => {
  console.error('[manual] Error:', err);
  process.exit(1);
});
