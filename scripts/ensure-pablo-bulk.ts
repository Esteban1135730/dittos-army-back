/**
 * Seed idempotente del SKU quantity `da-bulk` para owner Pablo (DB `test`).
 * Delega en `BulkProductService.ensureBulk()` (no duplica lógica).
 *
 * Uso (desde `dittos-army-back/`):
 *   npx ts-node -r tsconfig-paths/register scripts/ensure-pablo-bulk.ts
 */

import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { OwnerModelsService } from 'src/owner/owner-models.service';
import { runWithOwnerAsync } from 'src/owner/owner-context';
import { BulkProductService } from 'src/service/bulk-product.service';
import { Stock, type StockDocument } from 'src/schema/stock.schema';
import { Pvp, type PvpDocument } from 'src/schema/pvp.schema';
import { BULK_CARD_ID } from 'src/constants/bulk-product';

const OWNER = 'pablo' as const;

type StockSnap = {
  _id: string;
  card_id: string;
  card_name: string;
  product_kind?: string;
  quantity?: number;
  card_state?: string;
  image_url?: string;
};

type PvpSnap = {
  _id: string;
  card_id: string;
  pvp: number;
  currency: string;
  rareza?: string | null;
};

async function snapshot(
  ownerModels: OwnerModelsService,
  owner: 'pablo' | 'esteban',
) {
  return runWithOwnerAsync(owner, async () => {
    const stockModel = ownerModels.getModel<StockDocument>(Stock.name);
    const pvpModel = ownerModels.getModel<PvpDocument>(Pvp.name);
    const stocks = await stockModel
      .find({ card_id: BULK_CARD_ID })
      .lean()
      .exec();
    const pvps = await pvpModel.find({ card_id: BULK_CARD_ID }).lean().exec();
    return {
      owner,
      dbName: ownerModels.getDbName(),
      stocks: stocks.map(
        (s): StockSnap => ({
          _id: String(s._id),
          card_id: String(s.card_id ?? ''),
          card_name: String(s.card_name ?? ''),
          product_kind: s.product_kind,
          quantity: (s as { quantity?: number }).quantity,
          card_state: s.card_state,
          image_url: s.image_url,
        }),
      ),
      pvps: pvps.map(
        (p): PvpSnap => ({
          _id: String(p._id),
          card_id: String(p.card_id ?? ''),
          pvp: p.pvp,
          currency: p.currency,
          rareza: p.rareza ?? null,
        }),
      ),
    };
  });
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const ownerModels = app.get(OwnerModelsService);
  const bulkProductService = app.get(BulkProductService);

  const beforePablo = await snapshot(ownerModels, 'pablo');
  const beforeEsteban = await snapshot(ownerModels, 'esteban');
  console.log(
    '[before]',
    JSON.stringify({ pablo: beforePablo, esteban: beforeEsteban }),
  );

  const result = await runWithOwnerAsync(OWNER, () =>
    bulkProductService.ensureBulk(),
  );
  console.log('[ensureBulk]', JSON.stringify(result));

  const afterPablo = await snapshot(ownerModels, 'pablo');
  const afterEsteban = await snapshot(ownerModels, 'esteban');
  console.log(
    '[after]',
    JSON.stringify({ pablo: afterPablo, esteban: afterEsteban }),
  );

  const estebanIdsBefore = beforeEsteban.stocks
    .map((s) => s._id)
    .sort()
    .join(',');
  const estebanIdsAfter = afterEsteban.stocks
    .map((s) => s._id)
    .sort()
    .join(',');
  if (
    estebanIdsBefore !== estebanIdsAfter ||
    JSON.stringify(beforeEsteban.pvps) !== JSON.stringify(afterEsteban.pvps)
  ) {
    console.error('[warn] Esteban da-bulk cambió; no se esperaba mutación');
  } else {
    console.log('[ok] Esteban da-bulk sin cambios');
  }

  await app.close();
  console.log(
    `[ensure-pablo-bulk] done owner=${OWNER} db=${afterPablo.dbName}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
