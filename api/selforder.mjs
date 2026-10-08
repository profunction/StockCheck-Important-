/**
 * Ordering by QR code (扫码点餐): a customer scans the code on the table or
 * the counter, picks from the menu on their own phone and sends the order.
 * No account, no app. The order waits at the till until the staff accept it
 * -- into the table's bill, or as a takeaway ticket with a pickup number --
 * so a prank order never reaches the kitchen.
 *
 *   GET  /public/order/:shop               the menu, the tables, the taxes
 *   POST /public/order/:shop               send an order -> { id, pickupNo }
 *   GET  /public/order/:shop/:id           how it is going
 *
 * [shop] is "<workspace>~<branch or ->~<secret>"; the secret is made in the
 * till's settings (Settings -> QR ordering), and changing it voids every
 * printed code. Prices, names and taxes are read here from the shop's own
 * items, never taken from the phone. The order is written to
 * workspaces/{ws}/selfOrders/{id}, which only the staff can read; the till
 * listens to it.
 *
 * The pure parts (menu, lines, status) are tested in selforder.test.mjs.
 */
import { billTotals, productTaxIds, taxList } from './money.js';
import { ApiError } from './lib.mjs';

const MAX_LINES = 40;
const MAX_QTY = 50;
const NOTE_MAX = 140;

/** "<ws>~<branch>~<secret>" -> its parts, or null. "-" is the main shop. */
export function parseShop(code) {
  const m = /^([A-Za-z0-9_-]{1,64})~([A-Za-z0-9_-]{1,64})~([A-Za-z0-9]{8,32})$/.exec(String(code || ''));
  if (!m) return null;
  return { ws: m[1], branchId: m[2] === '-' ? '' : m[2], secret: m[3] };
}

/** The shop's own settings for QR ordering, if [shop] names it and it is on. */
export function shopSettings(settings, shop) {
  const so = settings?.selfOrder;
  if (!so?.enabled || !shop) return null;
  const want = so.codes?.[shop.branchId || '-'];
  if (!want || want !== shop.secret) return null;
  return {
    dineIn: so.dineIn !== false,
    takeaway: so.takeaway !== false,
    message: String(so.message || '').slice(0, 200),
  };
}

const sellable = (p) => p.active !== false && p.priceSen != null && p.selfOrder !== false && !p.soldOut;

/** What the customer's phone is shown: no costs, no stock, nothing private. */
export function buildMenu({ products, categories = [], modifiers = [], settings = {}, shopName = '', branchName = '', so }) {
  const taxes = taxList(settings);
  const items = products.filter(sellable).map((p) => ({
    barcode: p.barcode,
    name: p.name || p.barcode,
    priceSen: p.priceSen,
    photoUrl: typeof p.photoUrl === 'string' && /^(https:\/\/|\/img\/)/.test(p.photoUrl) ? p.photoUrl : '',
    categoryId: p.category || '',
    modifierIds: (p.modifierIds || []).filter((id) => modifiers.some((m) => m.id === id)),
    description: String(p.description || '').slice(0, 200),
    taxIds: productTaxIds(p, taxes),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const used = new Set(items.map((i) => i.categoryId));
  return {
    shop: { name: shopName, branch: branchName, message: so.message },
    orderTypes: [so.dineIn ? 'DINE_IN' : null, so.takeaway ? 'TAKEAWAY' : null].filter(Boolean),
    tables: so.dineIn ? (settings.tables || []).map(String) : [],
    categories: categories.filter((c) => used.has(c.id)).map((c) => ({ id: c.id, name: c.name, color: c.color || '' })),
    modifiers: modifiers.filter((m) => items.some((i) => i.modifierIds.includes(m.id))).map((m) => ({
      id: m.id, name: m.name, required: !!m.required, multiple: m.multiple !== false,
      options: (m.options || []).map((o) => ({ name: o.name, priceSen: o.priceSen || 0 })),
    })),
    items,
    pricesIncludeTax: settings.pricesIncludeTax !== false,
    serviceChargePct: Number(settings.serviceChargePct) || 0,
    taxes: taxes.map((x) => ({ id: x.id, name: x.name, pct: x.pct })),
  };
}

const bad = (message) => new ApiError(400, message, 'BAD_ORDER');

/**
 * The phone's choices -> till lines, priced from the shop's items. [items]
 * are { barcode, qty, options: { [groupId]: [optionIndex] }, note }.
 */
export function buildLines(items, { products, modifiers = [], settings = {} }) {
  if (!Array.isArray(items) || !items.length) throw bad('The order is empty.');
  if (items.length > MAX_LINES) throw bad(`At most ${MAX_LINES} lines.`);
  const byCode = new Map(products.filter(sellable).map((p) => [p.barcode, p]));
  const taxes = taxList(settings);
  return items.map((it) => {
    const p = byCode.get(String(it?.barcode || ''));
    if (!p) throw bad('An item is no longer on the menu.');
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw bad('A quantity is not right.');
    const chosen = [];
    for (const id of p.modifierIds || []) {
      const g = modifiers.find((m) => m.id === id);
      if (!g) continue;
      const picks = [...new Set((it.options?.[id] || []).map(Number))].filter((i) => Number.isInteger(i) && g.options?.[i]);
      if (g.required && !picks.length) throw bad(`Choose ${g.name}.`);
      if (g.multiple === false && picks.length > 1) throw bad(`Only one ${g.name}.`);
      picks.forEach((i) => chosen.push({ name: g.options[i].name, priceSen: g.options[i].priceSen || 0 }));
    }
    const unitPriceSen = p.priceSen + chosen.reduce((s, m) => s + m.priceSen, 0);
    return {
      key: `${p.barcode}|${chosen.map((m) => m.name).join(',')}|${unitPriceSen}`,
      barcode: p.barcode,
      name: p.name || p.barcode,
      categoryId: p.category || '',
      unit: p.unit || '',
      qtyMilli: qty * 1000,
      unitPriceSen,
      basePriceSen: p.priceSen,
      costSen: p.costSen ?? null,
      modifiers: chosen,
      discountSen: 0,
      note: String(it.note || '').trim().slice(0, NOTE_MAX),
      trackStock: p.trackStock !== false,
      taxIds: productTaxIds(p, taxes),
      sent: false,
      fromQr: true,
    };
  });
}

/** What the bill comes to, as the till will work it out (no discounts yet). */
export function orderTotal(lines, settings, orderType) {
  return billTotals(lines, {
    taxes: taxList(settings),
    pricesIncludeTax: settings.pricesIncludeTax !== false,
    serviceChargePct: orderType === 'DINE_IN' ? Number(settings.serviceChargePct) || 0 : 0,
  }).totalSen;
}

/** NEW, ACCEPTED, READY, DONE or REJECTED, as the customer is told. */
export function statusFor(order, ticketStillOpen) {
  if (order.status === 'REJECTED' || order.status === 'NEW') return order.status;
  if (order.status === 'DONE') return 'DONE';
  // Accepted into a bill: once that bill is paid and gone, it is done.
  if (order.mergedInto && !ticketStillOpen) return 'DONE';
  return order.status === 'READY' ? 'READY' : 'ACCEPTED';
}

/** Today's date in Malaysia, for the pickup numbers that start at 1 each day. */
const myDay = (now) => new Date(now + 8 * 3600_000).toISOString().slice(0, 10);

export function selfOrdering(db, { now = () => Date.now() } = {}) {
  const wsRef = (ws) => db.collection('workspaces').doc(ws);
  const cache = new Map();

  /** The shop behind a code, read at most every 30 seconds per instance. */
  async function shopOf(code) {
    const shop = parseShop(code);
    if (!shop) throw new ApiError(404, 'This QR code is not right.', 'NO_SHOP');
    const hit = cache.get(code);
    if (hit && now() - hit.at < 30_000) return hit.value;
    const ref = wsRef(shop.ws);
    const [settingsSnap, configSnap, productsSnap, catsSnap, modsSnap] = await Promise.all([
      ref.collection('pos').doc('settings').get(), ref.collection('meta').doc('config').get(),
      ref.collection('products').get(), ref.collection('pos').doc('categories').get(), ref.collection('pos').doc('modifiers').get(),
    ]);
    const settings = settingsSnap.data() || {};
    const so = shopSettings(settings, shop);
    if (!so) throw new ApiError(404, 'QR ordering is not on for this shop.', 'NO_SHOP');
    const config = configSnap.data() || {};
    const value = {
      shop, so, settings,
      products: productsSnap.docs.map((d) => ({ ...d.data(), barcode: d.id })),
      categories: catsSnap.data()?.list || [],
      modifiers: modsSnap.data()?.list || [],
      shopName: config.companyName || '',
      branchName: shop.branchId ? (config.branches || []).find((b) => b.id === shop.branchId)?.name || '' : '',
    };
    cache.set(code, { at: now(), value });
    if (cache.size > 500) cache.clear();
    return value;
  }

  async function menu(code) {
    const s = await shopOf(code);
    return buildMenu(s);
  }

  async function place(code, body) {
    const s = await shopOf(code);
    const orderType = body?.orderType === 'DINE_IN' ? 'DINE_IN' : 'TAKEAWAY';
    if (orderType === 'DINE_IN' && !s.so.dineIn) throw bad('Dine-in orders are not taken here.');
    if (orderType === 'TAKEAWAY' && !s.so.takeaway) throw bad('Takeaway orders are not taken here.');
    const table = orderType === 'DINE_IN' ? String(body?.table || '') : '';
    if (orderType === 'DINE_IN' && !(s.settings.tables || []).map(String).includes(table)) throw bad('Choose your table.');
    const lines = buildLines(body?.items, s);
    const ref = wsRef(s.shop.ws);
    const at = now();
    const counter = ref.collection('selfOrderDays').doc(`${s.shop.branchId || '-'}_${myDay(at)}`);
    const orderRef = ref.collection('selfOrders').doc();
    let pickupNo = '';
    await db.runTransaction(async (tx) => {
      const n = ((await tx.get(counter)).data()?.n || 0) + 1;
      pickupNo = String(n);
      tx.set(counter, { n, updatedAt: at });
      tx.set(orderRef, {
        branchId: s.shop.branchId, orderType, table, pickupNo, lines,
        note: String(body?.note || '').trim().slice(0, NOTE_MAX),
        customerName: String(body?.name || '').trim().slice(0, 40),
        totalSen: orderTotal(lines, s.settings, orderType),
        status: 'NEW', open: true, source: 'QR', createdAt: at, updatedAt: at,
      });
    });
    return { id: orderRef.id, pickupNo };
  }

  async function status(code, id) {
    const s = await shopOf(code);
    if (!/^[A-Za-z0-9]{10,40}$/.test(String(id || ''))) throw new ApiError(404, 'No such order.', 'NO_ORDER');
    const ref = wsRef(s.shop.ws);
    const snap = await ref.collection('selfOrders').doc(id).get();
    const o = snap.exists ? snap.data() : null;
    if (!o || (o.branchId || '') !== s.shop.branchId) throw new ApiError(404, 'No such order.', 'NO_ORDER');
    const open = o.mergedInto ? (await ref.collection('orders').doc(o.mergedInto).get()).exists : false;
    return {
      status: statusFor(o, open), pickupNo: o.pickupNo || '', table: o.table || '', orderType: o.orderType,
      reason: o.status === 'REJECTED' ? String(o.rejectReason || '') : '',
      lines: (o.lines || []).map((l) => ({ name: l.name, qty: l.qtyMilli / 1000, modifiers: (l.modifiers || []).map((m) => m.name), note: l.note || '' })),
      totalSen: o.totalSen || 0, createdAt: o.createdAt,
    };
  }

  return { menu, place, status };
}
