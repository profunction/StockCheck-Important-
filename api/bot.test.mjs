// node api/bot.test.mjs -- what the bot understands and what it says.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dayRange, findProducts, langOf, lowText, parseMessage, periodRange, qty, reportPush, reportText, rm, salesText, stockText, summarize,
} from './bot.mjs';

test('questions in three languages', () => {
  assert.deepEqual(parseMessage('/start AB12cd34'), { kind: 'link', code: 'AB12cd34' });
  assert.equal(parseMessage('帮助').kind, 'help');
  assert.equal(parseMessage('').kind, 'help');
  assert.deepEqual(parseMessage('今天卖了多少？'), { kind: 'sales', period: 'today', day: 'today' });
  assert.deepEqual(parseMessage('昨天卖了多少'), { kind: 'sales', period: 'yesterday', day: 'yesterday' });
  assert.deepEqual(parseMessage('jualan semalam'), { kind: 'sales', period: 'yesterday', day: 'yesterday' });
  assert.deepEqual(parseMessage('sales'), { kind: 'sales', period: 'today', day: 'today' });
  assert.equal(parseMessage('低库存').kind, 'low');
  assert.equal(parseMessage('low stock').kind, 'low');
  assert.equal(parseMessage('stok rendah').kind, 'low');
  assert.equal(parseMessage('报告').kind, 'report');
  assert.deepEqual(parseMessage('Milo 还有多少？'), { kind: 'stock', query: 'Milo' });
  assert.deepEqual(parseMessage('how many Milo 1kg'), { kind: 'stock', query: 'Milo 1kg' });
  assert.deepEqual(parseMessage('berapa stok Milo'), { kind: 'stock', query: 'Milo' });
  assert.deepEqual(parseMessage('Beras 5kg'), { kind: 'stock', query: 'Beras 5kg', guess: true });
  assert.deepEqual(parseMessage('/stock 9555012345678'), { kind: 'stock', query: '9555012345678' });
});

test('the wider questions: sold out, profit, best sellers, cashiers, value, orders, prices', () => {
  const kind = (s) => parseMessage(s).kind;
  for (const s of ['有什么没有货了吗', '有什么没货了？', '卖完了吗', 'what is out of stock', 'stok habis apa']) assert.equal(kind(s), 'out', s);
  assert.equal(kind('低库存'), 'low');
  for (const s of ['这个月赚多少？', '今天利润', 'profit this month', 'untung bulan ini']) assert.equal(kind(s), 'profit', s);
  assert.equal(parseMessage('这个月赚多少？').period, 'month');
  assert.equal(parseMessage('profit this week').period, 'week');
  for (const s of ['什么最好卖？', '最畅销', 'best sellers', 'paling laris']) assert.equal(kind(s), 'top', s);
  for (const s of ['谁卖最多？', 'sales by cashier']) assert.equal(kind(s), 'staff', s);
  for (const s of ['库存价值多少？', 'stock value', 'nilai stok']) assert.equal(kind(s), 'value', s);
  for (const s of ['有什么采购单要收货？', 'purchase orders', 'pesanan belian']) assert.equal(kind(s), 'po', s);
  assert.deepEqual(parseMessage('这个星期卖了多少？'), { kind: 'sales', period: 'week', day: 'week' });
  assert.deepEqual(parseMessage('Milo 多少钱？'), { kind: 'price', query: 'Milo' });
  assert.deepEqual(parseMessage('price of Milo 1kg'), { kind: 'price', query: 'Milo 1kg' });
  assert.deepEqual(parseMessage('harga Milo'), { kind: 'price', query: 'Milo' });
});

test('periods run in Malaysian time', () => {
  // 2026-10-08 01:00 in Malaysia.
  const now = Date.UTC(2026, 9, 7, 17, 0);
  const [ws, we] = periodRange('week', now);
  assert.equal(new Date(ws).toISOString(), '2026-10-01T16:00:00.000Z');
  assert.equal(new Date(we).toISOString(), '2026-10-08T16:00:00.000Z');
  assert.equal(new Date(periodRange('month', now)[0]).toISOString(), '2026-09-30T16:00:00.000Z');
  assert.deepEqual(periodRange('yesterday', now), dayRange(now, 1));
});

const PRODUCTS = [
  { barcode: '9555012345678', name: 'Milo 1kg', unit: 'pcs' },
  { barcode: '9555000000001', name: 'Milo 3 in 1 Kotak 18 x 33g', unit: 'box' },
  { barcode: '2001', name: 'Beras 5kg 白米', unit: 'bag', sku: 'BR5' },
];

test('finding products: barcode, SKU, or every word of the name', () => {
  assert.deepEqual(findProducts(PRODUCTS, '9555012345678').map((p) => p.name), ['Milo 1kg']);
  assert.deepEqual(findProducts(PRODUCTS, 'br5').map((p) => p.name), ['Beras 5kg 白米']);
  assert.deepEqual(findProducts(PRODUCTS, 'milo').map((p) => p.name), ['Milo 1kg', 'Milo 3 in 1 Kotak 18 x 33g']);
  assert.deepEqual(findProducts(PRODUCTS, '白米').map((p) => p.barcode), ['2001']);
  assert.deepEqual(findProducts(PRODUCTS, 'kopi'), []);
});

test('money, quantities and Malaysian days', () => {
  assert.equal(rm(123456), 'RM 1,234.56');
  assert.equal(rm(5), 'RM 0.05');
  assert.equal(rm(-250), '-RM 2.50');
  assert.equal(qty(1500), '1.5');
  assert.equal(qty(12000), '12');
  // 2026-10-08 01:00 in Malaysia is 2026-10-07 17:00 UTC.
  const now = Date.UTC(2026, 9, 7, 17, 0);
  const [start, end] = dayRange(now);
  assert.equal(new Date(start).toISOString(), '2026-10-07T16:00:00.000Z');
  assert.equal(end - start, 86_400_000);
  assert.equal(new Date(dayRange(now, 1)[0]).toISOString(), '2026-10-06T16:00:00.000Z');
  assert.equal(langOf('zh-hans'), 'zh');
  assert.equal(langOf('id'), 'ms');
  assert.equal(langOf('fr'), 'zh');
});

const SALES = [
  { status: 'COMPLETED', totalSen: 2000, payments: [{ method: 'CASH', amountSen: 5000 }], changeSen: 3000,
    lines: [{ barcode: '9555012345678', name: 'Milo 1kg', qtyMilli: 2000, lineTotalSen: 2000 }] },
  { status: 'COMPLETED', totalSen: 1690, payments: [{ method: 'QR', amountSen: 1690 }],
    lines: [{ barcode: '2001', name: 'Beras 5kg 白米', qtyMilli: 1000, lineTotalSen: 1690 }] },
  { status: 'VOIDED', totalSen: 999, payments: [{ method: 'CARD', amountSen: 999 }], lines: [] },
];

test('a day of sales: voids left out, change taken off the cash', () => {
  const s = summarize(SALES);
  assert.equal(s.totalSen, 3690);
  assert.equal(s.receipts, 2);
  assert.equal(s.averageSen, 1845);
  assert.equal(s.voided, 1);
  assert.deepEqual(s.byMethod, { CASH: 2000, QR: 1690 });
  assert.equal(s.top[0].name, 'Milo 1kg');
  const zh = salesText(s, { lang: 'zh', day: 'today', start: Date.UTC(2026, 9, 7, 16) });
  assert.match(zh, /今天（8\/10\/2026）/);
  assert.match(zh, /营业额：RM 36\.90（2 单，平均每单 RM 18\.45）/);
  assert.match(zh, /现金 RM 20\.00 · DuitNow QR RM 16\.90/);
  assert.match(salesText(s, { lang: 'en' }), /Sales: RM 36\.90 \(2 receipts, average RM 18\.45\)/);
  assert.match(salesText(summarize([]), { lang: 'ms' }), /Tiada jualan/);
});

test('stock at each place, low stock, the report and its notification', () => {
  const levels = { ipoh: [{ barcode: '9555012345678', onHand: 12000 }], gudang: [{ barcode: '9555012345678', onHand: 40500 }] };
  const names = { ipoh: 'Kedai Ipoh', gudang: 'Gudang' };
  const text = stockText([PRODUCTS[0], PRODUCTS[2]], levels, (b) => names[b], 'zh');
  assert.match(text, /📦 Milo 1kg\n {2}Kedai Ipoh: 12 pcs\n {2}Gudang: 40\.5 pcs/);
  assert.match(text, /📦 Beras 5kg 白米\n {2}还没有盘点或进货记录/);
  const lows = [{ name: 'Telur', onHand: 4000, reorderLevel: 30000, place: 'Kedai Ipoh' }];
  assert.match(lowText(lows, 'zh'), /⚠️ 低库存 1 样\n• Telur \(Kedai Ipoh\): 剩 4, 补货点 30/);
  assert.equal(lowText([], 'en'), '✅ Nothing is low.');
  const report = reportText({ company: 'Kedai Maju', summary: summarize(SALES), lows, start: Date.UTC(2026, 9, 6, 16), lang: 'zh' });
  assert.match(report, /📊 SuXin 每日报告 · Kedai Maju\n7\/10\/2026/);
  assert.match(report, /营业额：RM 36\.90/);
  assert.match(report, /低库存 1 样/);
  assert.doesNotMatch(reportText({ company: 'K', summary: summarize(SALES), lows, start: 0, showSales: false }), /营业额/);
  assert.deepEqual(reportPush({ summary: summarize(SALES), lows, lang: 'en' }), { title: 'SuXin daily report', body: 'Sales RM 36.90 · 2 receipts\n⚠️ 1 items low' });
});
