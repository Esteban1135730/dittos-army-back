/**
 * Agrupa reservas de stock sin `pedido_id` en un Pedido `reservado` por cliente.
 * Si el cliente ya tiene un pedido `reservado`, adjunta las huérfanas a ese pedido
 * (no crea un segundo abierto). Si solo hay un `pagado` abierto, las omite.
 *
 * Uso (desde `dittos-army-back/`):
 *   npm run script:backfill-pedidos:dry
 *   npm run script:backfill-pedidos
 *
 * Recorre ambas DBs de owner (pablo / esteban).
 */

import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { OWNERS_CONFIG, type OwnerKey } from 'src/config/owners.config';
import { OwnerModelsService } from 'src/owner/owner-models.service';
import { runWithOwnerAsync } from 'src/owner/owner-context';
import { Client, type ClientDocument } from 'src/schema/client.schema';
import { Reserva, type ReservaDocument } from 'src/schema/reserva.schema';
import { Pedido, type PedidoDocument } from 'src/schema/pedido.schema';
import { matchTiendaEntregaFromLegacy } from 'src/utils/tiendas-entrega';
import { RESERVA_ORPHAN_PEDIDO_QUERY } from 'src/repository/reserva.repository';

function parseArgs() {
  const argv = process.argv.slice(2);
  return { dryRun: argv.includes('--dry-run') };
}

function entregaFromClient(client: ClientDocument | null) {
  const matched = matchTiendaEntregaFromLegacy(client?.tienda_entrega);
  if (matched) {
    return {
      entrega_en_tienda: true,
      store_id: matched.id,
      store_name: matched.name,
      store_address: matched.address,
    };
  }
  const legacy = client?.tienda_entrega?.trim() || 'Sin dirección (migrado)';
  return {
    entrega_en_tienda: false,
    ciudad: 'Bogotá',
    direccion_o_punto: legacy,
  };
}

async function backfillOwner(
  owner: OwnerKey,
  ownerModels: OwnerModelsService,
  dryRun: boolean,
): Promise<{
  clients: number;
  reservas: number;
  created: number;
  attached: number;
  skippedPagado: number;
}> {
  return runWithOwnerAsync(owner, async () => {
    const reservaModel = ownerModels.getModel<ReservaDocument>(Reserva.name);
    const clientModel = ownerModels.getModel<ClientDocument>(Client.name);
    const pedidoModel = ownerModels.getModel<PedidoDocument>(Pedido.name);

    const orphans = await reservaModel
      .find(RESERVA_ORPHAN_PEDIDO_QUERY)
      .exec();

    const byClient = new Map<string, ReservaDocument[]>();
    for (const reserva of orphans) {
      const cid = String(reserva.client_id ?? '').trim();
      if (!cid) continue;
      const list = byClient.get(cid) ?? [];
      list.push(reserva);
      byClient.set(cid, list);
    }

    let created = 0;
    let attached = 0;
    let skippedPagado = 0;
    for (const [clientId, reservas] of byClient) {
      const existingReservado = await pedidoModel
        .findOne({ client_id: clientId, status: 'reservado' })
        .exec();
      const existingPagado = existingReservado
        ? null
        : await pedidoModel
            .findOne({ client_id: clientId, status: 'pagado' })
            .exec();

      if (existingPagado) {
        console.warn(
          `[skip][${owner}] client=${clientId} reservas=${reservas.length} pedido pagado abierto; no se crea un segundo pedido`,
        );
        skippedPagado += 1;
        continue;
      }

      const now = new Date();
      if (existingReservado) {
        const pedidoId = String(existingReservado._id);
        if (dryRun) {
          console.log(
            `[dry-run][${owner}] attach client=${clientId} reservas=${reservas.length} pedido=${pedidoId}`,
          );
          attached += 1;
          continue;
        }
        await reservaModel.updateMany(
          { _id: { $in: reservas.map((r) => r._id) } },
          { $set: { pedido_id: pedidoId, updated_at: now } },
        );
        attached += 1;
        continue;
      }

      const client = await clientModel.findById(clientId).exec();
      const entrega = entregaFromClient(client);
      if (dryRun) {
        console.log(
          `[dry-run][${owner}] client=${clientId} reservas=${reservas.length} entrega_en_tienda=${entrega.entrega_en_tienda}`,
        );
        created += 1;
        continue;
      }
      const pedido = await new pedidoModel({
        client_id: clientId,
        status: 'reservado',
        ...entrega,
        created_at: now,
        updated_at: now,
      }).save();
      const pedidoId = String(pedido._id);
      await reservaModel.updateMany(
        { _id: { $in: reservas.map((r) => r._id) } },
        { $set: { pedido_id: pedidoId, updated_at: now } },
      );
      created += 1;
    }

    return {
      clients: byClient.size,
      reservas: orphans.length,
      created: dryRun ? 0 : created,
      attached: dryRun ? 0 : attached,
      skippedPagado,
    };
  });
}

async function main() {
  const { dryRun } = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const ownerModels = app.get(OwnerModelsService);
  const owners = Object.keys(OWNERS_CONFIG.owners) as OwnerKey[];

  for (const owner of owners) {
    const r = await backfillOwner(owner, ownerModels, dryRun);
    console.log(
      `[backfill-pedidos] owner=${owner} clientes=${r.clients} reservas=${r.reservas} pedidos_nuevos=${r.created} adjuntados=${r.attached} skip_pagado=${r.skippedPagado}`,
    );
  }

  console.log(`[backfill-pedidos] dryRun=${dryRun} listo`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
