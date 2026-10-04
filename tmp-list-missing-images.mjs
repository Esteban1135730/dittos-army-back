import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI missing');
  process.exit(1);
}

await mongoose.connect(uri, { dbName: 'test' });
const db = mongoose.connection.db;

const lotId = '6ac1cfc55ac251cd95e42e1f';
const lines = await db
  .collection('cardtrader_transit_lines')
  .find({ lot_id: lotId })
  .project({
    card_id: 1,
    card_name: 1,
    image_url: 1,
    expansion: 1,
    collector_number: 1,
    language: 1,
    blueprint_id: 1,
  })
  .toArray();

const emptyLines = lines.filter((l) => !String(l.image_url ?? '').trim());
console.log(`transit lines ${lines.length} empty image_url ${emptyLines.length}`);
for (const l of emptyLines) {
  console.log(
    `LINE ${l._id} ${l.card_name} | ${l.card_id} | ${l.expansion} #${l.collector_number} lang=${l.language} bp=${l.blueprint_id}`,
  );
}

const stocks = await db
  .collection('stocks')
  .find({})
  .project({ card_id: 1, card_name: 1, image_url: 1 })
  .toArray();
const emptyStock = stocks.filter((s) => !String(s.image_url ?? '').trim());
console.log(`stock ${stocks.length} empty image_url ${emptyStock.length}`);
const byCard = new Map();
for (const s of emptyStock) {
  const key = s.card_id || '(none)';
  if (!byCard.has(key)) byCard.set(key, { name: s.card_name, n: 0, ids: [] });
  const g = byCard.get(key);
  g.n += 1;
  g.ids.push(String(s._id));
}
for (const [cardId, g] of byCard) {
  console.log(`STOCK-EMPTY ${g.n}x ${g.name} | ${cardId} | ${g.ids.join(',')}`);
}

const badRe = /(TG0\d{2,}|GG0\d{2,}|SV0\d{2,}|103a\/|swshp-SWSH\d{1,2}$)/i;
const bad = stocks.filter((s) => badRe.test(String(s.card_id ?? '')));
console.log(`stock bad-pattern ${bad.length}`);
for (const s of bad) {
  console.log(
    `STOCK-BAD ${s._id} ${s.card_name} | ${s.card_id} | img=${String(s.image_url ?? '').slice(0, 80)}`,
  );
}

await mongoose.disconnect();
