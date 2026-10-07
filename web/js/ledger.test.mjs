// node web/js/ledger.test.mjs -- the same cases StockLedgerTest.kt checks in the app.
import assert from 'node:assert/strict';
import { levels, merge, isLow } from './ledger.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let id = 0;
const count = (at, zone = '', branchId = '', status = 'COMPLETED') => ({ id: `c${id++}`, createdAt: at, completedAt: at, zone, branchId, status });
const line = (barcode, units, productName = '') => ({ barcode, productName, quantityMilli: units * 1000 });
const move = (barcode, type, units, at) => ({ barcode, type, quantityMilli: units * 1000, at });
const ledger = (counts, movements = [], catalogue = new Map()) => {
  const items = new Map(counts.map(([c, l]) => [c, l]));
  return new Map(levels(counts.map(([c]) => c), (c) => items.get(c), movements, catalogue).map((l) => [l.key, l]));
};

test('on hand is the count plus what came in minus what went out since', () => {
  const l = ledger([[count(10), [line('rice', 100)]]], [
    move('rice', 'RECEIVE', 20, 11), move('rice', 'SALE', 30, 12), move('rice', 'SALE', 99, 5),
  ]).get('rice');
  assert.equal(l.onHand, 90_000);
  assert.equal(l.inSince, 20_000);
  assert.equal(l.outSince, 30_000);
});

test('areas add up; the latest count of an area wins', () => {
  const l = ledger([
    [count(1, 'shelf'), [line('rice', 5)]],
    [count(2, 'store'), [line('rice', 7)]],
    [count(3, 'shelf'), [line('rice', 6)]],
  ]).get('rice');
  assert.equal(l.counted, 13_000);
});

test('unfinished counts say nothing', () => {
  const l = ledger([[count(1, '', '', 'IN_PROGRESS'), [line('rice', 5)]]], [move('rice', 'RECEIVE', 2, 2)]).get('rice');
  assert.equal(l.counted, null);
  assert.equal(l.onHand, 2_000);
});

test('transfers move stock out of one branch and into another', () => {
  const out = ledger([[count(1, '', 'kl'), [line('milo', 10)]]], [move('milo', 'TRANSFER_OUT', 4, 2)]).get('milo');
  assert.equal(out.onHand, 6_000);
  const inn = ledger([], [move('milo', 'TRANSFER_IN', 4, 2)]).get('milo');
  assert.equal(inn.onHand, 4_000);
  assert.equal(merge([[out], [inn]])[0].onHand, 10_000);
});

test('reorder level from the product list', () => {
  const l = ledger([[count(1), [line('rice', 3)]]], [], new Map([['rice', { barcode: 'rice', name: 'Rice', reorderLevelMilli: 5000 }]])).get('rice');
  assert.equal(l.name, 'Rice');
  assert.ok(isLow(l));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS  ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
