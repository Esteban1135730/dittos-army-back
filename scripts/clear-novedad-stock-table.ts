/**
 * Vacía la colección incoming_homolog_novedad_stock.
 *
 * Preferencia: API Nest en marcha (no requiere Mongo directo):
 *   npx ts-node -r tsconfig-paths/register scripts/clear-novedad-stock-table.ts --api
 *
 * Alternativa: contexto Nest + Mongo (misma conexión que el back):
 *   npx ts-node -r tsconfig-paths/register scripts/clear-novedad-stock-table.ts
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { AppModule } from 'src/app.module';
import { IncomingHomologNovedadStock } from 'src/schema/incoming-homolog-novedad-stock.schema';

async function clearViaApi(port = process.env.PORT ?? '3000'): Promise<number> {
  const base = `http://localhost:${port}/incoming/homolog/novedad-stock`;
  const res = await fetch(base, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DELETE ${base} -> ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { deleted?: number };
  return json.deleted ?? 0;
}

async function clearViaMongo(): Promise<number> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const model = app.get(getModelToken(IncomingHomologNovedadStock.name));
    const before = await model.countDocuments({});
    const { deletedCount } = await model.deleteMany({});
    const after = await model.countDocuments({});
    console.log(
      `[clear-novedad-stock] incoming_homolog_novedad_stock: ${before} -> ${after} (eliminados: ${deletedCount ?? 0})`,
    );
    return deletedCount ?? 0;
  } finally {
    await app.close();
  }
}

async function main() {
  const useApi = process.argv.includes('--api');
  if (useApi) {
    const deleted = await clearViaApi();
    console.log(
      `[clear-novedad-stock] via API: eliminados ${deleted} documentos de incoming_homolog_novedad_stock`,
    );
    return;
  }
  await clearViaMongo();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
