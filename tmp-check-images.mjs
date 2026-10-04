const h = { 'x-owner': 'pablo' };

async function getJson(url) {
  const res = await fetch(url, { headers: h });
  const text = await res.text();
  if (!text) throw new Error(`empty body ${res.status} ${url}`);
  return { status: res.status, data: JSON.parse(text) };
}

const stockRes = await getJson('http://127.0.0.1:3000/pokemon/stock');
const stock = stockRes.data;
const ids = [...new Set(stock.map((r) => r.card_id).filter(Boolean))];
const byPrefix = new Map();
for (const id of ids) {
  const dash = id.lastIndexOf('-');
  const p = dash > 0 ? id.slice(0, dash) : id;
  if (!byPrefix.has(p)) byPrefix.set(p, id);
}
const sample = [...byPrefix.values()];
let ok = 0;
let fail = 0;
let empty = 0;
let noCard = 0;
const fails = [];
for (const id of sample) {
  const url = `http://127.0.0.1:3000/pokemon/tcg-dex/card/find/${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: h });
  const text = await res.text();
  if (!res.ok || !text) {
    noCard += 1;
    fails.push(`NOCARD ${res.status} ${id} body=${text.slice(0, 80)}`);
    continue;
  }
  const c = JSON.parse(text);
  const img = (c && (c.image || c.images?.small)) || '';
  if (!img) {
    empty += 1;
    fails.push(`EMPTY ${id} name=${c?.name ?? ''}`);
    continue;
  }
  try {
    const ir = await fetch(img, { method: 'HEAD' });
    if (ir.ok) ok += 1;
    else {
      fail += 1;
      fails.push(`IMG ${ir.status} ${id} ${img.slice(0, 140)}`);
    }
  } catch (err) {
    fail += 1;
    fails.push(`NET ${id} ${img.slice(0, 140)} ${err.message}`);
  }
}
console.log(JSON.stringify({ ok, fail, empty, noCard, sampled: sample.length }));
console.log(fails.slice(0, 50).join('\n'));
