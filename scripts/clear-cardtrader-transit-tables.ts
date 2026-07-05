/**
 * Vacía cardtrader_transit_lots y cardtrader_transit_lines.
 *
 * Preferencia: API Nest en marcha:
 *   npx ts-node -r tsconfig-paths/register scripts/clear-cardtrader-transit-tables.ts --api
 *
 * Alternativa: contexto Nest + Mongo:
 *   npx ts-node -r tsconfig-paths/register scripts/clear-cardtrader-transit-tables.ts
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { CardtraderTransitLotService } from 'src/service/cardtrader/cardtrader-transit-lot.service';

async function clearViaApi(port = process.env.PORT ?? '3000'): Promise<{
  deleted_lots: number;
  deleted_lines: number;
}> {
  const url = `http://localhost:${port}/cardtrader/transit-lots`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DELETE ${url} -> ${res.status}: ${body}`);
  }
  return (await res.json()) as { deleted_lots: number; deleted_lines: number };
}

async function clearViaNest(): Promise<{ deleted_lots: number; deleted_lines: number }> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(CardtraderTransitLotService);
    const result = await service.clearAllLots();
    console.log(
      `[clear-cardtrader-transit] lotes: ${result.deleted_lots}, líneas: ${result.deleted_lines}`,
    );
    return result;
  } finally {
    await app.close();
  }
}

async function main() {
  const useApi = process.argv.includes('--api');
  if (useApi) {
    const result = await clearViaApi();
    console.log(
      `[clear-cardtrader-transit] via API: ${result.deleted_lots} lotes, ${result.deleted_lines} líneas eliminados`,
    );
    return;
  }
  await clearViaNest();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
