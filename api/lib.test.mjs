// node api/lib.test.mjs
import assert from 'node:assert/strict';
import { bearer, customerIn, itemIn, itemOut, offlineOpIn, pageSize, rateKey, rateLimitOptions, receiptOut, sha256, stockChange } from './lib.mjs';

const tests = [];
const test = (n, f) => tests.push([n, f]);

test('bearer tokens', () => {
  assert.equal(bearer('Bearer sck_abcdefghijklmnopqrstuvwxyz'), 'sck_abcdefghijklmnopqrstuvwxyz');
  assert.equal(bearer('Bearer nope'), null);
  assert.equal(bearer(undefined), null);
  assert.equal(sha256('x').length, 64);
});

test('page size is clamped', () => {
  assert.equal(pageSize(undefined), 50);
  assert.equal(pageSize('1000'), 250);
  assert.equal(pageSize('-3'), 50);
  assert.equal(pageSize('10'), 10);
});

test('an item goes out in sen and plain quantities', () => {
  const out = itemOut('9555', { name: 'Milo', priceSen: 1590, reorderLevelMilli: 5000, active: true });
  assert.equal(out.price_sen, 1590);
  assert.equal(out.reorder_level, 5);
  assert.equal(out.track_stock, true);
});

test('an item coming in only touches what was sent', () => {
  const { barcode, fields } = itemIn({ barcode: ' 9555 ', price_sen: 1690 });
  assert.equal(barcode, '9555');
  assert.deepEqual(fields, { priceSen: 1690 });
  assert.throws(() => itemIn({ barcode: 'a/b' }), /not usable/);
  assert.throws(() => itemIn({ barcode: '1', price_sen: 15.9 }), /whole number of sen/);
  assert.throws(() => itemIn({}), /required/);
});

test('stock_after becomes the difference, received a delivery', () => {
  assert.deepEqual(stockChange({ barcode: 'm', stock_after: 18 }, 20_000), { barcode: 'm', branchId: '', type: 'WRITE_OFF', quantityMilli: 2000 });
  assert.deepEqual(stockChange({ barcode: 'm', store_id: 'ipoh', stock_after: 1.5 }, 0), { barcode: 'm', branchId: 'ipoh', type: 'RECEIVE', quantityMilli: 1500 });
  assert.equal(stockChange({ barcode: 'm', stock_after: 20 }, 20_000), null);
  assert.equal(stockChange({ barcode: 'm', received: 12 }, 0).quantityMilli, 12_000);
  assert.throws(() => stockChange({ barcode: 'm' }, 0), /stock_after or received/);
});

test('a receipt includes rounding in its total', () => {
  const r = receiptOut('s1', { receiptNo: 'R1', status: 'COMPLETED', createdAt: 0, totalSen: 1002, roundingSen: -2, lines: [{ barcode: 'm', name: 'Milo', qtyMilli: 2000, unitPriceSen: 501, lineTotalSen: 1002 }], payments: [{ method: 'CASH', amountSen: 1000 }] });
  assert.equal(r.total_sen, 1000);
  assert.equal(r.line_items[0].quantity, 2);
});

test('item taxes: null follows the default, [] is tax-free', () => {
  assert.equal(itemOut('m', { name: 'Milo' }).tax_ids, null);
  assert.deepEqual(itemOut('r', { name: 'Rice', taxIds: [] }).tax_ids, []);
  assert.deepEqual(itemIn({ barcode: 'r', tax_ids: [] }).fields, { taxIds: [] });
  assert.deepEqual(itemIn({ barcode: 'r', tax_ids: null }).fields, { taxIds: null });
  assert.throws(() => itemIn({ barcode: 'r', tax_ids: 'sst' }), /tax_ids/);
  const r = receiptOut('s2', { totalSen: 1580, taxSen: 80, untaxedSen: 500, taxes: [{ id: 'sst8', name: 'SST', pct: 8, baseSen: 1000, taxSen: 80 }], lines: [], payments: [] });
  assert.deepEqual(r.taxes, [{ id: 'sst8', name: 'SST', rate: 8, taxable_sen: 1000, amount_sen: 80 }]);
  assert.equal(r.tax_free_sen, 500);
});

test('a new customer needs a name', () => {
  assert.throws(() => customerIn({ phone: '1' }), /name/);
  assert.equal(customerIn({ id: 'c1', points: 9999, phone: '1' }).fields.points, undefined);
});

test('rate limit keys: by token hash, else by address', () => {
  const req = (auth, ip) => ({ get: (h) => (h === 'authorization' ? auth : undefined), ip });
  const k = rateKey(req('Bearer sck_abcdefghijklmnopqrstuvwxyz', '1.2.3.4'));
  if (!k.startsWith('t:') || k.includes('sck_')) throw new Error(k);
  if (rateKey(req('', '::ffff:1.2.3.4')) !== 'ip:1.2.3.4') throw new Error('v4');
  if (rateKey(req('', '2001:db8:1:2:3:4:5:6')) !== 'ip6:2001:db8:1:2') throw new Error('v6 /64');
  const o = rateLimitOptions({ perMinute: 100, anonymousPerMinute: 5 });
  if (o.limit(req('', '1.1.1.1')) !== 5 || o.limit(req('Bearer sck_abcdefghijklmnopqrstuvwxyz', '1.1.1.1')) !== 100) throw new Error('limits');
});

test('offline transactions in API shape', () => {
  const op = offlineOpIn({ id: 'a/b 1', type: 'count', at: '2026-10-07T00:00:00Z', store_id: 'ipoh', barcode: ' 955 ', quantity: 1.25 });
  if (op.id !== 'a_b_1' || op.kind !== 'COUNT' || op.branchId !== 'ipoh' || op.barcode !== '955' || op.data.quantityMilli !== 1250) throw new Error(JSON.stringify(op));
  if (op.at !== Date.UTC(2026, 9, 7)) throw new Error('time');
  if (offlineOpIn({ type: 'nope' }).kind !== undefined) throw new Error('kind');
});

let failed = 0;
for (const [n, f] of tests) {
  try { f(); console.log(`PASS  ${n}`); } catch (e) { failed++; console.log(`FAIL  ${n}\n      ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
