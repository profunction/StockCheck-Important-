// node web/js/barcode.test.mjs -- barcodes and price labels.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { C128, barcodeModules, code128Modules, code128Values, ean13Modules, isEan13 } from './barcode.js';
import { LABEL_SIZES, labelContent, labelLayout, labelPageHtml } from './labels.js';

test('every Code 128 pattern is 11 modules (the stop 13)', () => {
  assert.equal(C128.length, 107);
  C128.forEach((p, i) => assert.equal([...p].reduce((s, d) => s + Number(d), 0), i === 106 ? 13 : 11, `value ${i}`));
  assert.equal(new Set(C128).size, 107);
});

test('EAN-13: 95 modules, guards in place, known code', () => {
  const m = ean13Modules('4006381333931');
  assert.equal(m.length, 95);
  assert.ok(m.startsWith('101') && m.endsWith('101') && m.slice(45, 50) === '01010');
  // First digit 4 -> parity LGLLGG; digit 0 in L is 0001101.
  assert.equal(m.slice(3, 10), '0001101');
  assert.throws(() => ean13Modules('4006381333932'), /valid EAN-13/);
  assert.ok(isEan13('2909000000011'));
});

test('Code 128: set C for even digits, B otherwise, check digit', () => {
  assert.deepEqual(code128Values('1234'), [105, 12, 34]);
  assert.deepEqual(code128Values('AB'), [104, 33, 34]);
  // Start B 104 + 33*1 + 34*2 = 205 -> 205 % 103 = 102.
  const m = code128Modules('AB');
  assert.equal(m.length, 11 * 4 + 13);
  assert.ok(m.endsWith('1100011101011'));
  assert.equal(barcodeModules('SKU-9').type, 'CODE128');
  assert.equal(barcodeModules('2909000000011').type, 'EAN13');
});

test('label: name, RM price, barcode, SST mark', () => {
  const settings = { taxes: [{ id: 'sst', name: 'SST', pct: 6, byDefault: true }], pricesIncludeTax: true };
  assert.deepEqual(labelContent({ name: 'Beras', priceSen: 1690, barcode: '1', taxIds: [] }, settings),
    { name: 'Beras', price: 'RM 16.90', barcode: '1', sstFlag: '* TANPA SST', exempt: true });
  assert.equal(labelContent({ name: 'Milo', priceSen: 1590, barcode: '2' }, settings).sstFlag, 'TERMASUK SST');
  assert.equal(labelContent({ name: 'Milo', priceSen: 1590, barcode: '2' }, {}).sstFlag, '');
});

test('label sizes in dots at 203 dpi; everything inside the label', () => {
  for (const size of Object.values(LABEL_SIZES)) {
    const L = labelLayout(size);
    assert.equal(L.w, size.widthMm * 8);
    assert.ok(L.barTop + L.barHeight + L.digitSize + L.pad <= L.h);
    assert.ok(L.priceY + L.priceSize <= L.barTop);
  }
  const html = labelPageHtml(['data:a', 'data:b'], LABEL_SIZES['30x20']);
  assert.match(html, /@page\{size:30mm 20mm/);
  assert.equal(html.match(/<img /g).length, 2);
});
