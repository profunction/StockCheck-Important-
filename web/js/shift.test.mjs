// node web/js/shift.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cashMove, closeFigures, newShift, summarizeShift } from './shift.js';

const shift = { ...newShift({ operatorId: 'u1', operatorName: 'Siti', initialFloatSen: 20000, now: 1000 }), cashMoves: [cashMove('OUT', 1500, 'ice', 1100), cashMove('IN', 500, 'coins', 1200)] };
const sales = [
  { status: 'COMPLETED', totalSen: 1060, roundingSen: 0, discountSen: 0, payments: [{ method: 'CASH', amountSen: 2000 }], changeSen: 940, lines: [] },
  { status: 'COMPLETED', totalSen: 4870, roundingSen: 0, discountSen: 500, payments: [{ method: 'QR', amountSen: 4870 }], changeSen: 0, lines: [{ discountSen: 100 }] },
  { status: 'COMPLETED', totalSen: 1003, roundingSen: 2, payments: [{ method: 'CARD', amountSen: 500 }, { method: 'CASH', amountSen: 600 }], changeSen: 95, lines: [] },
  { status: 'VOIDED', totalSen: 2500, roundingSen: 0, payments: [{ method: 'CASH', amountSen: 2500 }], changeSen: 0, lines: [] },
  { status: 'COMPLETED', totalSen: 990, payments: [{ method: 'EWALLET', amountSen: 990 }], lines: [] },
];

test('opening a shift: whole sen, someone named', () => {
  assert.equal(shift.status, 'OPEN');
  assert.equal(shift.floatSen, 20000);
  assert.throws(() => newShift({ operatorId: 'u1', initialFloatSen: 12.5 }), /whole sen/);
  assert.throws(() => newShift({ initialFloatSen: 0 }), /operatorId/);
});

test('the summary: each way of paying, voids, discounts, cash net of change', () => {
  const s = summarizeShift(shift, sales);
  assert.equal(s.salesCount, 4);
  assert.equal(s.voidCount, 1);
  assert.equal(s.voidsSen, 2500);
  assert.equal(s.byMethod.CASH, 2000 - 940 + 600 - 95);
  assert.equal(s.byMethod.QR, 4870);
  assert.equal(s.byMethod.CARD, 500);
  assert.equal(s.byMethod.EWALLET, 990);
  assert.equal(s.discountsSen, 600);
  assert.equal(s.grossSen, 1060 + 4870 + 1005 + 990);
  // Cash by method + everything else = what was taken.
  assert.equal(s.byMethod.CASH + s.byMethod.QR + s.byMethod.CARD + s.byMethod.EWALLET, s.grossSen);
  assert.equal(s.expectedCashSen, 20000 + 1565 + 500 - 1500);
});

test('closing: short is negative, over positive, a closed shift stays closed', () => {
  const exp = summarizeShift(shift, sales).expectedCashSen;
  const short = closeFigures(shift, sales, exp - 300, { now: 5000 });
  assert.equal(short.shortOverSen, -300);
  assert.equal(short.status, 'CLOSED');
  assert.equal(closeFigures(shift, sales, exp + 50).shortOverSen, 50);
  assert.throws(() => closeFigures({ ...shift, status: 'CLOSED' }, sales, 0), /already closed/);
  assert.throws(() => closeFigures(shift, sales, 10.5), /whole sen/);
});

test('cash in and out: whole sen above zero', () => {
  assert.throws(() => cashMove('OUT', 0), /more than 0/);
  assert.throws(() => cashMove('X', 10), /IN or OUT/);
});
