// node api/answers.test.mjs -- the bot's wider answers, in three languages.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  busyText, compareText, customersText, dontKnow, examplesText, itemSalesText, movesText, noRight, outText, poText, priceText,
  profitText, shiftText, slowText, staffText, taxText, topText, valueText, voidsText, whoamiText,
} from './answers.mjs';
import { summarize } from './bot.mjs';

const START = Date.UTC(2026, 9, 7, 16); // 8/10/2026 in Malaysia
const SALES = [
  { status: 'COMPLETED', totalSen: 5000, cashierName: 'Mei', lines: [{ barcode: 'k', name: 'Kopi', qtyMilli: 2000, lineTotalSen: 5000, costSen: 1500 }] },
  { status: 'VOIDED', totalSen: 900, cashierName: 'Ali', lines: [{ barcode: 'k', name: 'Kopi', qtyMilli: 1000, lineTotalSen: 900, costSen: 1500 }] },
];

test('profit, best sellers and cashiers', () => {
  const s = summarize(SALES);
  assert.equal(s.profitSen, 2000);
  assert.equal(profitText(s, { lang: 'en', start: START }),
    '💹 Profit, today (8/10/2026)\nSales (before tax): RM 50.00\nCost: RM 30.00\nGross profit: RM 20.00 (Margin 40%)');
  assert.match(profitText(s, { lang: 'zh', start: START, missingCost: 1 }), /毛利: RM 20\.00（利润率 40%）\n提示/);
  assert.match(profitText(summarize([]), { lang: 'ms', start: START }), /Tiada jualan/);
  assert.match(topText(s, { lang: 'ms', period: 'month', start: START }), /Paling laris, bulan ini[\s\S]*1\. Kopi ×2 · RM 50\.00/);
  assert.match(staffText(s, { lang: 'en', start: START }), /1\. Mei: RM 50\.00 · 1 receipts$/);
});

test('sold out, stock value, purchase orders, prices', () => {
  assert.equal(outText([], 'en'), '✅ Nothing is sold out.');
  assert.match(outText(Array.from({ length: 22 }, (_, i) => ({ name: `P${i}` })), 'zh'), /22 样[\s\S]*P19\n.*2/);
  assert.equal(valueText([{ place: 'A', sen: 1000 }, { place: 'B', sen: 250 }], 0, 'en'),
    '📦 Stock value (at cost)\n• A: RM 10.00\n• B: RM 2.50\nTotal: RM 12.50');
  assert.equal(poText([], 'ms'), '✅ Tiada pesanan belian menunggu.');
  assert.match(poText([{ poNo: 'PO-1', supplierName: 'S', status: 'PARTIAL' }], 'en'), /• PO-1 · S · part received$/);
  assert.equal(priceText([{ name: 'Beras', priceSen: 2690, unit: 'bag' }, { name: 'Milo', priceSen: 1590, unit: 'pcs' }], 'en'),
    '🏷️ Prices\n• Beras: RM 26.90 / bag\n• Milo: RM 15.90');
  assert.match(dontKnow('abc', 'en'), /did not understand "abc"/);
  assert.match(noRight('zh'), /不能看/);
});

test('compare, busy hours, voids, tax', () => {
  const now = { totalSen: 12000, receipts: 4, profitSen: 3000, start: START, end: START + 86_400_000 };
  const before = { totalSen: 10000, receipts: 5, profitSen: 2500, start: START - 86_400_000, end: START };
  assert.equal(compareText(now, before, { lang: 'en' }),
    '📈 today, compared\nThis time (8/10/2026): RM 120.00 · 4 receipts\nBefore (7/10/2026): RM 100.00 · 5 receipts\n⬆️ Change: +RM 20.00 +20%\nGross profit: RM 30.00 / RM 25.00');
  assert.match(compareText(before, now, { lang: 'zh' }), /⬇️ 变化: -RM 20\.00 -16\.7%/);
  const at = (h) => START + h * 3600_000;
  const sales = [{ createdAt: at(12.5), totalSen: 100 }, { createdAt: at(12.1), totalSen: 200 }, { createdAt: at(9), totalSen: 50 },
    { createdAt: at(12.2), totalSen: 999, status: 'VOIDED', receiptNo: 'R-1', voidedByName: 'Mei', voidReason: 'typo' }];
  assert.match(busyText(sales, { lang: 'en', start: START }), /1\. 12:00–13:00 · 2 receipts · RM 3\.00\n2\. 09:00–10:00 · 1 receipts/);
  assert.match(voidsText(sales.filter((x) => x.status), { lang: 'en', start: START }), /1 receipts, RM 9\.99 in all\n• R-1 RM 9\.99 · Mei · typo/);
  assert.match(voidsText([], { lang: 'zh', start: START }), /没有作废/);
  assert.match(taxText([{ taxSen: 60 }, { taxSen: 40 }, { taxSen: 99, status: 'VOIDED' }, {}], { lang: 'zh', start: START }), /收了 RM 1\.00（2 单有税）/);
});

test('slow sellers, goods in and out, shifts, customers, one product, me', () => {
  assert.match(slowText([{ name: 'Teh', onHand: 5000, place: 'Gudang' }], 'zh'), /30 天没卖出[\s\S]*• Teh \(Gudang\): 剩 5/);
  const moves = [{ barcode: 'a', productName: 'Teh', quantityMilli: 2000, note: '过期' }, { barcode: 'a', productName: 'Teh', quantityMilli: 1000, note: '破' }];
  assert.match(movesText('writeoff', moves, { lang: 'zh', start: START }), /报损[\s\S]*• Teh ×3 \(过期, 破\)/);
  assert.match(movesText('receive', [], { lang: 'ms', start: START }), /Tiada barang masuk/);
  assert.match(shiftText([{ operatorName: 'Mei', branchName: 'Ipoh', openedAt: START + 9 * 3600_000, initialFloatSen: 10000 }], 'en'),
    /Open shifts \(1\)\n• Mei · Ipoh · since 8\/10 09:00 · float RM 100\.00/);
  assert.equal(shiftText([], 'zh'), '现在没有人开班。');
  const people = [{ name: 'Tan', totalSpentSen: 50000, visits: 12, createdAt: 1 }, { name: 'Lim', totalSpentSen: 900, visits: 1, createdAt: START + 5 }];
  assert.match(customersText(people, { lang: 'zh', from: START }), /一共 2 位\n今天新加 1 位\n花最多的：\n1\. Tan · RM 500\.00 · 12×/);
  assert.match(itemSalesText({ name: 'Milo', unit: 'pcs' }, { qtyMilli: 3000, sen: 4770 }, { lang: 'zh', start: START }), /Milo\n今天（8\/10\/2026）卖了 3 pcs · RM 47\.70/);
  assert.match(itemSalesText({ name: 'Milo' }, undefined, { lang: 'en', start: START }), /Sold today \(8\/10\/2026\): 0 · RM 0\.00/);
  assert.match(whoamiText({ name: 'Ali', company: 'Maju', isAdmin: false, role: 'Cashier', places: ['Ipoh'] }, 'en'), /Role: Cashier\nPlaces: Ipoh/);
  assert.match(whoamiText({ name: 'Boss', company: 'Maju', isAdmin: true, places: [] }, 'zh'), /老板（全部权限）\n地点：全部/);
  for (const l of ['zh', 'en', 'ms']) assert.ok(examplesText(l).split('\n').length > 20);
});
