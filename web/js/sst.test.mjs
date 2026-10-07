// node web/js/sst.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { billTotals, allocate, taxEngine } from './money.js';
import { buildConsolidatedEInvoice, calculateSSTBreakdown, GENERAL_PUBLIC_TIN, taxTypeOf } from './sst.js';

const SST6 = { id: 'sst6', name: 'Service tax', pct: 6, byDefault: true };
const ST10 = { id: 'st10', name: 'Sales tax', pct: 10, byDefault: false };

test('allocate shares out whole sen that add up exactly', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(0, [5, 5]), [0, 0]);
  assert.deepEqual(allocate(7, [0, 0]), [0, 0]);
  for (let n = 0; n < 200; n++) {
    const w = Array.from({ length: 1 + (n % 7) }, (_, i) => (n * 37 + i * 101) % 997);
    const total = (n * 131) % 5000;
    const parts = allocate(total, w);
    if (w.some((x) => x > 0)) assert.equal(parts.reduce((a, b) => a + b, 0), total);
    parts.forEach((p) => assert.ok(Number.isInteger(p) && p >= 0));
  }
});

test('the engine never produces a fraction of a sen', () => {
  for (let n = 1; n < 300; n++) {
    const lines = Array.from({ length: 1 + (n % 5) }, (_, i) => ({
      qtyMilli: 1000 + ((n * 7 + i * 333) % 4000), unitPriceSen: 99 + ((n * 53 + i * 17) % 2900),
      discountSen: i === 0 ? n % 50 : 0, taxIds: i % 3 === 0 ? [] : i % 3 === 1 ? ['sst6'] : ['sst6', 'st10'],
    }));
    const e = taxEngine(lines, { taxes: [SST6, ST10], discountPct: n % 15, serviceChargePct: n % 2 ? 10 : 0, pricesIncludeTax: n % 3 !== 0 });
    for (const v of [e.subtotalSen, e.discountSen, e.serviceChargeSen, e.taxSen, e.totalSen, e.untaxedSen]) assert.ok(Number.isInteger(v), String(v));
    // Per-line taxes add up to the bill's taxes.
    for (const x of e.taxes) assert.equal(e.parts.reduce((s, p) => s + (p.taxes[x.id] || 0), 0), x.taxSen);
    // Discount and service charge shares add up too.
    assert.equal(e.parts.reduce((s, p) => s + p.discountSen, 0), e.discountSen);
    assert.equal(e.parts.reduce((s, p) => s + p.serviceChargeSen, 0), e.serviceChargeSen);
  }
});

test('a half sen rounds up, exactly (no floating-point drift)', () => {
  // 25 sen at 6% on top = 1.5 sen -> 2.
  assert.equal(billTotals([{ qtyMilli: 1000, unitPriceSen: 25, taxIds: ['sst6'] }], { taxes: [SST6], pricesIncludeTax: false }).taxSen, 2);
  // 0.1 + 0.2 style trap: 3 x RM 0.10 at 10% = 3 sen.
  assert.equal(billTotals([{ qtyMilli: 3000, unitPriceSen: 10, taxIds: ['st10'] }], { taxes: [ST10], pricesIncludeTax: false }).taxSen, 3);
});

test('SST breakdown: taxable, tax-free marked *, discount before tax', () => {
  const b = calculateSSTBreakdown([
    { name: 'Milo', qtyMilli: 1000, unitPriceSen: 1000, taxIds: ['sst6'] },
    { name: 'Beras', qtyMilli: 1000, unitPriceSen: 1000, taxIds: [] },
  ], {}, { taxes: [SST6], discountPct: 10, pricesIncludeTax: false });
  assert.equal(b.discountSen, 200);
  assert.equal(b.taxableSen, 900);
  assert.equal(b.exemptSen, 900);
  assert.equal(b.taxSen, 54); // 6% of 9.00
  assert.equal(b.totalSen, 1854);
  assert.equal(b.lines[1].mark, '*');
  assert.equal(b.lines[0].mark, '');
  assert.equal(b.lines[0].netSen, 900);
  assert.ok(b.hasExempt);
});

test('service charge taxed as its own line', () => {
  const b = calculateSSTBreakdown([
    { name: 'Nasi', qtyMilli: 1000, unitPriceSen: 10000, taxIds: ['sst6'] },
  ], { pct: 10, taxIds: ['sst6'] }, { taxes: [SST6], pricesIncludeTax: false });
  assert.equal(b.serviceChargeSen, 1000);
  assert.equal(b.serviceChargeTaxSen, 60);
  assert.equal(b.taxSen, 660);
  assert.equal(b.totalSen, 11660);
});

test('service charge shared over the lines: tax on it reported apart', () => {
  const b = calculateSSTBreakdown([{ name: 'Nasi', qtyMilli: 1000, unitPriceSen: 10000, taxIds: ['sst6'] }], { pct: 10 }, { taxes: [SST6], pricesIncludeTax: false });
  assert.equal(b.taxSen, 660);
  assert.equal(b.serviceChargeTaxSen, 60);
});

test('tax types for MyInvois', () => {
  assert.equal(taxTypeOf({ name: 'Service tax' }), '02');
  assert.equal(taxTypeOf({ name: 'SST' }), '01');
  assert.equal(taxTypeOf({ name: 'x', einvoiceType: '02' }), '02');
});

const sale = (n, extra = {}) => ({
  receiptNo: `R${n}`, createdAt: Date.UTC(2026, 8, n, 4), status: 'COMPLETED', totalSen: 1060, taxSen: 60, taxIncluded: true,
  taxes: [{ id: 'sst6', name: 'Service tax', pct: 6, baseSen: 1000, taxSen: 60 }], untaxedSen: 0, roundingSen: 0, ...extra,
});

test('consolidated e-invoice: one line per receipt, voids left out, totals add up', () => {
  const r = buildConsolidatedEInvoice([sale(1), sale(2, { roundingSen: 0 }), sale(3, { status: 'VOIDED' }), sale(4, { totalSen: 500, taxSen: 0, taxes: [], untaxedSen: 500 })], {
    seller: { name: 'Kedai Maju', tin: 'C1234', brn: '2020', sstNo: 'W10', msic: '47111' },
    from: Date.UTC(2026, 8, 1), to: Date.UTC(2026, 8, 30, 23), taxes: [SST6], issuedAt: Date.UTC(2026, 9, 3),
  });
  assert.equal(r.receipts, 3);
  assert.equal(r.totals.totalSen, 2620);
  assert.equal(r.totals.taxSen, 120);
  assert.equal(r.totals.exclusiveSen, 2500);
  const inv = r.json.Invoice[0];
  assert.equal(inv.InvoiceLine.length, 3);
  assert.equal(inv.AccountingCustomerParty[0].Party[0].PartyIdentification[0].ID[0]._, GENERAL_PUBLIC_TIN);
  assert.equal(inv.InvoiceLine[0].Item[0].CommodityClassification[0].ItemClassificationCode[0]._, '004');
  assert.equal(inv.LegalMonetaryTotal[0].PayableAmount[0]._, 26.2);
  assert.equal(inv.TaxTotal[0].TaxAmount[0]._, 1.2);
  const types = inv.TaxTotal[0].TaxSubtotal.map((x) => x.TaxCategory[0].ID[0]._).sort();
  assert.deepEqual(types, ['02', 'E']);
  const lines = r.csv.split('\r\n');
  assert.equal(lines.length, 5); // header, 3 receipts, total
  assert.match(lines[4], /^TOTAL,,3 receipts/);
});

test('a shop with no SST: tax type 06, not exempt', () => {
  const r = buildConsolidatedEInvoice([sale(1, { taxSen: 0, taxes: [], untaxedSen: 1060 })], { taxes: [] });
  assert.deepEqual(r.json.Invoice[0].TaxTotal[0].TaxSubtotal.map((x) => x.TaxCategory[0].ID[0]._), ['06']);
});
