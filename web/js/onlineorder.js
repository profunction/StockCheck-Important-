/**
 * Online purchases (网购进货): stock bought on Pinduoduo, Taobao, Shopee,
 * TikTok Shop or Lazada, recorded as a purchase order so it is received
 * into stock like any other delivery.
 *
 * None of these platforms lets a buyer's orders be read by another program
 * (their open APIs are for sellers), so the order comes in as text: the
 * buyer copies the order details from the app or the confirmation email and
 * pastes them. This file reads that text -- items, quantities, prices,
 * order and tracking numbers, shipping -- tolerantly, because every app lays
 * it out a little differently; whatever it misses is typed in on screen.
 *
 * Money: amounts are read in the order's own minor unit (sen, or fen for
 * yuan) and turned into sen with an exchange rate held as an integer
 * (ringgit per unit x 1,000,000), so nothing is floating point. Pure.
 */
import { allocate } from './money.js';

export const RATE_ONE = 1_000_000;

export const PLATFORMS = {
  pdd: { label: '拼多多 Pinduoduo', currency: 'CNY' },
  taobao: { label: '淘宝 Taobao / 天猫 Tmall', currency: 'CNY' },
  shopee: { label: 'Shopee', currency: 'MYR' },
  tiktok: { label: 'TikTok Shop', currency: 'MYR' },
  lazada: { label: 'Lazada', currency: 'MYR' },
  other: { label: '', currency: 'MYR' },
};

/** Which platform the pasted text came from, or '' when it does not say. */
export function guessPlatform(text) {
  const s = String(text || '');
  if (/拼多多|pinduoduo|\bPDD\b|多多/i.test(s)) return 'pdd';
  if (/淘宝|天猫|taobao|tmall/i.test(s)) return 'taobao';
  if (/shopee/i.test(s)) return 'shopee';
  if (/tiktok|抖音/i.test(s)) return 'tiktok';
  if (/lazada/i.test(s)) return 'lazada';
  return '';
}

const MONEY = /(RM|MYR|RMB|CNY|¥|￥)\s*(-?\d[\d,]*(?:\.\d{1,2})?)|(-?\d[\d,]*(?:\.\d{1,2})?)\s*(元|块)/gi;

/** Every amount on a line: [{ currency, cents }]. 12.9 -> 1290. */
export function moneyIn(line) {
  const out = [];
  for (const m of String(line).matchAll(MONEY)) {
    const sym = (m[1] || m[4] || '').toUpperCase();
    const num = (m[2] || m[3]).replace(/,/g, '');
    const [whole, frac = ''] = num.replace('-', '').split('.');
    const cents = (Number(whole) * 100 + Number((frac + '00').slice(0, 2))) * (num.startsWith('-') ? -1 : 1);
    out.push({ currency: sym === 'RM' || sym === 'MYR' ? 'MYR' : 'CNY', cents });
  }
  return out;
}

const QTY = [
  /(?:^|[\s(（])[x×X＊*]\s?(\d{1,4})\s*(?:件|pcs?)?\s*$/,
  /(?:数量|Qty|Quantity|Kuantiti)\s*[:：]?\s*[x×]?\s*(\d{1,4})/i,
  /共\s*(\d{1,4})\s*件/,
  /^[x×X]\s?(\d{1,4})\b/,
];
const VARIATION = /^(?:Variation|Variasi|规格|颜色分类|款式|型号|尺码|SKU|Option)\s*[:：]\s*(.+)$/i;
const SHIPPING = /(运费|快递费|配送费|Shipping|Delivery Fee|Penghantaran)/i;
const DISCOUNTISH = /(优惠|减免|折扣|Discount|Voucher|Diskaun|红包|券|Coins?\b)/i;
const SUMMARY = /(合计|实付|实收|总计|小计|总价|商品总额|订单总额|应付|Order Total|Total|Subtotal|Jumlah|Payment|付款方式|支付方式|Paid by|Tax|税)/i;
const ORDER_NO = /(?:订单编号|订单号|Order\s*(?:ID|No\.?|Number|SN)|No\.?\s*Pesanan|ID\s*Pesanan)\s*[:：#]?\s*([A-Za-z0-9][A-Za-z0-9-]{5,})/i;
const TRACKING = /(?:运单号|快递单号|物流单号|运单编号|Tracking\s*(?:No\.?|Number|ID)?|No\.?\s*Penjejakan)\s*[:：#]?\s*([A-Za-z0-9]{8,})/i;
// Lines that are about the order, not an item in it.
const NOISE = /(^(?:Shopee|Lazada|TikTok(?: Shop)?|拼多多|淘宝|天猫)$|订单|Order|运单|快递|物流|Tracking|Courier|Ship(?:ped|ping)? (?:by|on)|下单|付款时间|成交时间|发货|签收|Paid|时间|Time|Date|Tarikh|收货|地址|Address|Alamat|电话|Phone|手机|Seller|Penjual|店铺|旗舰店|专营店|Shop\b|Kedai|商家|客服|Chat|Buy Again|再买|评价|Rate|Return|退款|退货|Refund|Status|状态|待收货|已收货|Delivered|Completed|To Receive|Selesai|Diterima|复制|Copy|查看|View|申请|Apply|More|更多)/i;

const clean = (line) => line.replace(/^\s*(?:\d{1,2}[.、)]\s+)/, '').replace(/\s+/g, ' ').trim();
const hasWords = (s) => /[\p{L}]{2,}|[一-鿿]/u.test(s);

/**
 * Reads pasted order text.
 * Returns { platform, orderNo, trackingNo, currency, lines: [{ title,
 * variation, qty, priceCents }], shippingCents, totalCents }.
 * [qty] is whole items; [priceCents] the price of one, in [currency].
 */
export function parseOrderText(text, { platform = '' } = {}) {
  const raw = String(text || '').replace(/\r/g, '');
  const found = guessPlatform(raw);
  const plat = platform || found || 'other';
  const out = { platform: plat, orderNo: '', trackingNo: '', currency: PLATFORMS[plat]?.currency || 'MYR', lines: [], shippingCents: 0, totalCents: null };
  let item = null;
  // An item is kept once it has a price or a quantity; a line of words with
  // neither (a shop name, a heading) is replaced by the next one.
  const finish = () => {
    if (item && item.title && (item.priceCents != null || item.qty)) out.lines.push({ ...item, qty: item.qty || 1, priceCents: item.priceCents ?? 0 });
    item = null;
  };
  let currencySeen = '';

  for (const rawLine of raw.split('\n')) {
    const line = clean(rawLine);
    if (!line) continue;
    const money = moneyIn(line);
    if (money.length && !currencySeen) currencySeen = money[0].currency;

    const o = ORDER_NO.exec(line);
    if (o && !out.orderNo) { out.orderNo = o[1]; continue; }
    const tr = TRACKING.exec(line);
    if (tr && !out.trackingNo && /\d/.test(tr[1])) { out.trackingNo = tr[1]; continue; }

    if (SHIPPING.test(line)) {
      if (money.length) {
        const amount = Math.abs(money[money.length - 1].cents);
        out.shippingCents += DISCOUNTISH.test(line) ? -amount : amount;
      }
      continue;
    }
    if (SUMMARY.test(line) || (DISCOUNTISH.test(line) && money.length)) {
      if (/(实付|实收|Order Total|Total Payment|Jumlah Pesanan|Jumlah Bayaran|订单总额)/i.test(line) && money.length) out.totalCents = money[money.length - 1].cents;
      finish();
      continue;
    }
    const v = VARIATION.exec(line);
    if (v) { if (item) item.variation = v[1].trim(); continue; }

    const qm = QTY.map((r) => r.exec(line)).find(Boolean);
    const qty = qm ? Number(qm[1]) : 0;
    // What is left of the line once amounts and the quantity are taken out.
    const rest = line.replace(MONEY, ' ').replace(qm ? qm[0] : '', ' ').replace(/[:：]\s*$/, '').replace(/^(?:Price|Harga|单价|价格)\s*[:：]?/i, '').trim();
    const titled = rest.length >= 3 && hasWords(rest) && !NOISE.test(rest) && !/^(?:Price|Harga|单价|价格|Qty|Quantity)$/i.test(rest);

    if (titled && !(money.length && rest.length < 4)) {
      finish();
      item = { title: rest.slice(0, 160), variation: '', qty: 0, priceCents: null };
    }
    if (money.length && item) {
      // "RM15.90 RM12.90" is the old price struck out and the price paid.
      if (item.priceCents == null) item.priceCents = Math.abs(money[money.length - 1].cents);
    }
    if (qty && item) {
      if (!item.qty) item.qty = qty;
    }
    if (item && item.priceCents != null && item.qty) finish();
  }
  finish();
  if (currencySeen) out.currency = currencySeen;
  out.shippingCents = Math.max(0, out.shippingCents);
  return out;
}

/** [cents] of [currency] in sen, at [rateMicro] ringgit per unit x 1e6. */
export function toSen(cents, currency, rateMicro) {
  if (currency === 'MYR') return cents;
  return Math.round((cents * rateMicro) / RATE_ONE);
}

/** "0.65" -> 650000; null when it is not a positive number. */
export function parseRate(text) {
  const m = /^\s*(\d{1,4})(?:\.(\d{1,6}))?\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  const v = Number(m[1]) * RATE_ONE + Number(((m[2] || '') + '000000').slice(0, 6));
  return v > 0 ? v : null;
}

export const formatRate = (micro) => (micro / RATE_ONE).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');

/**
 * Cost of one of each line in sen, delivered: the price converted, plus the
 * shipping shared over the lines by their value (whole sen, adding up to the
 * shipping exactly). lines: [{ qty, priceCents }].
 */
export function landedCosts(lines, { currency, rateMicro = RATE_ONE, shippingCents = 0, spreadShipping = true }) {
  const values = lines.map((l) => toSen(l.priceCents * l.qty, currency, rateMicro));
  const shares = spreadShipping ? allocate(toSen(shippingCents, currency, rateMicro), values) : lines.map(() => 0);
  return lines.map((l, i) => (l.qty > 0 ? Math.round((values[i] + shares[i]) / l.qty) : 0));
}

/** A product title reduced to what identifies it, for remembering matches. */
export function titleKey(title) {
  return String(title || '').toLowerCase().replace(/[【】\[\]()（）「」『』"'“”‘’!！?？,，.。、:：;；/\\|+_~-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

const tokens = (s) => {
  const k = titleKey(s);
  const latin = k.match(/[a-z0-9]{2,}/g) || [];
  const han = k.replace(/[^一-鿿]/g, '');
  const pairs = [];
  for (let i = 0; i < han.length - 1; i++) pairs.push(han.slice(i, i + 2));
  return new Set([...latin, ...pairs]);
};

/**
 * Which product a bought item is: one matched before by the same title
 * ([memory]: titleKey -> barcode), else the product whose name is best
 * contained in the title, when clearly so. Returns { barcode, how } or null.
 */
export function matchProduct(title, products, memory = new Map()) {
  const remembered = memory.get(titleKey(title));
  if (remembered && products.some((p) => p.barcode === remembered)) return { barcode: remembered, how: 'memory' };
  const words = tokens(title);
  let best = null;
  for (const p of products) {
    if (p.active === false || !p.name) continue;
    const name = tokens(p.name);
    if (name.size < 2) continue;
    let hit = 0;
    for (const w of name) if (words.has(w)) hit++;
    const score = hit / name.size;
    if (score >= 0.6 && (!best || score > best.score || (score === best.score && name.size > best.size))) best = { barcode: p.barcode, score, size: name.size };
  }
  return best ? { barcode: best.barcode, how: 'guess' } : null;
}

/** titleKey -> barcode from earlier online purchase orders, newest first. */
export function memoryFrom(purchaseOrders) {
  const out = new Map();
  for (const po of [...purchaseOrders].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))) {
    for (const l of po.lines || []) {
      const k = titleKey(l.sourceTitle);
      if (k && l.barcode && !out.has(k)) out.set(k, l.barcode);
    }
  }
  return out;
}

/** An earlier purchase order for the same online order, if any (not cancelled). */
export const duplicateOf = (purchaseOrders, platform, orderNo) => (!orderNo ? null
  : purchaseOrders.find((po) => po.onlinePlatform === platform && po.onlineOrderNo === orderNo && po.status !== 'CANCELLED') || null);
