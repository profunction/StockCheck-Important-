// node api/lib.test.mjs
import assert from 'node:assert/strict';
import { bearer, customerIn, itemIn, itemOut, pageSize, receiptOut, sha256, stockChange } from './lib.mjs';

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

let failed = 0;
for (const [n, f] of tests) {
  try { f(); console.log(`PASS  ${n}`); } catch (e) { failed++; console.log(`FAIL  ${n}\n      ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
