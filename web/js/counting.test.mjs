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

import { daysToExpiry, decodeInk, encodeInk, expectedOf, finding, formatExpiry, isSigned, largeVariance, parseExpiry, unlisted, variance } from './counting.js';

test('expected, variance and the lines worth a second look, as the app says', () => {
  const listed = (exp, got) => ({ onList: true, expectedMilli: exp * 1000, quantityMilli: got * 1000 });
  assert.equal(expectedOf({ expected: 3 }), 3000);
  assert.equal(variance(listed(10, 7)), -3000);
  assert.equal(variance({ quantityMilli: 4000 }), 0);
  assert.equal(unlisted({ quantityMilli: 4000 }), true);
  assert.equal(largeVariance(listed(10, 0)), true); // expected some, found none
  assert.equal(largeVariance(listed(0, 2)), true); // stock nobody knew of
  assert.equal(largeVariance(listed(3, 4)), false); // too small to mean anything
  assert.equal(largeVariance(listed(100, 90)), false);
  assert.equal(largeVariance(listed(100, 80)), true);
});

test('expiry dates: dd/mm/yyyy at midnight UTC, nothing invented', () => {
  const ms = parseExpiry('03/04/2027');
  assert.equal(ms, Date.UTC(2027, 3, 3));
  assert.equal(formatExpiry(ms), '03/04/2027');
  assert.equal(parseExpiry('3-4-27'), Date.UTC(2027, 3, 3));
  assert.equal(parseExpiry('31/02/2027'), null);
  assert.equal(parseExpiry('soon'), null);
  assert.equal(formatExpiry(null), '');
  assert.equal(daysToExpiry(Date.UTC(2027, 3, 3), Date.UTC(2027, 3, 1, 15)), 2);
  assert.equal(daysToExpiry(null), null);
});

test('what a line says: expiry first, then the sheet', () => {
  const now = Date.UTC(2027, 0, 10);
  assert.equal(finding({ expiresAt: Date.UTC(2027, 0, 9), onList: true, expectedMilli: 1000, quantityMilli: 1000 }, now).kind, 'expired');
  assert.equal(finding({ expiresAt: Date.UTC(2027, 1, 1), quantityMilli: 1000 }, now).kind, 'soon');
  assert.equal(finding({ quantityMilli: 1000 }, now).kind, 'unlisted');
  assert.deepEqual(finding({ onList: true, expectedMilli: 5000, quantityMilli: 3000 }, now), { kind: 'short', qty: 2000 });
  assert.deepEqual(finding({ onList: true, expectedMilli: 5000, quantityMilli: 5000 }, now), { kind: 'match' });
});

test('signatures are stored the way the app stores them', () => {
  const ink = encodeInk([[{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.5 }], [], [{ x: 1.4, y: -1 }, { x: 0.3, y: 0.3 }]]);
  assert.equal(ink, '100,200 500,500;1000,0 300,300');
  assert.deepEqual(decodeInk(ink)[1][0], { x: 1, y: 0 });
  assert.equal(isSigned(ink), true);
  assert.equal(isSigned('100,100'), false);
});
