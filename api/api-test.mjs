/**
 * The API end to end, against the Firestore emulator: start the server,
 * seed a company, call every endpoint the way an integration would.
 *
 * Run from rules-test/ (for its firebase.json):
 *   npx firebase emulators:exec --project demo-stockcheck --only firestore "node ../api/api-test.mjs"
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sha256 } from './lib.mjs';

process.env.GCLOUD_PROJECT ||= 'demo-stockcheck';
initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();
const here = dirname(fileURLToPath(import.meta.url));

const TOKEN = 'sck_test_token_for_the_api_suite_0001';
const ws = db.collection('workspaces').doc('w1');
await db.doc(`apiTokens/${sha256(TOKEN)}`).set({ workspaceId: 'w1', name: 'Test', createdAt: 1 });
await ws.collection('products').doc('9555').set({ name: 'Milo', priceSen: 1590, unit: 'pcs', active: true });
await ws.collection('meta').doc('config').set({ branches: [{ id: 'ipoh', name: 'Ipoh' }] });
await ws.collection('stockChecks').doc('c1').set({ status: 'COMPLETED', createdAt: 1000, completedAt: 1000, branchId: '', zone: '' });
await ws.collection('stockChecks').doc('c1').collection('items').doc('i1').set({ barcode: '9555', productName: 'Milo', quantityMilli: 20000 });
await ws.collection('movements').doc('m1').set({ barcode: '9555', type: 'SALE', quantityMilli: 2000, at: Date.now(), branchId: '' });
await ws.collection('sales').doc('s1').set({ receiptNo: 'R1', status: 'COMPLETED', createdAt: Date.now(), branchId: '', totalSen: 3180, lines: [], payments: [] });
// Another company's item, which this token must never see.
await db.collection('workspaces').doc('w2').collection('products').doc('secret').set({ name: 'Not yours' });

const PORT = 18080 + Math.floor(Math.random() * 1000);
const server = spawn(process.execPath, [join(here, 'server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
const base = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 200));
}

const call = async (method, path, body, token = TOKEN) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
};

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', `${name}: ${e.message}`]); }
};
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };

await check('no token is refused', async () => eq((await call('GET', '/v1/items', null, null)).status, 401, 'status'));
await check('a wrong token is refused', async () => eq((await call('GET', '/v1/items', null, 'sck_wrong_token_wrong_token_wrong')).status, 401, 'status'));
await check('items are this company\'s only', async () => {
  const r = await call('GET', '/v1/items');
  eq(r.json.items.map((i) => i.barcode), ['9555'], 'barcodes');
  eq(r.json.items[0].price_sen, 1590, 'price');
});
await check('create and update items', async () => {
  let r = await call('POST', '/v1/items', { items: [{ barcode: '1234', name: 'Teh', price_sen: 250 }, { barcode: '9555', price_sen: 1690 }] });
  eq(r.status, 200, 'status');
  r = await call('GET', '/v1/items/9555');
  eq([r.json.name, r.json.price_sen], ['Milo', 1690], 'updated, name kept');
  eq((await call('GET', '/v1/items/1234')).json.name, 'Teh', 'created');
});
await check('a new item without a name is refused', async () => eq((await call('POST', '/v1/items', { barcode: '777' })).status, 400, 'status'));
await check('inventory is the count less sales since', async () => {
  const r = await call('GET', '/v1/inventory?store_id=&barcode=9555');
  eq(r.json.inventory_levels[0].in_stock, 18, 'in_stock');
});
await check('stock_after records the difference', async () => {
  const r = await call('POST', '/v1/inventory', { inventory_levels: [{ barcode: '9555', store_id: '', stock_after: 15 }] });
  eq(r.json.inventory_levels[0], { barcode: '9555', store_id: '', in_stock: 15, changed: true }, 'result');
  eq((await call('GET', '/v1/inventory?store_id=&barcode=9555')).json.inventory_levels[0].in_stock, 15, 'after');
  const moves = (await ws.collection('movements').where('source', '==', 'API').get()).docs.map((d) => d.data());
  eq(moves.map((m) => [m.type, m.quantityMilli]), [['WRITE_OFF', 3000]], 'movement');
});
await check('receipts', async () => eq((await call('GET', '/v1/receipts')).json.receipts[0].receipt_number, 'R1', 'receipt'));
await check('customers: create, then update without touching points', async () => {
  const made = await call('POST', '/v1/customers', { name: 'Ah Seng', phone: '012' });
  eq(made.json.points, 0, 'points');
  const updated = await call('POST', '/v1/customers', { id: made.json.id, phone: '013', points: 99999 });
  eq([updated.json.phone, updated.json.points], ['013', 0], 'update');
});
await check('stores', async () => eq((await call('GET', '/v1/stores')).json.stores.map((s) => s.id), ['', 'ipoh'], 'stores'));
await check('unknown endpoint is a 404 in JSON', async () => eq((await call('GET', '/v1/nope')).status, 404, 'status'));

server.kill();
let failed = 0;
for (const [ok, name] of results) { if (ok !== 'PASS') failed++; console.log(`${ok}  ${name}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
