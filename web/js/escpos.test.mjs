// node web/js/escpos.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ascii, buildPrintJob, columnsFor, generateCashDrawerBuffer, rasterImage, receiptLines, shiftLines, twoCols, wrap } from './escpos.js';

const sale = {
  receiptNo: '261007-101500-AB', createdAt: Date.UTC(2026, 9, 7, 2, 15), cashierName: 'Siti',
  lines: [
    { name: 'Milo 1kg', qtyMilli: 2000, unitPriceSen: 1590, lineTotalSen: 3180, taxIds: ['sst'] },
    { name: 'Beras 5kg', qtyMilli: 1000, unitPriceSen: 1690, lineTotalSen: 1690, taxIds: [] },
  ],
  subtotalSen: 4870, taxes: [{ name: 'SST', pct: 6, taxSen: 180 }], taxIncluded: true, totalSen: 4870, roundingSen: 0,
  payments: [{ method: 'CASH', amountSen: 5000 }], changeSen: 130,
};

test('the drawer pulse is exactly ESC p 0 25 250', () => {
  assert.deepEqual([...generateCashDrawerBuffer()], [0x1b, 0x70, 0x00, 0x19, 0xfa]);
});

test('58 mm is 32 columns, 80 mm is 48', () => {
  assert.equal(columnsFor(58), 32);
  assert.equal(columnsFor(80), 48);
});

test('a print job starts with init, then the drawer pulse, and ends with a cut', () => {
  const job = [...buildPrintJob(sale, { openDrawer: true })];
  assert.deepEqual(job.slice(0, 2), [0x1b, 0x40]);
  assert.deepEqual(job.slice(2, 7), [0x1b, 0x70, 0x00, 0x19, 0xfa]);
  assert.deepEqual(job.slice(-4), [0x1d, 0x56, 0x42, 0x00]);
  const noDrawer = [...buildPrintJob(sale, { openDrawer: false })];
  assert.notDeepEqual(noDrawer.slice(2, 7), [0x1b, 0x70, 0x00, 0x19, 0xfa]);
});

test('every text line fits the paper', () => {
  for (const width of [32, 48]) {
    for (const l of receiptLines(sale, { width, settings: { shopName: 'Kedai Maju', address: 'No 1, Jalan Besar, 30000 Ipoh, Perak', footer: 'Terima kasih' } })) {
      assert.ok(l.text.length <= (l.big ? width / 2 : width), `${width}: "${l.text}"`);
    }
  }
});

test('tax-free lines are starred when the shop charges tax', () => {
  const text = receiptLines(sale, { width: 48 }).map((l) => l.text).join('\n');
  assert.match(text, /Beras 5kg \*/);
  assert.match(text, /\* tax-free item/);
  assert.doesNotMatch(text, /Milo 1kg \*/);
  assert.match(text, /Change\s+1\.30/);
});

test('helpers: two columns, wrapping, ASCII', () => {
  assert.equal(twoCols('Total', '12.00', 20), 'Total          12.00');
  assert.deepEqual(wrap('one two three four', 9), ['one two', 'three', 'four']);
  assert.equal(ascii('Café 面包'), 'Cafe ??');
});

test('a shift slip shows expected, counted and short', () => {
  const text = shiftLines({ operatorName: 'Siti', openedAt: 1, closedAt: 2, actualCashSen: 9500, shortOverSen: -500,
    summary: { salesCount: 3, grossSen: 15000, byMethod: { CASH: 5000, QR: 10000 }, floatSen: 5000, cashSalesSen: 5000, expectedCashSen: 10000 } }, { width: 32 })
    .map((l) => l.text).join('\n');
  assert.match(text, /Expected cash\s+100\.00/);
  assert.match(text, /Counted cash\s+95\.00/);
  assert.match(text, /SHORT\s+-5\.00/);
  const job = buildPrintJob({ operatorName: 'Siti', summary: {} }, { kind: 'shift', paperWidth: 58 });
  assert.ok(job.length > 50);
});

test('raster: GS v 0 header and one bit per pixel', () => {
  const bits = new Array(16 * 2).fill(0);
  bits[0] = 1; bits[15] = 1; bits[16 + 8] = 1;
  const r = rasterImage(bits, 16);
  assert.deepEqual(r.slice(0, 8), [0x1d, 0x76, 0x30, 0x00, 2, 0, 2, 0]);
  assert.deepEqual(r.slice(8), [0x80, 0x01, 0x00, 0x80]);
});
