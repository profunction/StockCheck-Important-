// node web/js/money.test.mjs -- exits non-zero on any failure.
import assert from 'node:assert/strict';
import {
  billTotals, ean13Check, formatQty, formatSen, inStoreBarcode, lineAmount, parseQty, parseSen,
  productTaxIds, receiptNo, rm, roundCash, settle, taxList,
} from './money.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('sen formats as ringgit', () => {
  assert.equal(formatSen(1590), '15.90');
  assert.equal(formatSen(5), '0.05');
  assert.equal(formatSen(-120), '-1.20');
  assert.equal(rm(100000), 'RM 1000.00');
});

test('typed amounts', () => {
  assert.equal(parseSen('15.9'), 1590);
  assert.equal(parseSen('RM 15.90'), 1590);
  assert.equal(parseSen('1,200.50'), 120050);
  assert.equal(parseSen('3'), 300);
  assert.equal(parseSen('.5'), 50);
  assert.equal(parseSen('1.234'), null);
  assert.equal(parseSen('abc'), null);
  assert.equal(parseSen(''), null);
});

test('typed quantities', () => {
  assert.equal(parseQty('2'), 2000);
  assert.equal(parseQty('1.25'), 1250);
  assert.equal(parseQty('0.5'), 500);
  assert.equal(parseQty('-1'), null);
  assert.equal(formatQty(1250), '1.25');
  assert.equal(formatQty(3000), '3');
});

test('a weighed line rounds to the sen once', () => {
  // 1.235 kg at RM 8.99/kg = 11.10265 -> 11.10
  assert.equal(lineAmount(1235, 899), 1110);
});

test('cash rounds to 5 sen the Malaysian way', () => {
  const cases = { 1001: 1000, 1002: 1000, 1003: 1005, 1004: 1005, 1006: 1005, 1007: 1005, 1008: 1010, 1009: 1010, 1005: 1005 };
  for (const [sen, rounded] of Object.entries(cases)) assert.equal(roundCash(Number(sen)), rounded, sen);
});

const lines = [
  { qtyMilli: 2000, unitPriceSen: 1590 }, // 31.80
  { qtyMilli: 1000, unitPriceSen: 250, discountSen: 50 }, // 2.00
];

test('plain bill', () => {
  const t = billTotals(lines);
  assert.equal(t.subtotalSen, 3380);
  assert.equal(t.totalSen, 3380);
  assert.equal(t.taxSen, 0);
});

test('tax inside the prices is shown, not added', () => {
  const t = billTotals([{ qtyMilli: 1000, unitPriceSen: 10600 }], { taxPct: 6, pricesIncludeTax: true });
  assert.equal(t.totalSen, 10600);
  assert.equal(t.taxSen, 600);
});

test('restaurant: discount, then 10% service charge, then 6% SST on top', () => {
  const t = billTotals([{ qtyMilli: 1000, unitPriceSen: 10000 }], {
    discountPct: 10, serviceChargePct: 10, taxPct: 6, pricesIncludeTax: false,
  });
  assert.equal(t.discountSen, 1000); // 100 - 10 = 90
  assert.equal(t.serviceChargeSen, 900); // 9.00
  assert.equal(t.taxSen, 594); // 6% of 99.00
  assert.equal(t.totalSen, 10494);
});

const SST8 = { id: 'sst8', name: 'SST', pct: 8, byDefault: true };
const SALES10 = { id: 'st10', name: 'Sales tax', pct: 10, byDefault: false };

test('a tax-free item is not taxed on a mixed bill (tax added on top)', () => {
  const t = billTotals([
    { qtyMilli: 1000, unitPriceSen: 1000, taxIds: ['sst8'] }, // soft drink
    { qtyMilli: 1000, unitPriceSen: 500, taxIds: [] }, // rice, exempt
  ], { taxes: [SST8], pricesIncludeTax: false });
  assert.equal(t.taxSen, 80);
  assert.equal(t.totalSen, 1580);
  assert.equal(t.untaxedSen, 500);
  assert.deepEqual(t.taxes, [{ id: 'sst8', name: 'SST', pct: 8, baseSen: 1000, taxSen: 80 }]);
});

test('a tax-free item on a mixed bill, prices already include tax', () => {
  const t = billTotals([
    { qtyMilli: 1000, unitPriceSen: 1080, taxIds: ['sst8'] },
    { qtyMilli: 2000, unitPriceSen: 500, taxIds: [] },
  ], { taxes: [SST8], pricesIncludeTax: true });
  assert.equal(t.totalSen, 2080);
  assert.equal(t.taxSen, 80);
  assert.equal(t.taxes[0].baseSen, 1000);
  assert.equal(t.untaxedSen, 1000);
});

test('two rates on one bill are kept apart', () => {
  const t = billTotals([
    { qtyMilli: 1000, unitPriceSen: 1000, taxIds: ['sst8'] },
    { qtyMilli: 1000, unitPriceSen: 2000, taxIds: ['st10'] },
  ], { taxes: [SST8, SALES10], pricesIncludeTax: false });
  assert.deepEqual(t.taxes.map((x) => [x.id, x.baseSen, x.taxSen]), [['sst8', 1000, 80], ['st10', 2000, 200]]);
  assert.equal(t.totalSen, 3280);
});

test('a bill discount lowers the tax only on the taxed share', () => {
  const t = billTotals([
    { qtyMilli: 1000, unitPriceSen: 1000, taxIds: ['sst8'] },
    { qtyMilli: 1000, unitPriceSen: 1000, taxIds: [] },
  ], { taxes: [SST8], discountPct: 10, pricesIncludeTax: false });
  assert.equal(t.discountSen, 200);
  assert.equal(t.taxSen, 72); // 8% of 9.00
  assert.equal(t.untaxedSen, 900);
  assert.equal(t.totalSen, 1872);
});

test('a bill with only tax-free items has no tax', () => {
  const t = billTotals([{ qtyMilli: 1000, unitPriceSen: 300, taxIds: [] }], { taxes: [SST8], pricesIncludeTax: false });
  assert.equal(t.taxSen, 0);
  assert.deepEqual(t.taxes, []);
  assert.equal(t.totalSen, 300);
});

test('old single-tax settings read as one default tax', () => {
  assert.deepEqual(taxList({ taxName: 'SST', taxPct: 6 }), [{ id: 'tax', name: 'SST', pct: 6, byDefault: true }]);
  assert.deepEqual(taxList({ taxPct: 0 }), []);
  assert.deepEqual(taxList({ taxes: [SST8, { id: 'zero', name: 'x', pct: 0 }] }).map((x) => x.id), ['sst8']);
});

test('an item nobody set gets the default taxes; an item set to none gets none', () => {
  const taxes = [SST8, SALES10];
  assert.deepEqual(productTaxIds({ name: 'Milo' }, taxes), ['sst8']);
  assert.deepEqual(productTaxIds({ taxIds: null }, taxes), ['sst8']);
  assert.deepEqual(productTaxIds({ taxIds: [] }, taxes), []);
  assert.deepEqual(productTaxIds({ taxIds: ['st10', 'gone'] }, taxes), ['st10']);
  assert.deepEqual(productTaxIds(undefined, taxes), ['sst8']);
});

test('a discount never makes a bill negative', () => {
  assert.equal(billTotals(lines, { discountSen: 999999 }).totalSen, 0);
});

test('cash payment: rounding and change', () => {
  const s = settle(1002, [{ method: 'CASH', amountSen: 2000 }]);
  assert.equal(s.roundingSen, -2);
  assert.equal(s.payableSen, 1000);
  assert.equal(s.changeSen, 1000);
  assert.equal(s.dueSen, 0);
});

test('card payment is charged to the sen', () => {
  const s = settle(1002, [{ method: 'CARD', amountSen: 1002 }]);
  assert.equal(s.roundingSen, 0);
  assert.equal(s.dueSen, 0);
  assert.equal(s.changeSen, 0);
});

test('split: QR first, rest in cash, rounded on the cash part only', () => {
  const s = settle(5003, [{ method: 'QR', amountSen: 3000 }, { method: 'CASH', amountSen: 2000 }]);
  // Cash due 20.03 -> 20.05
  assert.equal(s.roundingSen, 2);
  assert.equal(s.dueSen, 5);
});

test('receipt numbers read as date, time, tag', () => {
  const no = receiptNo(new Date(2026, 9, 7, 14, 32, 5), () => 0);
  assert.equal(no, '261007-143205-AA');
});

test('in-store barcodes are valid EAN-13 in the 2x range', () => {
  assert.equal(ean13Check('400638133393'), '1'); // a known EAN-13
  for (let i = 0; i < 50; i++) {
    const code = inStoreBarcode();
    assert.match(code, /^2\d{12}$/);
    assert.equal(code[12], ean13Check(code.slice(0, 12)));
  }
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
