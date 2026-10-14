/**
 * The shop floor in 3D (POS 店面 3D), live for the branch this till is at,
 * drawn as the shop it is whether or not anything sold yet today
 * (town.js shopLayout):
 *
 *   a shop        a shelf unit per category stocked with its products --
 *                 sold out a gap, low in amber -- its sign over it; the
 *                 customers of the last half hour in the aisles; the
 *                 checkouts with a cashier at each till that sold today
 *   a restaurant  the kitchen with a cook per bill cooking; the tables
 *                 coloured free / ordering / eating with their guests;
 *                 the takeaway queue at the counter
 *
 * Beside it (below on a phone): today's figures, the best sellers, and
 * what is running out (a shop) or the kitchen queue (a restaurant); and
 * whatever was tapped. Bills come in as they change; sales and stock are
 * read again every minute. It only reads.
 */
import { collection, db, getDocs, onSnapshot, orderBy, query, where } from './fb.js';
import { h, mount, timeOfDay } from './dom.js';
import { addStrings, t } from './i18n.js';
import { formatQty, rm } from './money.js';
import { onChange, session, ws } from './session.js';
import { night3d, scene3d } from './view3d.js';
import { shopLayout, STOCK_COLOR, TABLE_COLOR } from './town.js';
import { layoutFor } from './modes.js';
import { totalsFor } from './register.js';
import { isLow } from './ledger.js';
import { levelsFor, loadStockData } from './stockdata.js';
import { menuButton } from './main.js';

addStrings({
  en: { floor3dAvg: 'Average bill', floor3dShoppers: 'Customers, last 30 min', floor3dBest: 'Best sellers today', floor3dLowList: 'Running out', floor3dKitchenQ: 'Kitchen queue',
    floor3dTakeaway: 'Takeaway', floor3dEntrance: 'ENTRANCE', floor3dShelfN: 'Shelf', floor3dNothingYet: 'Nothing sold yet today.', floor3dAllStocked: 'Nothing running out.',
    floor3dNoQueue: 'Nothing cooking.', floor3dMin: '{n} min', floor3d_free: 'Free', floor3d_ordering: 'Ordering', floor3d_eating: 'Eating', floor3dStockOk: 'In stock', floor3dStockLow: 'Low', floor3dStockOut: 'Sold out (gap)',
    floor3dNoProducts: 'Add products (and categories) and the shelves fill up here.', floor3dProducts: 'Products' },
  zh: { floor3dAvg: '平均每单', floor3dShoppers: '最近 30 分钟客人', floor3dBest: '今天最好卖', floor3dLowList: '快卖完', floor3dKitchenQ: '厨房排队',
    floor3dTakeaway: '外卖', floor3dEntrance: '入口', floor3dShelfN: '货架', floor3dNothingYet: '今天还没有卖。', floor3dAllStocked: '没有快卖完的。',
    floor3dNoQueue: '厨房没有在做的单。', floor3dMin: '{n} 分钟', floor3d_free: '空桌', floor3d_ordering: '点餐中', floor3d_eating: '用餐中', floor3dStockOk: '有货', floor3dStockLow: '快没了', floor3dStockOut: '卖完（空位）',
    floor3dNoProducts: '加了商品（和类别）以后，货架就会摆满。', floor3dProducts: '商品' },
  ms: { floor3dAvg: 'Purata bil', floor3dShoppers: 'Pelanggan, 30 min lalu', floor3dBest: 'Paling laris hari ini', floor3dLowList: 'Hampir habis', floor3dKitchenQ: 'Giliran dapur',
    floor3dTakeaway: 'Bungkus', floor3dEntrance: 'PINTU MASUK', floor3dShelfN: 'Rak', floor3dNothingYet: 'Belum ada jualan hari ini.', floor3dAllStocked: 'Tiada yang hampir habis.',
    floor3dNoQueue: 'Tiada yang dimasak.', floor3dMin: '{n} min', floor3d_free: 'Kosong', floor3d_ordering: 'Memesan', floor3d_eating: 'Makan', floor3dStockOk: 'Ada stok', floor3dStockLow: 'Rendah', floor3dStockOut: 'Habis (kosong)',
    floor3dNoProducts: 'Tambah produk (dan kategori) dan rak akan penuh di sini.', floor3dProducts: 'Produk' },
});

const inList = () => [...session.branchIds, ''].slice(0, 30);
const PALETTE = ['#4fa3d9', '#e3a03c', '#d9653b', '#8b5cf6', '#14a37f', '#ec4899', '#64748b', '#0ea5e9'];

async function todaysSales() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const col = collection(db, ws('sales'));
  const range = [where('createdAt', '>=', start.getTime()), orderBy('createdAt', 'desc')];
  const q = session.branchIds.length ? query(col, where('branchId', 'in', inList()), ...range) : query(col, ...range);
  return (await getDocs(q)).docs.map((d) => d.data()).filter((s) => (s.branchId || '') === (session.branchId || '') && s.status !== 'VOIDED');
}

const billTotal = (o) => totalsFor({ lines: [], discountIds: [], ...o, discountIds: o.discountIds || [] }).totalSen;
/** A table's bill: nothing sent to the kitchen yet is ordering; anything sent, eating. */
const tableState = (o) => (!o ? 'free' : (o.lines || []).some((l) => l.sent) ? 'eating' : 'ordering');

/**
 * The shelves: a unit per category with its products; products with no
 * category on shelves of their own, eighteen to a shelf.
 */
function aislesFor(products, levelOf) {
  const live = products.filter((p) => p.active !== false);
  const byCat = new Map(session.categories.map((c, i) => [c.id, { id: c.id, name: c.name, color: c.color || PALETTE[i % PALETTE.length], sen: 0, products: [] }]));
  const loose = [];
  for (const p of live) {
    const item = { name: p.name || p.barcode, barcode: p.barcode, level: levelOf(p) };
    (byCat.get(p.category)?.products || loose).push(item);
  }
  const out = [...byCat.values()].filter((a) => a.products.length);
  for (let i = 0; i < loose.length; i += 18) {
    const n = out.length;
    out.push({ id: `shelf-${n}`, name: `${t('floor3dShelfN')} ${n + 1}`, color: PALETTE[n % PALETTE.length], sen: 0, products: loose.slice(i, i + 18) });
  }
  return out.slice(0, 12);
}

export function render(main) {
  // The settings may arrive after the page is drawn: the layout follows them.
  let fnb = layoutFor(session.settings) === 'fnb';
  const lead = h('p', { class: 'muted' }, t(fnb ? 'floor3dLeadFnb' : 'floor3dLeadShop'));
  const stage = h('div', { class: 'map-stage' }, h('p', { class: 'muted', style: { padding: '16px' } }, t('loading')));
  const info = h('div', { class: 'map-info', 'data-card': 'info' }, h('p', { class: 'muted', style: { margin: 0 } }, t('floor3dTap')));
  const panelBody = h('div', { class: 'fl-panel-body' });
  const panel = h('aside', { class: 'card fl-panel' }, info, panelBody);
  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('floor3d')), h('span', { class: 'grow' }), h('span', { class: 'muted' }, session.branchName())),
    lead, h('div', { class: 'fl-layout' }, stage, panel));

  let sales = [];
  let orders = [];
  let levels = null;
  let scene = null;
  const draw = () => {
    const nowFnb = layoutFor(session.settings) === 'fnb';
    if (nowFnb !== fnb) { fnb = nowFnb; scene = null; lead.textContent = t(fnb ? 'floor3dLeadFnb' : 'floor3dLeadShop'); }
    const takings = sales.reduce((s, x) => s + (x.totalSen || 0), 0);
    // Tills by name, as the receipts say.
    const tills = new Map();
    for (const s of sales) {
      const name = s.tillName || t('floor3dTill');
      const x = tills.get(name) || { name, sen: 0, receipts: 0 };
      x.sen += s.totalSen || 0;
      x.receipts += 1;
      tills.set(name, x);
    }
    // What sold today, by product and by category.
    const sold = new Map();
    const catSen = new Map();
    for (const s of sales) {
      for (const l of s.lines || []) {
        const x = sold.get(l.name) || { name: l.name, sen: 0, qtyMilli: 0 };
        x.sen += l.lineTotalSen || 0;
        x.qtyMilli += l.qtyMilli || 0;
        sold.set(l.name, x);
        const cat = l.categoryId || session.find(l.barcode)?.category || '';
        catSen.set(cat, (catSen.get(cat) || 0) + (l.lineTotalSen || 0));
      }
    }
    const best = [...sold.values()].sort((a, b) => b.sen - a.sen).slice(0, 5);
    const levelOf = (p) => {
      const l = levels?.get(p.barcode);
      if (!l || p.trackStock === false) return 'ok';
      if (l.onHand <= 0 && (l.counted != null || l.inSince || l.outSince)) return 'out';
      return isLow(l) ? 'low' : 'ok';
    };
    const aisles = fnb ? [] : aislesFor(session.products, levelOf).map((a) => ({ ...a, sen: catSen.get(a.id) || 0 }));
    const tables = (session.settings.tables || []).map((name) => {
      const order = orders.find((o) => o.table === name) || null;
      const state = tableState(order);
      return { name, order, state, guests: order?.guests || order?.pax || 2, label: order ? `${name} · ${rm(billTotal(order))}` : name };
    });
    const cookingOrders = orders.filter((o) => (o.lines || []).some((l) => l.sent));
    const takeaway = orders.filter((o) => !o.table).length;
    const halfHour = Date.now() - 30 * 60_000;
    const shoppers = sales.filter((s) => (s.createdAt || 0) >= halfHour).length;
    const layout = shopLayout({
      fnb, aisles, tables, tills: [...tills.values()], shoppers, cooking: cookingOrders.length, takeaway,
      labels: { kitchen: t('floor3dKitchen'), entrance: t('floor3dEntrance') },
    });
    const night = night3d();
    if (!scene) {
      scene = scene3d({
        boxes: layout.boxes, W: layout.W, D: layout.D, height: 820, fillHeight: true,
        floorColor: fnb ? (night ? '#3a2f25' : '#eadbc4') : null, onPick: (b) => { scene.select(b.id); show(b); },
      });
      mount(stage, scene.el, scene.off ? null : h('div', { class: 'map-legend' },
        fnb ? ['free', 'ordering', 'eating'].map((k) => h('span', {}, h('i', { style: { background: TABLE_COLOR[k] } }), t(`floor3d_${k}`)))
          : [h('span', {}, h('i', { style: { background: '#4fa3d9' } }), t('floor3dStockOk')), h('span', {}, h('i', { style: { background: STOCK_COLOR.low } }), t('floor3dStockLow')),
            h('span', {}, h('i', { style: { background: 'transparent', border: '1px dashed currentColor' } }), t('floor3dStockOut'))],
        h('span', {}, h('i', { style: { background: '#14a37f' } }), t('floor3dTillKey'))));
    } else scene.draw(layout.boxes, layout.W, layout.D);

    // The panel: today's figures, then best sellers and what runs out / the kitchen queue.
    const busy = tables.filter((x) => x.order).length;
    const stat = (label, value, tone = '') => h('div', { class: `card stat${tone ? ` ${tone}` : ''}` }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value));
    const runningOut = fnb ? [] : aisles.flatMap((a) => a.products.filter((p) => p.level !== 'ok').map((p) => ({ ...p, aisle: a.name }))).slice(0, 6);
    mount(panelBody,
      h('div', { class: 'cards map-kpis', 'data-card': 'kpis' },
        stat(t('floor3dSales'), rm(takings)),
        stat(t('floor3dReceipts'), String(sales.length)),
        stat(t('floor3dAvg'), rm(sales.length ? Math.round(takings / sales.length) : 0)),
        fnb ? stat(t('floor3dBusy'), `${busy}/${tables.length}`, busy ? 'warn' : '') : stat(t('floor3dShoppers'), String(shoppers))),
      h('section', { 'data-card': 'best' }, h('h3', {}, t('floor3dBest')),
        best.length ? best.map((x, i) => h('div', { class: 'fl-row' }, h('span', { class: 'fl-rank' }, String(i + 1)), h('span', { class: 'grow' }, x.name), h('span', { class: 'muted' }, formatQty(x.qtyMilli)), h('b', {}, rm(x.sen))))
          : h('p', { class: 'muted', style: { margin: 0 } }, t('floor3dNothingYet'))),
      fnb
        ? h('section', { 'data-card': 'kitchen' }, h('h3', {}, `${t('floor3dKitchenQ')} · ${cookingOrders.length}`),
          cookingOrders.length ? cookingOrders.map((o) => h('div', { class: 'fl-row' }, h('b', {}, o.table || t('floor3dTakeaway')),
            h('span', { class: 'grow muted' }, (o.lines || []).filter((l) => l.sent).slice(0, 3).map((l) => l.name).join(', ')),
            h('span', { class: 'muted' }, t('floor3dMin').replace('{n}', Math.max(0, Math.round((Date.now() - (o.openedAt || o.createdAt || o.updatedAt || Date.now())) / 60000))))))
            : h('p', { class: 'muted', style: { margin: 0 } }, t('floor3dNoQueue')))
        : h('section', { 'data-card': 'running-out' }, h('h3', {}, t('floor3dLowList')),
          !aisles.length ? h('p', { class: 'muted', style: { margin: 0 } }, t('floor3dNoProducts'))
            : runningOut.length ? runningOut.map((p) => h('div', { class: 'fl-row' }, h('i', { class: 'fl-dot', style: { background: p.level === 'out' ? STOCK_COLOR.out : STOCK_COLOR.low } }),
              h('span', { class: 'grow' }, p.name), h('span', { class: 'muted' }, p.aisle)))
              : h('p', { class: 'muted', style: { margin: 0 } }, t('floor3dAllStocked'))));
  };

  const show = (b) => {
    if (b.table) {
      const o = b.table.order;
      mount(info, h('h3', {}, `${t('table')} ${b.table.name} · ${t(`floor3d_${b.table.state}`)}`), o
        ? [h('div', { class: 'city-figs' },
          h('span', {}, t('floor3dBill'), h('b', {}, rm(billTotal(o)))),
          h('span', {}, t('floor3dLines'), h('b', {}, String((o.lines || []).length))),
          h('span', {}, t('floor3dSince'), h('b', {}, timeOfDay(o.openedAt || o.createdAt || o.updatedAt)))),
        h('div', { class: 'muted' }, (o.lines || []).slice(0, 6).map((l) => `${formatQty(l.qtyMilli)} × ${l.name}`).join(' · '))]
        : h('p', { class: 'muted', style: { margin: 0 } }, t('floor3dFree')));
    } else if (b.aisle) {
      const a = b.aisle;
      mount(info, h('h3', {}, a.name), h('div', { class: 'city-figs' },
        h('span', {}, t('floor3dSales'), h('b', {}, rm(a.sen))), h('span', {}, t('floor3dProducts'), h('b', {}, String(a.products.length)))),
      h('div', { class: 'muted' }, a.products.slice(0, 8).map((p) => `${p.name}${p.level === 'out' ? ' ✕' : p.level === 'low' ? ' !' : ''}`).join(' · ')));
    } else if (b.till) {
      mount(info, h('h3', {}, b.till.name), h('div', { class: 'city-figs' },
        h('span', {}, t('floor3dSales'), h('b', {}, rm(b.till.sen))), h('span', {}, t('floor3dReceipts'), h('b', {}, String(b.till.receipts)))));
    }
  };

  const readSales = () => todaysSales().then((list) => { sales = list; draw(); }).catch(() => draw());
  const readStock = () => loadStockData().then((data) => { levels = new Map(levelsFor(data, session.branchId || '').map((l) => [l.key, l])); draw(); }).catch(() => {});
  readSales();
  if (!fnb) readStock();
  const col = collection(db, ws('orders'));
  const stop = onSnapshot(session.branchIds.length ? query(col, where('branchId', '==', session.branchId)) : col, (snap) => {
    orders = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((o) => (o.branchId || '') === (session.branchId || ''));
    draw();
  }, () => draw());
  const timer = setInterval(() => { if (document.hidden) return; readSales(); if (!fnb) readStock(); }, 60_000);
  let seen = JSON.stringify([session.settings.tables || [], session.products.length, session.categories.length]);
  const offSession = onChange(() => {
    const now = JSON.stringify([session.settings.tables || [], session.products.length, session.categories.length]);
    if ((layoutFor(session.settings) === 'fnb') !== fnb || now !== seen) { seen = now; draw(); }
  });
  return () => { stop(); offSession(); clearInterval(timer); };
}
