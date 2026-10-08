// node web/js/onlineorder.test.mjs -- reading pasted online orders (网购进货).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  duplicateOf, guessPlatform, landedCosts, matchProduct, memoryFrom, moneyIn, parseOrderText, parseRate, titleKey, toSen,
} from './onlineorder.js';

const PDD = `拼多多
已签收
义乌好货批发店
【50个装】一次性塑料袋 背心袋 加厚
规格：中号 26*42cm
¥12.80
x3
透明胶带 封箱胶带 宽4.5cm 6卷
颜色分类：透明
¥9.90  ×2
商品总价 ¥58.20
运费 ¥0.00
实付 ¥58.20
订单编号：240915-582013947761203
快递单号：YT7491234567890`;

const SHOPEE = `Shopee
Order Completed
Kedai Borong Maju
Milo Activ-Go 1kg Refill Pack
Variation: 1kg
RM18.90 RM15.90
x4
Gula Prai 1kg
x10
RM2.99
Merchandise Subtotal RM93.50
Shipping Subtotal RM4.90
Shipping Discount Subtotal -RM4.90
Order Total RM93.50
Order ID 240915ABCDE123
Tracking Number SPXMY04123456789`;

const EMAIL = `Your order has been shipped!
Order ID: 2409KX7T9P2
1. Nescafe Classic 200g
Quantity: 2
Price: RM 21.50
2. Sunlight Lemon 900ml
Quantity: 6
Price: RM 6.90
Shipping Fee: RM 5.00
Order Total: RM 89.40`;

const TAOBAO = `淘宝
订单号: 3901234567890123456
复制
包装纸箱 三层特硬 5号 10个
数量：2
￥15.00
运费：￥8.00
实付款：￥38.00`;

test('the platform is recognised from the text', () => {
  assert.equal(guessPlatform(PDD), 'pdd');
  assert.equal(guessPlatform(SHOPEE), 'shopee');
  assert.equal(guessPlatform('TikTok Shop order'), 'tiktok');
  assert.equal(guessPlatform(TAOBAO), 'taobao');
  assert.equal(guessPlatform('Lazada'), 'lazada');
  assert.equal(guessPlatform('hello'), '');
});

test('amounts in ringgit and yuan, to the cent', () => {
  assert.deepEqual(moneyIn('RM18.90 RM15.90'), [{ currency: 'MYR', cents: 1890 }, { currency: 'MYR', cents: 1590 }]);
  assert.deepEqual(moneyIn('¥9.9'), [{ currency: 'CNY', cents: 990 }]);
  assert.deepEqual(moneyIn('合计 1,280元'), [{ currency: 'CNY', cents: 128000 }]);
  assert.deepEqual(moneyIn('-RM4.90'), [{ currency: 'MYR', cents: 490 }]);
});

test('Pinduoduo: two items, quantities, yuan, order and tracking numbers', () => {
  const o = parseOrderText(PDD);
  assert.equal(o.platform, 'pdd');
  assert.equal(o.currency, 'CNY');
  assert.equal(o.orderNo, '240915-582013947761203');
  assert.equal(o.trackingNo, 'YT7491234567890');
  assert.equal(o.lines.length, 2);
  assert.match(o.lines[0].title, /一次性塑料袋/);
  assert.equal(o.lines[0].variation, '中号 26*42cm');
  assert.equal(o.lines[0].qty, 3);
  assert.equal(o.lines[0].priceCents, 1280);
  assert.match(o.lines[1].title, /透明胶带/);
  assert.equal(o.lines[1].qty, 2);
  assert.equal(o.lines[1].priceCents, 990);
  assert.equal(o.shippingCents, 0);
  assert.equal(o.totalCents, 5820);
});

test('Shopee: the price paid, not the struck-out one; free shipping nets to zero', () => {
  const o = parseOrderText(SHOPEE);
  assert.equal(o.platform, 'shopee');
  assert.equal(o.currency, 'MYR');
  assert.equal(o.orderNo, '240915ABCDE123');
  assert.equal(o.trackingNo, 'SPXMY04123456789');
  assert.deepEqual(o.lines.map((l) => [l.title, l.qty, l.priceCents]), [
    ['Milo Activ-Go 1kg Refill Pack', 4, 1590],
    ['Gula Prai 1kg', 10, 299],
  ]);
  assert.equal(o.shippingCents, 0);
  assert.equal(o.totalCents, 9350);
});

test('a confirmation email: numbered items, Quantity and Price lines, shipping fee', () => {
  const o = parseOrderText(EMAIL, { platform: 'tiktok' });
  assert.equal(o.platform, 'tiktok');
  assert.equal(o.orderNo, '2409KX7T9P2');
  assert.deepEqual(o.lines.map((l) => [l.title, l.qty, l.priceCents]), [
    ['Nescafe Classic 200g', 2, 2150],
    ['Sunlight Lemon 900ml', 6, 690],
  ]);
  assert.equal(o.shippingCents, 500);
});

test('Taobao: 数量 line, shipping in yuan', () => {
  const o = parseOrderText(TAOBAO);
  assert.equal(o.orderNo, '3901234567890123456');
  assert.equal(o.lines.length, 1);
  assert.equal(o.lines[0].qty, 2);
  assert.equal(o.lines[0].priceCents, 1500);
  assert.equal(o.shippingCents, 800);
  assert.equal(o.totalCents, 3800);
});

test('nothing recognisable: no lines, nothing made up', () => {
  const o = parseOrderText('hello there\nthank you');
  assert.equal(o.lines.length, 0);
});

test('exchange rate as an integer; yuan to sen', () => {
  assert.equal(parseRate('0.65'), 650_000);
  assert.equal(parseRate('0.6512'), 651_200);
  assert.equal(parseRate('abc'), null);
  assert.equal(parseRate('0'), null);
  assert.equal(toSen(1280, 'CNY', 650_000), 832);
  assert.equal(toSen(1590, 'MYR', 650_000), 1590);
});

test('landed cost: shipping shared by value, adds up exactly', () => {
  const lines = [{ qty: 3, priceCents: 1280 }, { qty: 2, priceCents: 990 }];
  const costs = landedCosts(lines, { currency: 'CNY', rateMicro: 650_000, shippingCents: 800 });
  // goods 38.40 + 19.80 yuan = RM 24.96 + 12.87; shipping RM 5.20 shared 3.43 / 1.77
  assert.deepEqual(costs, [Math.round((2496 + 343) / 3), Math.round((1287 + 177) / 2)]);
  assert.deepEqual(landedCosts(lines, { currency: 'CNY', rateMicro: 650_000, shippingCents: 800, spreadShipping: false }), [832, 644]);
});

test('matching: a remembered title first, else a product named inside the title', () => {
  const products = [
    { barcode: '111', name: 'Milo Activ-Go 1kg' },
    { barcode: '222', name: 'Gula Prai 1kg' },
    { barcode: '333', name: '塑料袋 中号' },
  ];
  assert.deepEqual(matchProduct('Milo Activ-Go 1kg Refill Pack', products), { barcode: '111', how: 'guess' });
  assert.deepEqual(matchProduct('【50个装】一次性塑料袋 背心袋 加厚 中号', products), { barcode: '333', how: 'guess' });
  assert.equal(matchProduct('Something else entirely', products), null);
  const memory = new Map([[titleKey('Gula 1kg putih'), '222']]);
  assert.deepEqual(matchProduct('Gula 1kg Putih', products, memory), { barcode: '222', how: 'memory' });
});

test('memory comes from earlier online purchase orders; duplicates are found', () => {
  const pos = [
    { createdAt: 2, onlinePlatform: 'pdd', onlineOrderNo: 'A1', status: 'ORDERED', lines: [{ barcode: '333', sourceTitle: '塑料袋 加厚' }] },
    { createdAt: 1, onlinePlatform: 'pdd', onlineOrderNo: 'A0', status: 'CANCELLED', lines: [{ barcode: '999', sourceTitle: '塑料袋 加厚' }] },
  ];
  assert.equal(memoryFrom(pos).get(titleKey('塑料袋 加厚')), '333');
  assert.equal(duplicateOf(pos, 'pdd', 'A1')?.onlineOrderNo, 'A1');
  assert.equal(duplicateOf(pos, 'pdd', 'A0'), null);
  assert.equal(duplicateOf(pos, 'shopee', 'A1'), null);
  assert.equal(duplicateOf(pos, 'pdd', ''), null);
});
