/**
 * Seed idempotente de SKUs quantity `envio` y `proteccion de cartas`
 * para owner Pablo (DB `test`). PVP 0: el precio se pone en cada pedido.
 *
 * Uso (desde `dittos-army-back/`):
 *   npx ts-node -r tsconfig-paths/register scripts/ensure-pablo-accessory-skus.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ensure-pablo-accessory-skus.ts --dry-run
 */

import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { OwnerModelsService } from 'src/owner/owner-models.service';
import { runWithOwnerAsync } from 'src/owner/owner-context';
import { Stock, type StockDocument } from 'src/schema/stock.schema';
import { Pvp, type PvpDocument } from 'src/schema/pvp.schema';
import {
  ACCESSORY_DEFAULT_PVP_COP,
  BULK_DEFAULT_QUANTITY,
  BULK_IMAGE_URL,
  PABLO_ACCESSORY_SKUS,
} from 'src/constants/bulk-product';

const OWNER = 'pablo' as const;

function parseArgs() {
  return { dryRun: process.argv.slice(2).includes('--dry-run') };
}

async function main() {
  const { dryRun } = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const ownerModels = app.get(OwnerModelsService);

  const beforeEsteban = await runWithOwnerAsync('esteban', async () => {
    const stockModel = ownerModels.getModel<StockDocument>(Stock.name);
    return stockModel
      .find({
        card_id: { $in: PABLO_ACCESSORY_SKUS.map((s) => s.card_id) },
      })
      .lean()
      .exec();
  });

  await runWithOwnerAsync(OWNER, async () => {
    const stockModel = ownerModels.getModel<StockDocument>(Stock.name);
    const pvpModel = ownerModels.getModel<PvpDocument>(Pvp.name);

    for (const sku of PABLO_ACCESSORY_SKUS) {
      const existingStock = await stockModel
        .findOne({ card_id: sku.card_id })
        .exec();
      let stockId: string;

      if (existingStock) {
        stockId = String(existingStock._id);
        const patch: Record<string, unknown> = {};
        if (existingStock.card_name !== sku.card_name) {
          patch.card_name = sku.card_name;
        }
        if (String(existingStock.product_kind ?? '') !== 'quantity') {
          patch.product_kind = 'quantity';
        }
        const qty = (existingStock as { quantity?: number }).quantity;
        if (typeof qty !== 'number') {
          patch.quantity = BULK_DEFAULT_QUANTITY;
        }
        if (String(existingStock.card_state ?? '').trim() !== 'disponible') {
          patch.card_state = 'disponible';
        }
        if (!existingStock.image_url) {
          patch.image_url = BULK_IMAGE_URL;
        }
        if (Object.keys(patch).length > 0) {
          if (dryRun) {
            console.log(
              `[dry-run] patch stock ${sku.card_id}`,
              JSON.stringify(patch),
            );
          } else {
            await stockModel
              .updateOne({ _id: existingStock._id }, { $set: patch })
              .exec();
            console.log(`[ok] patched stock ${sku.card_id} (${stockId})`);
          }
        } else {
          console.log(`[skip] stock ya ok ${sku.card_id} (${stockId})`);
        }
      } else if (dryRun) {
        console.log(
          `[dry-run] create stock ${sku.card_id} qty=${BULK_DEFAULT_QUANTITY} pvp=${sku.pvp_cop}`,
        );
        stockId = '(new)';
      } else {
        const created = await stockModel.create({
          card_id: sku.card_id,
          card_name: sku.card_name,
          shipment: 0,
          unity_cost: 0,
          cards_in_shipmet: 1,
          image_url: BULK_IMAGE_URL,
          card_state: 'disponible',
          currency: 'COP',
          product_kind: 'quantity',
          quantity: BULK_DEFAULT_QUANTITY,
        });
        stockId = String(created._id);
        console.log(`[ok] created stock ${sku.card_id} (${stockId})`);
      }

      const existingPvp = await pvpModel
        .findOne({
          card_id: sku.card_id,
          $or: [
            { rareza: { $exists: false } },
            { rareza: null },
            { rareza: '' },
          ],
        })
        .exec();

      if (existingPvp) {
        if (existingPvp.pvp !== ACCESSORY_DEFAULT_PVP_COP) {
          if (dryRun) {
            console.log(
              `[dry-run] update pvp ${sku.card_id} ${existingPvp.pvp} -> ${ACCESSORY_DEFAULT_PVP_COP}`,
            );
          } else {
            await pvpModel
              .updateOne(
                { _id: existingPvp._id },
                {
                  $set: {
                    pvp: ACCESSORY_DEFAULT_PVP_COP,
                    currency: 'COP',
                    rareza: null,
                    updated_at: new Date(),
                  },
                },
              )
              .exec();
            console.log(
              `[ok] updated pvp ${sku.card_id} -> ${ACCESSORY_DEFAULT_PVP_COP} COP`,
            );
          }
        } else {
          console.log(
            `[skip] pvp ya ok ${sku.card_id} = ${ACCESSORY_DEFAULT_PVP_COP}`,
          );
        }
      } else if (dryRun) {
        console.log(
          `[dry-run] create pvp ${sku.card_id} = ${ACCESSORY_DEFAULT_PVP_COP}`,
        );
      } else {
        await pvpModel.create({
          card_id: sku.card_id,
          pvp: ACCESSORY_DEFAULT_PVP_COP,
          currency: 'COP',
          rareza: null,
          created_at: new Date(),
          updated_at: new Date(),
        });
        console.log(
          `[ok] created pvp ${sku.card_id} = ${ACCESSORY_DEFAULT_PVP_COP} COP`,
        );
      }
    }
  });

  const afterEsteban = await runWithOwnerAsync('esteban', async () => {
    const stockModel = ownerModels.getModel<StockDocument>(Stock.name);
    return stockModel
      .find({
        card_id: { $in: PABLO_ACCESSORY_SKUS.map((s) => s.card_id) },
      })
      .lean()
      .exec();
  });

  const beforeIds = beforeEsteban.map((s) => String(s._id)).sort().join(',');
  const afterIds = afterEsteban.map((s) => String(s._id)).sort().join(',');
  if (beforeIds !== afterIds) {
    console.error('[warn] Esteban accessory SKUs cambiaron; no se esperaba mutación');
  } else {
    console.log('[ok] Esteban sin cambios en envio/proteccion');
  }

  await app.close();
  console.log(`[ensure-pablo-accessory-skus] dryRun=${dryRun} done`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
