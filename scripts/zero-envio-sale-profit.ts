/**
 * Backfill:
 * - `da-envio`: conserva precio y `cost_cop_snapshot = amount_cop` (ganancia 0).
 * - `da-domicilio`: restaura costo 0 (ganancia 100%), por si un backfill previo lo igualó al precio.
 *
 * Uso (desde `dittos-army-back/`):
 *   npx ts-node -r tsconfig-paths/register scripts/zero-envio-sale-profit.ts
 *   npx ts-node -r tsconfig-paths/register scripts/zero-envio-sale-profit.ts --dry-run
 */

import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { OWNERS_CONFIG, type OwnerKey } from 'src/config/owners.config';
import { OwnerModelsService } from 'src/owner/owner-models.service';
import { runWithOwnerAsync } from 'src/owner/owner-context';
import { Sale, type SaleDocument } from 'src/schema/sale.schema';
import {
  DOMICILIO_CARD_ID,
  ENVIO_CARD_ID,
} from 'src/constants/bulk-product';
import { effectiveSaleCostCop } from 'src/utils/sale-cost-snapshot';

function parseArgs() {
  return { dryRun: process.argv.slice(2).includes('--dry-run') };
}

async function main() {
  const { dryRun } = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const ownerModels = app.get(OwnerModelsService);
  const owners = Object.keys(OWNERS_CONFIG.owners) as OwnerKey[];

  for (const owner of owners) {
    await runWithOwnerAsync(owner, async () => {
      const saleModel = ownerModels.getModel<SaleDocument>(Sale.name);

      const envioSales = await saleModel
        .find({ card_id: ENVIO_CARD_ID, type: 'venta' })
        .exec();
      let envioPatched = 0;
      let envioSkipped = 0;
      for (const sale of envioSales) {
        const amount = Math.round(sale.amount_cop ?? 0);
        const desiredCost = effectiveSaleCostCop(sale.card_id, amount, 0);
        if (sale.cost_cop_snapshot === desiredCost) {
          envioSkipped += 1;
          continue;
        }
        if (dryRun) {
          console.log(
            `[dry-run] ${owner} envio ${String(sale._id)} amount=${amount} cost ${sale.cost_cop_snapshot ?? '∅'} -> ${desiredCost}`,
          );
        } else {
          await saleModel
            .updateOne(
              { _id: sale._id },
              { $set: { cost_cop_snapshot: desiredCost } },
            )
            .exec();
          console.log(
            `[ok] ${owner} envio ${String(sale._id)} cost_cop_snapshot=${desiredCost} (precio ${amount})`,
          );
        }
        envioPatched += 1;
      }

      const domicilioSales = await saleModel
        .find({ card_id: DOMICILIO_CARD_ID, type: 'venta' })
        .exec();
      let domicilioReverted = 0;
      let domicilioSkipped = 0;
      for (const sale of domicilioSales) {
        if ((sale.cost_cop_snapshot ?? 0) === 0) {
          domicilioSkipped += 1;
          continue;
        }
        if (dryRun) {
          console.log(
            `[dry-run] ${owner} domicilio ${String(sale._id)} cost ${sale.cost_cop_snapshot} -> 0 (ganancia 100%)`,
          );
        } else {
          await saleModel
            .updateOne(
              { _id: sale._id },
              { $set: { cost_cop_snapshot: 0 } },
            )
            .exec();
          console.log(
            `[ok] ${owner} domicilio ${String(sale._id)} cost_cop_snapshot=0 (precio ${sale.amount_cop})`,
          );
        }
        domicilioReverted += 1;
      }

      console.log(
        `[${owner}] envio ventas=${envioSales.length} patched=${envioPatched} skipped=${envioSkipped}; domicilio revert=${domicilioReverted} skipped=${domicilioSkipped} dryRun=${dryRun}`,
      );
    });
  }

  await app.close();
  console.log(`[zero-envio-sale-profit] dryRun=${dryRun} done`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
