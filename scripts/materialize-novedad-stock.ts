/**
 * Sincroniza y materializa cartas con novedad (homolog) en stock.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/materialize-novedad-stock.ts --usd 4200 --eur 4500
 *   npx ts-node -r tsconfig-paths/register scripts/materialize-novedad-stock.ts --usd 4200 --eur 4500 --session 6a2ce040d102534fd1d71a24
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { IncomingHomologService } from 'src/service/incoming-homolog.service';

function parseArgs() {
  const argv = process.argv.slice(2);
  const usdIdx = argv.indexOf('--usd');
  const eurIdx = argv.indexOf('--eur');
  const sessionIdx = argv.indexOf('--session');
  const usd = usdIdx >= 0 ? Number(argv[usdIdx + 1]) : Number(process.env.USD_TO_COP);
  const eur = eurIdx >= 0 ? Number(argv[eurIdx + 1]) : Number(process.env.EURO_TO_COP);
  const session_id =
    sessionIdx >= 0 ? String(argv[sessionIdx + 1] ?? '').trim() : undefined;
  return { usd_to_cop: usd, euro_to_cop: eur, session_id };
}

async function main() {
  const { usd_to_cop, euro_to_cop, session_id } = parseArgs();
  if (!Number.isFinite(usd_to_cop) || usd_to_cop <= 0) {
    throw new Error('Pasa --usd <COP por USD> o variable USD_TO_COP');
  }
  if (!Number.isFinite(euro_to_cop) || euro_to_cop <= 0) {
    throw new Error('Pasa --eur <COP por EUR> o variable EURO_TO_COP');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const homolog = app.get(IncomingHomologService);
    const result = await homolog.materializeNovedadStock({
      session_id,
      usd_to_cop,
      euro_to_cop,
    });
    console.log(
      JSON.stringify(
        {
          session_id: result.session_id,
          created: result.created,
          items: result.items.map((i) => ({
            card_name: i.card_name,
            stock_id: i.stock_id,
            unit_cost_cop: i.unit_cost_cop,
            language: i.language,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
