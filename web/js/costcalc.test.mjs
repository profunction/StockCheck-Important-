// node web/js/costcalc.test.mjs -- exits non-zero on any failure.
import assert from 'node:assert/strict';
import { averageCost, landedCost, marginOf, priceFor } from './costcalc.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// 100 Milo at ¥10 and 50 kettles at ¥40, at RM 0.62 a yuan, with RM 120
// shipping and RM 60 duty.
const ORDER = {
  lines: [{ qtyMilli: 100_000, unitPrice: 10, weightG: 400 }, { qtyMilli: 50_000, unitPrice: '40', weightG: 1200 }],
  rate: 0.62, extras: [{ sen: 12000 }, { sen: 6000 }],
};

test('goods are converted to ringgit and the extras spread by value', () => {
  const r = landedCost(ORDER);
  assert.deepEqual(r.lines.map((l) => l.goodsSen), [62000, 124000]);
  assert.equal(r.goodsSen, 186000);
  assert.equal(r.extraSen, 18000);
  assert.equal(r.totalSen, 204000);
  assert.deepEqual(r.lines.map((l) => l.extraSen), [6000, 12000]);
  assert.deepEqual(r.lines.map((l) => l.unitSen), [680, 2720]);
  assert.equal(r.extraPct, 9.7);
  assert.equal(r.by, 'value');
});

test('by quantity and by weight', () => {
  assert.deepEqual(landedCost({ ...ORDER, by: 'qty' }).lines.map((l) => l.extraSen), [12000, 6000]);
  // 40 kg of Milo, 60 kg of kettles.
  assert.deepEqual(landedCost({ ...ORDER, by: 'weight' }).lines.map((l) => l.extraSen), [7200, 10800]);
});

test('by weight with no weights falls back to value', () => {
  const r = landedCost({ ...ORDER, lines: ORDER.lines.map((l) => ({ ...l, weightG: 0 })), by: 'weight' });
  assert.equal(r.by, 'value');
  assert.deepEqual(r.lines.map((l) => l.extraSen), [6000, 12000]);
});

test('the shares always add up to the extras, to the sen', () => {
  const r = landedCost({ lines: [{ qtyMilli: 3000, unitPrice: 1 }, { qtyMilli: 3000, unitPrice: 1 }, { qtyMilli: 3000, unitPrice: 1 }], extras: [{ sen: 100 }] });
  assert.equal(r.lines.reduce((n, l) => n + l.extraSen, 0), 100);
});

test('weighed goods and a suggested price', () => {
  // 2.5 kg at RM 8.00 a kg, RM 1 delivery, 30% margin.
  const r = landedCost({ lines: [{ qtyMilli: 2500, unitPrice: 8 }], extras: [{ sen: 100 }], marginPct: 30 });
  assert.equal(r.lines[0].unitSen, 840);
  assert.equal(r.lines[0].suggestSen, 1200);
});

test('prices, margins and the average cost', () => {
  assert.equal(priceFor(700, 30), 1000);
  assert.equal(priceFor(701, 30), 1010);
  assert.equal(priceFor(700, 0), null);
  assert.equal(priceFor(700, 100), null);
  assert.equal(marginOf(1000, 700), 30);
  assert.equal(marginOf(0, 700), null);
  // 20 on hand at RM 5, 60 arrive at RM 6: RM 5.75.
  assert.equal(averageCost(20_000, 500, 60_000, 600), 575);
  assert.equal(averageCost(0, 500, 60_000, 600), 600);
  assert.equal(averageCost(20_000, null, 60_000, 600), 600);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n', e.message); }
}
process.exit(failed ? 1 : 0);
