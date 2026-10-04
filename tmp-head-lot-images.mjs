import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGO_URI;
if (!uri) process.exit(1);
await mongoose.connect(uri, { dbName: 'test' });
const lines = await mongoose.connection.db
  .collection('cardtrader_transit_lines')
  .find({ lot_id: '6ac1cfc55ac251cd95e42e1f' })
  .project({ card_id: 1, card_name: 1, image_url: 1 })
  .toArray();

const groups = new Map();
for (const line of lines) {
  const url = String(line.image_url ?? '').trim();
  const key = url || '(empty)';
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(`${line.card_name}|${line.card_id}`);
}

let ok = 0;
let bad = 0;
for (const [url, cards] of groups) {
  if (url === '(empty)') {
    bad += 1;
    console.log('EMPTY', cards.join(' ; '));
    continue;
  }
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) ok += 1;
    else {
      bad += 1;
      console.log('BAD', res.status, url, cards[0]);
    }
  } catch (err) {
    bad += 1;
    console.log('ERR', url, err.message, cards[0]);
  }
}
console.log(`urls ok=${ok} bad=${bad} groups=${groups.size}`);
await mongoose.disconnect();
