// node web/js/counting.test.mjs -- counting on the web, the app's way.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { counted, lineFor, period, refNo, spokenQty, tempRefNo } from './counting.js';

test('reference numbers look like the app\'s', () => {
  const d = new Date(2026, 8, 16, 9, 5);
  assert.equal(period(d), '2609');
  assert.equal(refNo(d, 7), 'RC-16/09/2026-007');
  assert.equal(refNo(d, 1234), 'RC-16/09/2026-1234');
  assert.equal(tempRefNo(d), 'RC-16/09/2026-W0905');
});

test('a scan finds the line of any code its product answers to', () => {
  const lines = [{ barcode: '111', quantityMilli: 2000 }, { barcode: 'abc', quantity: 3 }];
  const tin = { barcode: '111', altBarcodes: ['999'] };
  assert.equal(lineFor(lines, '999', tin), lines[0]);
  assert.equal(lineFor(lines, 'ABC', null), lines[1]);
  assert.equal(lineFor(lines, '555', null), null);
  assert.equal(counted(lines[0]), 2000);
  assert.equal(counted(lines[1]), 3000);
});

test('spoken quantities, digits and Chinese', () => {
  assert.equal(spokenQty('12'), 12000);
  assert.equal(spokenQty('1.5 kilo'), 1500);
  assert.equal(spokenQty('十二'), 12000);
  assert.equal(spokenQty('十'), 10000);
  assert.equal(spokenQty('二十五个'), 25000);
  assert.equal(spokenQty('三百零五'), 305000);
  assert.equal(spokenQty('两千'), 2000000);
  assert.equal(spokenQty('hello'), null);
});
