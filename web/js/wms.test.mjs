// node web/js/wms.test.mjs -- exits non-zero on any failure.
import assert from 'node:assert/strict';
import {
  closingRows, daysLeft, expiring, expiryEnd, firstExpiry, fromPacks, lotsLeft, monthBefore, monthEnd, monthOf, overPromised, packOf, reservedAt, toPacks,
} from './wms.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('a carton needs at least two pieces; its name defaults to ctn', () => {
  assert.equal(packOf({}), null);
  assert.equal(packOf({ packSize: 1 }), null);
  assert.deepEqual(packOf({ packSize: 24 }), { size: 24, name: 'ctn' });
  assert.deepEqual(packOf({ packSize: '12', packName: ' box ' }), { size: 12, name: 'box' });
});

test('cartons and pieces turn into pieces and back', () => {
  assert.equal(fromPacks(3, 5, 24), 77_000);
  assert.equal(fromPacks('2', '', 12), 24_000);
  assert.equal(fromPacks(0, 1.5, 12), 1_500);
  assert.deepEqual(toPacks(77_000, 24), { packs: 3, pieces: 5 });
  assert.deepEqual(toPacks(24_000, 24), { packs: 1, pieces: 0 });
  assert.deepEqual(toPacks(-5_000, 24), { packs: 0, pieces: 0 });
});

// 2026-10-08 10:00 in Malaysia.
const NOW = Date.UTC(2026, 9, 8, 2, 0);

test('days left count Malaysian days; the date itself is still good', () => {
  assert.equal(daysLeft('2026-10-08', NOW), 0);
  assert.equal(daysLeft('2026-10-09', NOW), 1);
  assert.equal(daysLeft('2026-10-01', NOW), -7);
  assert.equal(daysLeft('', NOW), null);
  assert.equal(daysLeft('8/10/2026', NOW), null);
  // 23:59 in Malaysia on the 8th is still the 8th.
  assert.equal(expiryEnd('2026-10-08'), Date.UTC(2026, 9, 8, 16, 0) - 1);
});

const moves = [
  { barcode: 'm', type: 'RECEIVE', quantityMilli: 50_000, at: 100, expiry: '2026-11-01', reference: 'GRN-1' },
  { barcode: 'm', type: 'SALE', quantityMilli: 30_000, at: 150 },
  { barcode: 'm', type: 'RECEIVE', quantityMilli: 20_000, at: 200, expiry: '2027-01-01', reference: 'GRN-2' },
  { barcode: 'm', type: 'TRANSFER_OUT', quantityMilli: 5_000, at: 250 },
];

test('what is left is the newest goods in; older stock has no date', () => {
  assert.deepEqual(lotsLeft(moves, 35_000).map((l) => [l.expiry, l.qtyMilli]), [['2027-01-01', 20_000], ['2026-11-01', 15_000]]);
  assert.deepEqual(lotsLeft(moves, 10_000).map((l) => [l.expiry, l.qtyMilli]), [['2027-01-01', 10_000]]);
  assert.deepEqual(lotsLeft(moves, 90_000).map((l) => [l.expiry, l.qtyMilli]), [['2027-01-01', 20_000], ['2026-11-01', 50_000], ['', 20_000]]);
  assert.deepEqual(lotsLeft(moves, 0), []);
  assert.equal(firstExpiry(lotsLeft(moves, 35_000)), '2026-11-01');
});

test('expiring lists only lots still there and due within the days given', () => {
  const levels = [{ key: 'm', name: 'Milk', onHand: 35_000 }, { key: 'x', name: 'Gone', onHand: 0 }];
  const soon = expiring(levels, moves, { now: NOW, days: 30 });
  assert.deepEqual(soon.map((l) => [l.name, l.expiry, l.qtyMilli, l.daysLeft]), [['Milk', '2026-11-01', 15_000, 24]]);
  assert.equal(expiring(levels, moves, { now: NOW, days: 10 }).length, 0);
  // Sold down to the newest delivery: the old date is gone from the shelf.
  assert.equal(expiring([{ key: 'm', name: 'Milk', onHand: 20_000 }], moves, { now: NOW, days: 30 }).length, 0);
});

test('only open reservations hold stock, at their own place', () => {
  const rs = [
    { status: 'OPEN', branchId: 'b1', lines: [{ barcode: 'm', qtyMilli: 4_000 }] },
    { status: 'OPEN', branchId: '', lines: [{ barcode: 'm', qtyMilli: 1_000 }, { barcode: 'n', qtyMilli: 2_000 }] },
    { status: 'DELIVERED', branchId: 'b1', lines: [{ barcode: 'm', qtyMilli: 9_000 }] },
  ];
  assert.deepEqual([...reservedAt(rs, 'b1')], [['m', 4_000]]);
  assert.deepEqual([...reservedAt(rs, 'ALL')], [['m', 5_000], ['n', 2_000]]);
  const over = overPromised([{ barcode: 'm', qtyMilli: 6_000 }, { barcode: 'n', qtyMilli: 1_000 }], new Map([['m', 5_000], ['n', 1_000]]));
  assert.deepEqual(over.map((l) => [l.barcode, l.availableMilli]), [['m', 5_000]]);
});

test('months are Malaysian and end at 23:59:59.999 there', () => {
  assert.equal(monthOf(Date.UTC(2026, 8, 30, 16, 30)), '2026-10'); // 00:30 on 1 Oct in KL
  assert.equal(monthBefore('2026-10'), '2026-09');
  assert.equal(monthBefore('2026-01'), '2025-12');
  assert.equal(monthEnd('2026-09'), Date.UTC(2026, 8, 30, 16, 0) - 1);
  assert.equal(monthOf(monthEnd('2026-09')), '2026-09');
});

test('closing rows keep what is held, at cost, and add it up', () => {
  const rows = [{ key: 'm', name: 'Milk', unit: 'pcs', onHand: 3_000 }, { key: 'z', name: 'Zero', onHand: 0 }, { key: 'n', name: 'Neg', onHand: -2_000 }];
  const c = closingRows(rows, (k) => ({ m: 250, n: 100 }[k]));
  assert.deepEqual(c.lines.map((l) => [l.barcode, l.onHandMilli, l.valueSen]), [['m', 3_000, 750], ['n', -2_000, 0]]);
  assert.equal(c.valueSen, 750);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n', e.message); }
}
process.exit(failed ? 1 : 0);
