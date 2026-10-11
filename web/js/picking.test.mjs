// node web/js/picking.test.mjs -- walking the shelves once for several orders.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyScan, compareBins, nextIndex, ordersToPick, pickLines, progress, zoneOf } from './picking.js';

test('shelves sort the way a person walks them', () => {
  const bins = ['B1-L1-02', 'A1-L1-10', '', 'A1-L1-2', 'a1-l2-01', 'A10-L1-01', 'A2-L1-01'];
  assert.deepEqual([...bins].sort(compareBins), ['A1-L1-2', 'A1-L1-10', 'a1-l2-01', 'A2-L1-01', 'A10-L1-01', 'B1-L1-02', '']);
  assert.equal(compareBins('A-03-2', 'A-03-2'), 0);
  assert.equal(compareBins('A-03', 'A-03-1') < 0, true);
});

test('the aisle is the letters a shelf code starts with', () => {
  assert.equal(zoneOf('K3-L1-08'), 'K');
  assert.equal(zoneOf('ab-1'), 'AB');
  assert.equal(zoneOf('12-3'), '');
  assert.equal(zoneOf(''), '');
});

test('several orders become one walk: a line per product, in shelf order', () => {
  const bins = { milo: 'B1-L1-04', rice: 'A1-L2-01', salt: '' };
  const lines = pickLines([
    { ref: 'TR-1', lines: [{ barcode: 'milo', name: 'Milo', qtyMilli: 3000 }, { barcode: 'rice', name: 'Rice', qtyMilli: 1000 }] },
    { ref: 'RSV-2', lines: [{ barcode: 'milo', name: 'Milo', qtyMilli: 2000 }, { barcode: 'salt', name: 'Salt', qtyMilli: 500 }, { barcode: 'zero', qtyMilli: 0 }] },
  ], (code) => bins[code]);
  assert.deepEqual(lines.map((l) => [l.barcode, l.bin, l.qtyMilli, l.refs.join()]),
    [['rice', 'A1-L2-01', 1000, 'TR-1'], ['milo', 'B1-L1-04', 5000, 'TR-1,RSV-2'], ['salt', '', 500, 'RSV-2']]);
  assert.ok(lines.every((l) => l.pickedMilli === 0 && !l.short));
});

test('scanning fills the right line, refuses the wrong product and too many', () => {
  const lines = pickLines([{ ref: 'TR-1', lines: [{ barcode: 'a', qtyMilli: 2000 }, { barcode: 'b', qtyMilli: 1000 }] }]);
  assert.equal(nextIndex(lines), 0);
  assert.deepEqual(applyScan(lines, 'a'), { kind: 'ok', index: 0 });
  assert.deepEqual(applyScan(lines, 'x'), { kind: 'wrong', index: -1 });
  assert.deepEqual(applyScan(lines, 'a'), { kind: 'full', index: 0 });
  assert.deepEqual(applyScan(lines, 'a'), { kind: 'over', index: 0 });
  assert.equal(lines[0].pickedMilli, 2000);
  assert.equal(nextIndex(lines), 1);
  assert.deepEqual(progress(lines), { done: 1, total: 2, units: 3000, picked: 2000, short: 0, complete: false });
  lines[1].short = true;
  assert.equal(nextIndex(lines), -1);
  assert.deepEqual(progress(lines), { done: 2, total: 2, units: 3000, picked: 2000, short: 1, complete: true });
  assert.equal(progress([]).complete, false);
});

test('orders waiting to be picked: unsent transfers and held reservations here, not already on a picklist', () => {
  const transfers = [
    { id: 't1', transferNo: 'TR-1', fromBranch: 'gudang', toBranch: 'ipoh', status: 'APPROVED', createdAt: 30, lines: [{ barcode: 'a', qtyMilli: 1000 }] },
    { id: 't2', transferNo: 'TR-2', fromBranch: 'gudang', toBranch: '', status: 'SENT', createdAt: 10, lines: [{ barcode: 'a', qtyMilli: 1000 }] },
    { id: 't3', transferNo: 'TR-3', fromBranch: 'ipoh', toBranch: 'gudang', status: 'DRAFT', createdAt: 10, lines: [{ barcode: 'a', qtyMilli: 1000 }] },
    { id: 't4', transferNo: 'TR-4', fromBranch: 'gudang', toBranch: 'ipoh', status: 'DRAFT', createdAt: 20, lines: [{ barcode: 'b', qtyMilli: 1000 }] },
    { id: 't5', transferNo: 'TR-5', fromBranch: 'gudang', toBranch: 'ipoh', status: 'DRAFT', createdAt: 5, lines: [] },
  ];
  const reservations = [
    { id: 'r1', reservationNo: 'RSV-1', branchId: 'gudang', forWhom: 'Ah Lim', status: 'OPEN', createdAt: 25, lines: [{ barcode: 'a', qtyMilli: 2000 }] },
    { id: 'r2', reservationNo: 'RSV-2', branchId: 'gudang', status: 'DELIVERED', createdAt: 1, lines: [{ barcode: 'a', qtyMilli: 2000 }] },
  ];
  const picklists = [
    { status: 'DONE', orders: [{ kind: 'TRANSFER', id: 't4' }] },
    { status: 'CANCELLED', orders: [{ kind: 'RESERVATION', id: 'r1' }] },
  ];
  assert.deepEqual(ordersToPick({ transfers, reservations, picklists }, 'gudang').map((o) => [o.ref, o.kind, o.to]),
    [['RSV-1', 'RESERVATION', 'Ah Lim'], ['TR-1', 'TRANSFER', 'ipoh']]);
  assert.deepEqual(ordersToPick({ transfers }, 'ipoh').map((o) => o.ref), ['TR-3']);
});
