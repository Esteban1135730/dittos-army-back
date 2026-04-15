/**
 * Completa `card_name` (y opcionalmente `image_url` vacío) en documentos de stock
 * consultando TCGdex por `card_id`. Agrupa por `card_id` para minimizar llamadas.
 *
 * Uso (desde la raíz del backend):
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-stock-card-names.ts
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-stock-card-names.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-stock-card-names.ts --also-image
 *
 * Variables opcionales:
 *   BACKFILL_DELAY_MS — pausa entre ids distintos (default 200) para no saturar la API.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from 'src/app.module';
import { Stock, StockDocument } from 'src/schema/stock.schema';
import { TCGDexService } from 'src/service/tcgdex/tcgdex.service';

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    dryRun: argv.includes('--dry-run'),
    alsoImage: argv.includes('--also-image'),
  };
}

function needsBackfillName(doc: StockDocument): boolean {
  const n = doc.card_name;
  return n === undefined || n === null || String(n).trim() === '';
}

async function main() {
  const { dryRun, alsoImage } = parseArgs();
  const delayMs = Math.max(
    0,
    Number.parseInt(process.env.BACKFILL_DELAY_MS || '200', 10) || 200,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const stockModel = app.get<Model<StockDocument>>(getModelToken(Stock.name));
  const tcgDex = app.get(TCGDexService);

  const candidates = await stockModel
    .find({
      $or: [
        { card_name: { $exists: false } },
        { card_name: null },
        { card_name: '' },
        { card_name: { $regex: /^\s*$/ } },
      ],
    })
    .exec();

  const byCardId = new Map<string, StockDocument[]>();
  for (const doc of candidates) {
    if (!needsBackfillName(doc)) continue;
    const id = doc.card_id?.trim();
    if (!id) {
      console.warn(`[backfill] Stock ${_idOf(doc)} sin card_id válido, se omite.`);
      continue;
    }
    if (!byCardId.has(id)) byCardId.set(id, []);
    byCardId.get(id)!.push(doc);
  }

  const uniqueIds = [...byCardId.keys()];
  console.log(
    `[backfill] Documentos sin nombre: ${candidates.length}, card_id únicos: ${uniqueIds.length}, dryRun=${dryRun}, alsoImage=${alsoImage}, delayMs=${delayMs}`,
  );

  let docsUpdated = 0;
  let idsResolved = 0;
  let idsFailed = 0;

  for (let i = 0; i < uniqueIds.length; i++) {
    const cardId = uniqueIds[i];
    const group = byCardId.get(cardId)!;

    const card = await tcgDex.getCard(cardId);
    const name = card?.name?.trim();
    if (!card || !name) {
      console.warn(
        `[backfill] TCGdex sin nombre para card_id=${cardId} (${group.length} filas)`,
      );
      idsFailed += 1;
      if (i < uniqueIds.length - 1 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      continue;
    }

    idsResolved += 1;
    const imageFromApi = (card.image ?? '').trim();

    for (const doc of group) {
      const setPayload: Record<string, string> = { card_name: name };
      if (
        alsoImage &&
        imageFromApi &&
        (!doc.image_url || String(doc.image_url).trim() === '')
      ) {
        setPayload.image_url = imageFromApi;
      }

      if (dryRun) {
        console.log(
          `[dry-run] ${_idOf(doc)} card_id=${cardId} -> card_name="${name}"` +
            (setPayload.image_url ? ` image_url="${setPayload.image_url}"` : ''),
        );
        docsUpdated += 1;
        continue;
      }

      await stockModel.updateOne({ _id: doc._id }, { $set: setPayload }).exec();
      docsUpdated += 1;
    }

    if ((i + 1) % 25 === 0) {
      console.log(`[backfill] Progreso ${i + 1}/${uniqueIds.length} ids...`);
    }

    if (i < uniqueIds.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  await app.close();

  console.log(
    `[backfill] Listo. card_id resueltos=${idsResolved}, card_id fallidos=${idsFailed}, documentos actualizados (o simulados)=${docsUpdated}`,
  );
}

function _idOf(doc: StockDocument): string {
  return String(doc._id);
}

main().catch((err) => {
  console.error('[backfill] Error:', err);
  process.exit(1);
});
