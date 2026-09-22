/**
 * Corrige cartas de novedad materializadas con ID temporal (ct-bp-* / novedad-*)
 * resolviendo el ID TCGdex desde el catálogo CardTrader y/o blueprint.
 *
 * Uso (desde dittos-army-back):
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-novedad-tcgdex-ids.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-novedad-tcgdex-ids.ts
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from 'src/app.module';
import { Stock, StockDocument } from 'src/schema/stock.schema';
import {
  IncomingHomologNovedadStock,
  IncomingHomologNovedadStockDocument,
} from 'src/schema/incoming-homolog-novedad-stock.schema';
import { CardtraderSentUnit } from 'src/schema/cardtrader-sent-unit.schema';
import { CardTraderService } from 'src/service/cardtrader/cardtrader.service';
import { CardTraderTcgdexResolveService } from 'src/service/cardtrader/cardtrader-tcgdex-resolve.service';
import { TCGDexService } from 'src/pokemon';
import {
  blueprintIdFromTemporaryCardId,
  buildNovedadTcgdexResolveInput,
  isTemporaryNovedadCardId,
  type CtBlueprintLike,
} from 'src/utils/novedad-card-resolve';

function parseArgs() {
  return { dryRun: process.argv.slice(2).includes('--dry-run') };
}

type FixTarget = {
  stockId: string;
  cardId: string;
  cardName: string;
  language: string;
  imageUrl: string;
  blueprintId: number;
  sentUnitKey?: string;
  expansion: string;
  novedadRowId?: string;
};

async function main() {
  const { dryRun } = parseArgs();
  const delayMs = Math.max(
    0,
    Number.parseInt(process.env.BACKFILL_DELAY_MS || '150', 10) || 150,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const stockModel = app.get<Model<StockDocument>>(getModelToken(Stock.name));
  const novedadModel = app.get<Model<IncomingHomologNovedadStockDocument>>(
    getModelToken(IncomingHomologNovedadStock.name),
  );
  const sentModel = app.get<Model<any>>(getModelToken(CardtraderSentUnit.name));
  const cardTrader = app.get(CardTraderService);
  const tcgdxResolve = app.get(CardTraderTcgdexResolveService);
  const tcgDex = app.get(TCGDexService);

  const badStock = await stockModel
    .find({
      $or: [
        { card_id: { $regex: /^ct-bp-/ } },
        { card_id: { $regex: /^novedad-/ } },
      ],
    })
    .lean();

  const badNovedad = await novedadModel
    .find({
      $or: [
        { card_id: { $regex: /^ct-bp-/ } },
        { card_id: { $regex: /^novedad-/ } },
      ],
    })
    .lean();

  const targets = new Map<string, FixTarget>();

  for (const row of badNovedad) {
    if (!isTemporaryNovedadCardId(row.card_id) && !row.stock_id) continue;
    const stockId = row.stock_id?.trim();
    if (!stockId) continue;
    targets.set(stockId, {
      stockId,
      cardId: row.card_id,
      cardName: row.card_name,
      language: row.language || 'en',
      imageUrl: row.image_url || '',
      blueprintId: row.blueprint_id ?? 0,
      sentUnitKey: row.sent_unit_key,
      expansion: row.expansion || '',
      novedadRowId: row._id.toString(),
    });
  }

  for (const row of badStock) {
    const stockId = row._id.toString();
    if (targets.has(stockId)) continue;
    targets.set(stockId, {
      stockId,
      cardId: row.card_id,
      cardName: row.card_name ?? '',
      language: String(row.language ?? row.languaje ?? 'en'),
      imageUrl: row.image_url ?? '',
      blueprintId: blueprintIdFromTemporaryCardId(row.card_id) ?? 0,
      expansion: '',
    });
  }

  const list = [...targets.values()];
  console.log(
    `[backfill-novedad] candidatos=${list.length} dryRun=${dryRun} delayMs=${delayMs}`,
  );

  let fixed = 0;
  let failed = 0;

  for (let i = 0; i < list.length; i++) {
    const target = list[i];
    let blueprintId = target.blueprintId;
    if (blueprintId <= 0) {
      blueprintId = blueprintIdFromTemporaryCardId(target.cardId) ?? 0;
    }

    let ct: any = null;
    if (target.sentUnitKey) {
      ct = await sentModel
        .findOne({ unit_key: target.sentUnitKey })
        .lean();
    }

    let blueprint: CtBlueprintLike | null = null;
    if (blueprintId > 0) {
      try {
        blueprint = (await cardTrader.getBlueprintById(
          blueprintId,
        )) as CtBlueprintLike;
      } catch {
        blueprint = null;
      }
    }

    const resolveInput = buildNovedadTcgdexResolveInput({
      expansionName: target.expansion || ct?.expansion || undefined,
      collectorNumber: ct?.collector_number,
      blueprint,
    });

    const resolved = await tcgdxResolve.resolveTcgdexCardId(resolveInput);
    if (!resolved.tcgdex_card_id) {
      console.warn(
        `[backfill-novedad] SKIP stock=${target.stockId} ${target.cardName} (${target.cardId}): ${resolved.error}`,
      );
      failed += 1;
      continue;
    }

    const card = await tcgDex.getCard(
      resolved.tcgdex_card_id,
      target.language,
    );
    const nextName = card?.name?.trim() || target.cardName;
    const nextImage =
      card?.image?.trim() ||
      card?.images?.small?.trim() ||
      card?.images?.large?.trim() ||
      target.imageUrl;

    const payload = {
      card_id: resolved.tcgdex_card_id,
      card_name: nextName,
      image_url: nextImage,
    };

    if (dryRun) {
      console.log(
        `[dry-run] stock=${target.stockId} ${target.cardId} -> ${payload.card_id} (${nextName})`,
      );
      fixed += 1;
      continue;
    }

    await stockModel
      .updateOne({ _id: target.stockId }, { $set: payload })
      .exec();

    if (target.novedadRowId) {
      await novedadModel
        .updateOne({ _id: target.novedadRowId }, { $set: payload })
        .exec();
    } else {
      await novedadModel
        .updateMany({ stock_id: target.stockId }, { $set: payload })
        .exec();
    }

    console.log(
      `[backfill-novedad] OK stock=${target.stockId} ${target.cardId} -> ${payload.card_id}`,
    );
    fixed += 1;

    if (i < list.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  await app.close();
  console.log(`[backfill-novedad] Listo. corregidos=${fixed} fallidos=${failed}`);
}

main().catch((err) => {
  console.error('[backfill-novedad] Error:', err);
  process.exit(1);
});
