/**
 * The shop floor in 3D (POS 店面 3D), live for the branch this till is at:
 * a restaurant's tables (amber while a bill is open on them), or a shop's
 * shelves by category (as tall as what each sold today), and the tills at
 * the front as tall as their takings. Tap one for its figures. It only
 * reads -- the bills, the sales -- and changes nothing.
 */
import { collection, db, getDocs, onSnapshot, orderBy, query, where } from './fb.js';
import { dateTime, h, mount, timeOfDay } from './dom.js';
import { t } from './i18n.js';
import { formatQty, rm } from './money.js';
import { onChange, session, ws } from './session.js';
import { isoScene } from './iso.js';
import { shopLayout } from './town.js';
import { layoutFor } from './modes.js';
import { totalsFor } from './register.js';
import { menuButton } from './main.js';

const inList = () => [...session.branchIds, ''].slice(0, 30);

async function todaysSales() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const col = collection(db, ws('sales'));
  const range = [where('createdAt', '>=', start.getTime()), orderBy('createdAt', 'desc')];
  const q = session.branchIds.length ? query(col, where('branchId', 'in', inList()), ...range) : query(col, ...range);
  return (await getDocs(q)).docs.map((d) => d.data()).filter((s) => (s.branchId || '') === (session.branchId || '') && s.status !== 'VOIDED');
}

const billTotal = (o) => totalsFor({ lines: [], discountIds: [], ...o, discountIds: o.discountIds || [] }).totalSen;

export function render(main) {
  // The settings may arrive after the page is drawn: the layout follows them.
  let fnb = layoutFor(session.settings) === 'fnb';
  const lead = h('p', { class: 'muted' }, t(fnb ? 'floor3dLeadFnb' : 'floor3dLeadShop'));
  const stage = h('div', { class: 'map-stage' }, h('p', { class: 'muted', style: { padding: '16px' } }, t('loading')));
  const info = h('div', { class: 'card map-info' }, h('p', { class: 'muted', style: { margin: 0 } }, t('floor3dTap')));
  const kpis = h('div', { class: 'cards map-kpis' });
  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('floor3d')), h('span', { class: 'grow' }), h('span', { class: 'muted' }, session.branchName())),
    lead, kpis, stage, info);

  let sales = [];
  let orders = [];
  let scene = null;
  const draw = () => {
    const nowFnb = layoutFor(session.settings) === 'fnb';
    if (nowFnb !== fnb) { fnb = nowFnb; scene = null; lead.textContent = t(fnb ? 'floor3dLeadFnb' : 'floor3dLeadShop'); }
    const done = sales;
    const takings = done.reduce((s, x) => s + (x.totalSen || 0), 0);
    // Tills by name, as the receipts say.
    const tills = new Map();
    for (const s of done) {
      const name = s.tillName || t('floor3dTill');
      const x = tills.get(name) || { name, sen: 0, receipts: 0 };
      x.sen += s.totalSen || 0;
      x.receipts += 1;
      tills.set(name, x);
    }
    // Categories by what their lines brought in.
    const cats = new Map(session.categories.map((c, i) => [c.id, { id: c.id, name: c.name, color: c.color, sen: 0, qtyMilli: 0, items: new Map(), i }]));
    const other = { id: '-', name: t('floor3dOther'), color: '#94a3b8', sen: 0, qtyMilli: 0, items: new Map() };
    for (const s of done) {
      for (const l of s.lines || []) {
        const c = cats.get(l.categoryId || session.find(l.barcode)?.category) || other;
        c.sen += l.lineTotalSen || 0;
        c.qtyMilli += l.qtyMilli || 0;
        c.items.set(l.name, (c.items.get(l.name) || 0) + (l.lineTotalSen || 0));
      }
    }
    const shelves = [...cats.values(), ...(other.sen ? [other] : [])];
    const tables = (session.settings.tables || []).map((name) => ({ name, order: orders.find((o) => o.table === name) || null }));
    const busy = tables.filter((x) => x.order).length;
    mount(kpis,
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('floor3dSales')), h('div', { class: 'value' }, rm(takings))),
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('floor3dReceipts')), h('div', { class: 'value' }, String(done.length))),
      fnb ? h('div', { class: `card stat${busy ? ' warn' : ''}` }, h('div', { class: 'label' }, t('floor3dBusy')), h('div', { class: 'value' }, `${busy}/${tables.length}`))
        : h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('floor3dShelves')), h('div', { class: 'value' }, String(shelves.length))),
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('floor3dOpenBills')), h('div', { class: 'value' }, String(orders.length))));
    const layout = shopLayout({ fnb, tables, shelves, tills: [...tills.values()] });
    const boxes = layout.boxes.map((b) => (b.kitchen ? { ...b, label: t('floor3dKitchen') }
      : b.table?.order ? { ...b, label: `${b.label} · ${rm(billTotal(b.table.order))}` } : b));
    if (!scene) {
      scene = isoScene({ boxes, W: layout.W, D: layout.D, height: 680, floorColor: fnb ? '#eadbc4' : null, onPick: (b) => { scene.select(b.id); show(b); } });
      mount(stage, scene.el, h('div', { class: 'map-legend' },
        fnb ? [h('span', {}, h('i', { style: { background: '#f59e0b' } }), t('floor3dBusyKey')), h('span', {}, h('i', { style: { background: '#9ccfb8' } }), t('floor3dFreeKey'))]
          : h('span', {}, t('floor3dShelfKey')),
        h('span', {}, h('i', { style: { background: '#14a37f' } }), t('floor3dTillKey'))));
    } else scene.draw(boxes, layout.W, layout.D);
  };

  const show = (b) => {
    if (b.table) {
      const o = b.table.order;
      mount(info, h('h3', {}, `${t('table')} ${b.table.name}`), o
        ? [h('div', { class: 'city-figs' },
          h('span', {}, t('floor3dBill'), h('b', {}, rm(billTotal(o)))),
          h('span', {}, t('floor3dLines'), h('b', {}, String((o.lines || []).length))),
          h('span', {}, t('floor3dSince'), h('b', {}, timeOfDay(o.openedAt || o.createdAt || o.updatedAt)))),
        h('div', { class: 'muted' }, (o.lines || []).slice(0, 6).map((l) => `${formatQty(l.qtyMilli)} × ${l.name}`).join(' · '))]
        : h('p', { class: 'muted', style: { margin: 0 } }, t('floor3dFree')));
    } else if (b.shelf) {
      const s = b.shelf;
      const top = [...(s.items || new Map())].sort((a, c) => c[1] - a[1]).slice(0, 3);
      mount(info, h('h3', {}, s.name), h('div', { class: 'city-figs' },
        h('span', {}, t('floor3dSales'), h('b', {}, rm(s.sen))), h('span', {}, t('floor3dQty'), h('b', {}, formatQty(s.qtyMilli || 0)))),
      top.length ? h('div', { class: 'muted' }, top.map(([n, sen]) => `${n} ${rm(sen)}`).join(' · ')) : null);
    } else if (b.till) {
      mount(info, h('h3', {}, b.till.name), h('div', { class: 'city-figs' },
        h('span', {}, t('floor3dSales'), h('b', {}, rm(b.till.sen))), h('span', {}, t('floor3dReceipts'), h('b', {}, String(b.till.receipts)))),
      h('div', { class: 'muted' }, dateTime(Date.now())));
    }
  };

  todaysSales().then((list) => { sales = list; draw(); }).catch(() => draw());
  const col = collection(db, ws('orders'));
  const stop = onSnapshot(session.branchIds.length ? query(col, where('branchId', '==', session.branchId)) : col, (snap) => {
    orders = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((o) => (o.branchId || '') === (session.branchId || ''));
    draw();
  }, () => draw());
  let tables = JSON.stringify(session.settings.tables || []);
  const offSession = onChange(() => {
    const now = JSON.stringify(session.settings.tables || []);
    if ((layoutFor(session.settings) === 'fnb') !== fnb || now !== tables) { tables = now; draw(); }
  });
  return () => { stop(); offSession(); };
}
