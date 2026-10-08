// node api/answers.test.mjs -- the bot's wider answers, in three languages.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dontKnow, noRight, outText, poText, priceText, profitText, staffText, topText, valueText } from './answers.mjs';
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
