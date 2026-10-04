import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI missing');
  process.exit(1);
}

const PORYGON_IMAGE =
  'https://www.cardtrader.com/uploads/blueprints/image/110281/show_porygon-103a-147-aquapolis.jpg';
const WOOLOO_IMAGE = 'https://assets.tcgdex.net/en/swsh/swshp/SWSH011/low.png';

const stockUpdates = [
  {
    id: '6a30a79d8d4d31180c979ad5',
    card_id: 'base1-38',
    image_url: 'https://assets.tcgdex.net/en/base/base1/38/low.png',
  },
  {
    id: '6a30a79d8d4d31180c979ad9',
    card_id: 'base1-24',
    image_url: 'https://assets.tcgdex.net/en/base/base1/24/low.png',
  },
  {
    id: '6a30a79f8d4d31180c979ae1',
    card_id: 'ex2-78',
    image_url: 'https://assets.tcgdex.net/en/ex/ex2/78/low.png',
  },
  {
    id: '6a30a7a08d4d31180c979ae5',
    card_id: 'ex14-40',
    image_url: 'https://assets.tcgdex.net/en/ex/ex14/40/low.png',
  },
  { id: '68727a9cd7e046f099d332a5', card_id: 'swsh12tg-TG05' },
  { id: '68727b4cd7e046f099d332ad', card_id: 'swsh12tg-TG05' },
  { id: '68727b65d7e046f099d332af', card_id: 'swsh10tg-TG05' },
  { id: '6a03967cd89c3b5fb483f573', card_id: 'swsh4.5sv-SV035' },
  { id: '6a03967cd89c3b5fb483f56f', card_id: 'swsh4.5sv-SV035' },
  { id: '6a03967cd89c3b5fb483f7e7', card_id: 'swsh12.5gg-GG47' },
  { id: '6a03967cd89c3b5fb483f7ea', card_id: 'swsh10tg-TG11' },
  {
    id: '6a30ae7d8bb900d001c58113',
    card_id: 'swsh4.5sv-SV078',
    image_url: 'https://assets.tcgdex.net/en/swsh/swsh4.5/SV078/low.png',
  },
  {
    id: '6a30ae7d8bb900d001c5812d',
    card_id: 'swsh4.5sv-SV078',
    image_url: 'https://assets.tcgdex.net/en/swsh/swsh4.5/SV078/low.png',
  },
  {
    id: '6a30ae7d8bb900d001c58126',
    card_id: 'swsh4.5sv-SV030',
    image_url: 'https://assets.tcgdex.net/en/swsh/swsh4.5/SV030/low.png',
  },
  {
    id: '6a30ae7d8bb900d001c58129',
    card_id: 'swsh4.5sv-SV042',
    image_url: 'https://assets.tcgdex.net/en/swsh/swsh4.5/SV042/low.png',
  },
];

await mongoose.connect(uri, { dbName: 'test' });
const db = mongoose.connection.db;
const lines = db.collection('cardtrader_transit_lines');
const stocks = db.collection('stocks');

const porygon = await lines.updateMany(
  {
    _id: {
      $in: [
        '6ac1cfc55ac251cd95e42e7f',
        '6ac1cfc55ac251cd95e42e80',
        '6ac1cfc55ac251cd95e42e81',
      ].map((id) => new mongoose.Types.ObjectId(id)),
    },
  },
  { $set: { image_url: PORYGON_IMAGE } },
);
console.log(`porygon image matched=${porygon.matchedCount} modified=${porygon.modifiedCount}`);

const wooloo = await lines.updateOne(
  { _id: new mongoose.Types.ObjectId('6ac1cfc55ac251cd95e42e95') },
  { $set: { image_url: WOOLOO_IMAGE } },
);
console.log(`wooloo image matched=${wooloo.matchedCount} modified=${wooloo.modifiedCount}`);

for (const row of stockUpdates) {
  const set = { card_id: row.card_id };
  if (row.image_url) set.image_url = row.image_url;
  const result = await stocks.updateOne(
    { _id: new mongoose.Types.ObjectId(row.id) },
    { $set: set },
  );
  console.log(
    `${row.id} -> ${row.card_id} matched=${result.matchedCount} modified=${result.modifiedCount}`,
  );
}

await mongoose.disconnect();
