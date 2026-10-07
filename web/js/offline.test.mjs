// node web/js/offline.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeOfflineTransactions } from './offline.js';

const NOW = 1_000_000;

test('sales and movements are added once, in time order', () => {
  const r = mergeOfflineTransactions([
    { id: 's2', kind: 'SALE', at: 900, data: {} },
    { id: 's1', kind: 'SALE', at: 800, data: {} },
    { id: 's1', kind: 'SALE', at: 800, data: {} },
    { id: 'old', kind: 'SALE', at: 700, data: {} },
    { id: 'm1', kind: 'MOVEMENT', at: 850, data: { quantityMilli: 2000 } },
  ], { saleIds: ['old'], now: NOW });
  assert.deepEqual(r.accepted.map((o) => o.id), ['s1', 'm1', 's2']);
  assert.deepEqual(r.skipped.map((x) => [x.id, x.reason]), [['old', 'ALREADY_SYNCED'], ['s1', 'DUPLICATE']]);
});

test('an offline price change older than the online one loses', () => {
  const r = mergeOfflineTransactions([
    { id: 'p1', kind: 'PRODUCT_UPDATE', barcode: '955', at: 500, data: { priceSen: 1200 } },
  ], { products: { 955: { priceSen: 1500, updatedAt: 600 } }, now: NOW });
  assert.equal(r.accepted.length, 0);
  assert.equal(r.skipped[0].reason, 'ONLINE_NEWER');
  assert.equal(r.conflicts[0].field, 'priceSen');
  assert.equal(r.state.products[955].priceSen, 1500);
});

test('a newer offline change wins, and two offline changes end as the second', () => {
  const r = mergeOfflineTransactions([
    { id: 'p2', kind: 'PRODUCT_UPDATE', barcode: '955', at: 800, data: { priceSen: 1400 } },
    { id: 'p1', kind: 'PRODUCT_UPDATE', barcode: '955', at: 700, data: { priceSen: 1300, name: 'Milo' } },
  ], { products: { 955: { priceSen: 1500, updatedAt: 600 } }, now: NOW });
  assert.deepEqual(r.accepted.map((o) => o.id), ['p1', 'p2']);
  assert.equal(r.state.products[955].priceSen, 1400);
  assert.equal(r.state.products[955].name, 'Milo');
  assert.equal(r.state.products[955].updatedAt, 800);
});

test('stock is never set outright by an offline update', () => {
  const r = mergeOfflineTransactions([
    { id: 'p1', kind: 'PRODUCT_UPDATE', barcode: '955', at: 900, data: { stockMilli: 0, priceSen: 1 } },
  ], { products: { 955: { updatedAt: 100 } }, now: NOW });
  assert.deepEqual(r.accepted[0].data, { priceSen: 1, updatedAt: 900 });
  assert.equal(r.conflicts[0].reason, 'ABSOLUTE_STOCK');
});

test('an offline count older than the last online count is kept out', () => {
  const r = mergeOfflineTransactions([
    { id: 'c1', kind: 'COUNT', barcode: '955', branchId: 'ipoh', at: 500, data: { quantityMilli: 3000 } },
    { id: 'c2', kind: 'COUNT', barcode: '955', branchId: 'kl', at: 500, data: { quantityMilli: 3000 } },
  ], { counts: { '955|ipoh': 600 }, now: NOW });
  assert.deepEqual(r.accepted.map((o) => o.id), ['c2']);
  assert.equal(r.skipped[0].reason, 'OLDER_THAN_ONLINE_COUNT');
});

test('bad input: no time, a clock far ahead, unknown kind, bad quantity', () => {
  const r = mergeOfflineTransactions([
    { id: 'a', kind: 'SALE', data: {} },
    { id: 'b', kind: 'SALE', at: NOW + 3_600_000, data: {} },
    { id: 'c', kind: 'REFUND?', at: 5 },
    { id: 'd', kind: 'MOVEMENT', at: 5, data: { quantityMilli: 1.5 } },
    null,
  ], { now: NOW });
  assert.deepEqual(r.skipped.map((x) => x.reason).sort(), ['BAD_QUANTITY', 'CLOCK_AHEAD', 'INVALID', 'INVALID', 'NO_TIMESTAMP']);
});
