/**
 * Completa `image_url` vacío (o localhost) en stock activo de Pablo y Esteban
 * usando TCGdex nube. Omite SKUs sintéticos (bulk/envio/domicilio/protección).
 *
 * Uso (desde `dittos-army-back/`):
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-stock-images.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-stock-images.ts
 */

import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { OWNERS_CONFIG, type OwnerKey } from 'src/config/owners.config';
import { isSyntheticQuantityCardId } from 'src/constants/bulk-product';
import { runWithOwnerAsync } from 'src/owner/owner-context';
import { OwnerModelsService } from 'src/owner/owner-models.service';
import { Stock, type StockDocument } from 'src/schema/stock.schema';
import { TCGDexService } from 'src/pokemon';
import { fallbackCardImageUrl, sanitizeCardImageUrl } from 'src/utils/card-image-url';
import { isActiveStockForImageCache } from 'src/utils/stock-card-images-sync';
import { isLocalhostImageUrl } from 'src/utils/store-image-localize';

function parseArgs() {
  return { dryRun: process.argv.slice(2).includes('--dry-run') };
}

function stockLanguage(doc: StockDocument): string {
  const raw = String(doc.language || doc.languaje || 'en').trim();
  return raw || 'en';
}

function needsImage(doc: StockDocument): boolean {
  if (isSyntheticQuantityCardId(doc.card_id)) return false;
  if (!isActiveStockForImageCache(doc)) return false;
  const url = sanitizeCardImageUrl(doc.image_url);
  if (!url) return true;
  if (isLocalhostImageUrl(url)) return true;
  return false;
}

async function main() {
  const { dryRun } = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const ownerModels = app.get(OwnerModelsService);
  const tcgDex = app.get(TCGDexService);
  const owners = Object.keys(OWNERS_CONFIG.owners) as OwnerKey[];

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const owner of owners) {
    await runWithOwnerAsync(owner, async () => {
      const stockModel = ownerModels.getModel<StockDocument>(Stock.name);
      const rows = await stockModel.find().exec();
      const missing = rows.filter(needsImage);
      console.log(
        `[${owner}] stock activo sin imagen usable: ${missing.length}`,
      );

      const byKey = new Map<string, StockDocument[]>();
      for (const doc of missing) {
        const cardId = String(doc.card_id ?? '').trim();
        if (!cardId) {
          skipped += 1;
          continue;
        }
        const key = `${cardId}::${stockLanguage(doc)}`;
        const list = byKey.get(key) ?? [];
        list.push(doc);
        byKey.set(key, list);
      }

      for (const [key, group] of byKey) {
        const [cardId, lang] = key.split('::');
        const lookup = await tcgDex.lookupProductionCardImage(cardId, lang);
        let nextUrl =
          lookup.status === 'found' ? lookup.url : '';
        if (!nextUrl) {
          const dash = cardId.lastIndexOf('-');
          nextUrl =
            fallbackCardImageUrl({
              image: '',
              setId: dash > 0 ? cardId.slice(0, dash) : cardId,
              localId: dash > 0 ? cardId.slice(dash + 1) : '',
            }) || '';
        }
        if (!nextUrl) {
          failed += group.length;
          for (const doc of group) {
            console.warn(
              `[${owner}] sin imagen TCGdex ${cardId} (${doc.card_name || '?'}) _id=${String(doc._id)} status=${lookup.status}`,
            );
          }
          continue;
        }

        for (const doc of group) {
          if (dryRun) {
            console.log(
              `[dry-run][${owner}] ${String(doc._id)} ${cardId} "${doc.card_name}" -> ${nextUrl}`,
            );
            updated += 1;
            continue;
          }
          await stockModel
            .updateOne({ _id: doc._id }, { $set: { image_url: nextUrl } })
            .exec();
          updated += 1;
          console.log(
            `[${owner}] ${cardId} "${doc.card_name}" -> ${nextUrl}`,
          );
        }
      }
    });
  }

  await app.close();
  console.log(
    `[backfill-images] listo dryRun=${dryRun} actualizados=${updated} fallidos=${failed} omitidos=${skipped}`,
  );
}

main().catch((err) => {
  console.error('[backfill-images] Error:', err);
  process.exit(1);
});
