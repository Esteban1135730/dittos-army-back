/**
 * Diagnóstico: de dónde sale inventory_cost_cop / capital del dashboard.
 * Uso: npx ts-node -r tsconfig-paths/register scripts/diag-inventory-capital.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const SYNTHETIC = new Set([
  'da-bulk',
  'da-envio',
  'da-domicilio',
  'da-proteccion-cartas',
]);
const NON_INV = new Set(['vendida', 'propiedad']);
const EUR = parseFloat(process.env.EUR_TO_COP || '0') || 5000;
const USD = parseFloat(process.env.USD_TO_COP || '0') || 4500;

function toCop(amount: number, currency: string): number {
  const c = (currency || 'COP').toUpperCase();
  if (c === 'COP') return Math.round(amount);
  if (c === 'EUR') return Math.round(amount * EUR);
  if (c === 'USD') return Math.round(amount * USD);
  return Math.round(amount);
}

function lineCost(s: {
  shipment?: number;
  unity_cost?: number;
  cards_in_shipmet?: number;
  currency?: string;
}): number {
  const n = s.cards_in_shipmet || 1;
  return toCop((s.shipment ?? 0) / n + (s.unity_cost ?? 0), s.currency ?? 'COP');
}

async function diagnose(dbName: string) {
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) throw new Error('MONGO_URI missing');
  const conn = await mongoose.createConnection(uri, { dbName }).asPromise();
  const stocks = await conn.collection('stocks').find({}).toArray();
  const tags = await conn.collection('card_stock_tags').find({}).toArray();
  const bulkIds = new Set(
    tags
      .filter((t) =>
        (t.tags ?? []).map((x: string) => String(x).toLowerCase()).includes('bulk'),
      )
      .map((t) => String(t.card_id)),
  );

  let total = 0;
  let sellable = 0;
  let syntheticCost = 0;
  let bulkTagCost = 0;
  let bulkNameCost = 0;
  let dummyImgCost = 0;
  let qtyKindCost = 0;
  let eurCost = 0;
  let usdCost = 0;
  let eurN = 0;
  let usdN = 0;
  let copN = 0;
  let copCost = 0;
  const byState: Record<string, { n: number; cost: number }> = {};
  const top: Array<{
    name: string;
    card_id: string;
    state: string;
    cost: number;
    currency: string;
    unity_cost: number;
    shipment: number;
    cards: number;
    qty?: number;
    kind?: string;
  }> = [];

  for (const s of stocks) {
    const state = String(s.card_state ?? 'sin_estado').toLowerCase();
    const cost = lineCost(s as {
      shipment?: number;
      unity_cost?: number;
      cards_in_shipmet?: number;
      currency?: string;
    });
    byState[state] = byState[state] ?? { n: 0, cost: 0 };
    byState[state].n += 1;
    byState[state].cost += cost;
    if (NON_INV.has(state)) continue;
    sellable += 1;
    total += cost;
    const cid = String(s.card_id ?? '');
    const name = String(s.card_name ?? '').toLowerCase();
    const img = String(s.image_url ?? '');
    if (SYNTHETIC.has(cid)) syntheticCost += cost;
    if (bulkIds.has(cid) || (s.tags ?? []).includes('bulk')) bulkTagCost += cost;
    if (name === 'bulk' || name === 'envio' || name === 'domicilio')
      bulkNameCost += cost;
    if (img.includes('bulk-dummy')) dummyImgCost += cost;
    if (s.product_kind === 'quantity') qtyKindCost += cost;
    const cur = String(s.currency ?? 'COP').toUpperCase();
    if (cur === 'EUR') {
      eurCost += cost;
      eurN += 1;
    } else if (cur === 'USD') {
      usdCost += cost;
      usdN += 1;
    } else {
      copN += 1;
      copCost += cost;
    }
    top.push({
      name: String(s.card_name ?? ''),
      card_id: cid,
      state,
      cost,
      currency: String(s.currency ?? 'COP'),
      unity_cost: s.unity_cost ?? 0,
      shipment: s.shipment ?? 0,
      cards: s.cards_in_shipmet ?? 0,
      qty: s.quantity,
      kind: s.product_kind,
    });
  }

  top.sort((a, b) => b.cost - a.cost);
  console.log(JSON.stringify({
    dbName,
    stockCount: stocks.length,
    sellable,
    inventory_cost_cop: total,
    syntheticCost,
    bulkTagCost,
    bulkNameCost,
    dummyImgCost,
    qtyKindCost,
    eurCost,
    eurN,
    usdCost,
    usdN,
    copCost,
    copN,
    bulkTaggedCardIds: bulkIds.size,
    byState,
    top15: top.slice(0, 15),
    withoutBulkTag: total - bulkTagCost,
    withoutSynthetic: total - syntheticCost,
    withoutBulkAndSynthetic: total - bulkTagCost - syntheticCost,
  }, null, 2));
  await conn.close();
}

async function main() {
  await diagnose('test');
  await diagnose('esteban');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
