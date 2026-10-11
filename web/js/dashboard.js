/**
 * SuXin Every Data: the owner's first look at the business. What it shows follows
 * the company's modules (modules.js) and the person's permissions -- a shop
 * with only the POS sees today's sales and stock; add SuXin WMS and the
 * orders to receive and goods on the way appear; a module that is not on
 * shows nothing here (and is offered under Settings -> Add more instead).
 *
 * Read-only: every figure comes from the same documents as the reports, the
 * stock levels and the warehouse, so it can never disagree with them.
 */
import { collection, db, getDocs, limit, orderBy, query, where } from './fb.js';
import { h, mount, timeOfDay } from './dom.js';
import { getLang, paymentLabel, t } from './i18n.js';
import { formatQty, rm } from './money.js';
import { session, ws } from './session.js';
import { isLow } from './ledger.js';
import { levelsFor, loadStockData } from './stockdata.js';
import { MODULES } from './modules.js';
import { icon } from './icons.js';
import { cityCard } from './city3d.js';

const inList = () => [...session.branchIds, ''].slice(0, 30);
const done = (list) => list.filter((s) => s.status !== 'VOIDED');

/** Which parts of the page this person sees -- module on AND permission held. */
export function widgetsFor(who) {
  return {
    sales: who.may('pos.reports'),
    stock: who.has('count') || who.has('pos') ? who.can('RECORD_STOCK_MOVEMENTS') || who.can('POS_MANAGE') || who.can('POS_REPORTS') : false,
    warehouse: who.may('warehouse.view') && (who.can('RECORD_STOCK_MOVEMENTS') || who.can('WH_PURCHASE') || who.can('WH_APPROVE') || who.can('POS_MANAGE')),
  };
}

/** Today's sales and yesterday's, newest first, in one read. */
async function recentSales() {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 1);
  const col = collection(db, ws('sales'));
  const range = [where('createdAt', '>=', start.getTime()), orderBy('createdAt', 'desc')];
  const q = session.branchIds.length ? query(col, where('branchId', 'in', inList()), ...range) : query(col, ...range);
  return (await getDocs(q)).docs.map((d) => ({ ...d.data(), id: d.id }));
}

/**
 * The day in figures, from the sales of today and yesterday: totals, how it
 * compares with yesterday up to the same time, sales per hour, how people
 * paid and what sold best. Pure, so it can be tested.
 */
export function daySummary(all, now = Date.now()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const y0 = t0 - 86400000;
  const isToday = (s) => s.createdAt >= t0;
  const todayAll = all.filter(isToday);
  const ok = done(todayAll);
  // Yesterday up to this time of day, so a morning is never set against a whole day.
  const ySame = done(all.filter((s) => s.createdAt >= y0 && s.createdAt < t0 && s.createdAt <= now - 86400000));
  const yAll = done(all.filter((s) => s.createdAt >= y0 && s.createdAt < t0));
  const sum = (list) => list.reduce((x, s) => x + (s.totalSen || 0), 0);
  const hours = Array.from({ length: 24 }, () => ({ today: 0, yesterday: 0 }));
  for (const s of ok) hours[new Date(s.createdAt).getHours()].today += s.totalSen || 0;
  for (const s of yAll) hours[new Date(s.createdAt).getHours()].yesterday += s.totalSen || 0;
  const methods = new Map();
  for (const s of ok) {
    // Change goes back in cash, so what a method brought in is capped by the bill.
    let left = s.totalSen || 0;
    for (const p of s.payments || []) {
      const take = Math.min(left, p.amountSen || 0);
      left -= take;
      if (take > 0) methods.set(p.method, (methods.get(p.method) || 0) + take);
    }
  }
  const items = new Map();
  for (const s of ok) {
    for (const l of s.lines || []) {
      const key = l.barcode || l.name;
      const it = items.get(key) || { name: l.name || key, qtyMilli: 0, sen: 0 };
      it.qtyMilli += l.qtyMilli || 0;
      it.sen += l.lineTotalSen || 0;
      items.set(key, it);
    }
  }
  return {
    salesSen: sum(ok),
    receipts: ok.length,
    voided: todayAll.length - ok.length,
    sameTimeYesterday: { salesSen: sum(ySame), receipts: ySame.length },
    hours,
    methods: [...methods].map(([method, sen]) => ({ method, sen })).sort((a, b) => b.sen - a.sen),
    top: [...items.values()].sort((a, b) => b.sen - a.sen).slice(0, 5),
    recent: ok.slice(0, 8),
  };
}

async function warehouseWork() {
  const poCol = collection(db, ws('purchaseOrders'));
  const trCol = collection(db, ws('transfers'));
  const [pos, transfers] = await Promise.all([
    getDocs(session.branchIds.length ? query(poCol, where('branchId', 'in', inList())) : poCol).then((s) => s.docs.map((d) => d.data())).catch(() => []),
    getDocs(session.branchIds.length ? query(trCol, where('toBranch', 'in', inList())) : query(trCol, where('status', '==', 'SENT'))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
  ]);
  return {
    toReceive: pos.filter((p) => ['ORDERED', 'PARTIAL'].includes(p.status)),
    toApprove: pos.filter((p) => p.status === 'SUBMITTED'),
    inTransit: transfers.filter((tr) => tr.status === 'SENT'),
  };
}

const stat = (ic, label, value, { tone = '', href = '', sub = null } = {}) => h(href ? 'a' : 'div',
  { class: `card stat kpi${tone ? ` ${tone}` : ''}`, ...(href ? { href } : {}) },
  h('div', { class: 'kpi-top' }, h('span', { class: 'kpi-ic' }, icon(ic, 18)), h('span', { class: 'label' }, label)),
  h('div', { class: 'value' }, value),
  sub);

/** "▲ 12% vs this time yesterday", or the plain figure when yesterday had none. */
function trend(now, before, show = (x) => String(x)) {
  if (!before) return h('div', { class: 'kpi-sub muted' }, `${t('dashYesterdaySame')}: ${show(before)}`);
  const pct = Math.round(((now - before) / before) * 100);
  const tone = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
  return h('div', { class: `kpi-sub ${tone}`, 'data-trend': tone || 'flat' },
    h('b', {}, `${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct)}%`), ' ', h('span', { class: 'muted' }, t('dashVsYesterday')));
}

const section = (title, more, ...body) => h('section', { class: 'dash-part' },
  h('div', { class: 'dash-head' }, h('h2', {}, title), h('span', { class: 'grow' }), more), ...body);

const pending = () => h('div', { class: 'cards' }, [0, 1, 2, 3].map(() => h('div', { class: 'card stat kpi skeleton' }, h('div', { class: 'label' }, t('loading')))));
const failed = (err) => h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`);

/** Sales per hour as bars: today in colour, yesterday faint behind it. */
function hourChart(hours, nowHour) {
  const used = hours.map((x, i) => (x.today || x.yesterday ? i : -1)).filter((i) => i >= 0);
  const from = Math.min(8, ...used, nowHour);
  const to = Math.max(21, ...used, nowHour);
  const span = hours.slice(from, to + 1);
  const top = Math.max(1, ...span.map((x) => Math.max(x.today, x.yesterday)));
  const pct = (sen) => `${Math.round((sen / top) * 100)}%`;
  const peak = hours.map((x, hr) => ({ ...x, hr })).filter((x) => x.today > 0).sort((a, b) => b.today - a.today)[0];
  return h('div', { class: 'card dash-chart' },
    h('div', { class: 'dash-card-head' }, h('h3', {}, t('dashByHour')),
      h('span', { class: 'legend' }, h('i', { class: 'sw today' }), t('dashToday'), h('i', { class: 'sw yday' }), t('dashYesterday'))),
    peak ? h('div', { class: 'dash-peak muted' }, `${t('dashPeak')}: ${String(peak.hr).padStart(2, '0')}:00–${String(peak.hr + 1).padStart(2, '0')}:00 · ${rm(peak.today)}`) : null,
    h('div', { class: 'bars', role: 'img', 'aria-label': t('dashByHour') }, span.map((x, i) => {
      const hr = from + i;
      return h('div', { class: `bar${hr === nowHour ? ' now' : ''}`, title: `${String(hr).padStart(2, '0')}:00  ${rm(x.today)}` },
        h('div', { class: 'col' },
          h('span', { class: 'y', style: { height: pct(x.yesterday) } }),
          h('span', { class: 't', style: { height: pct(x.today) } })),
        h('span', { class: 'hr' }, hr % 3 === 0 ? String(hr).padStart(2, '0') : ''));
    })));
}

/** A label with a bar under it, for "how people paid" and "best sellers". */
const meter = (label, value, share, extra = '') => h('div', { class: 'meter' },
  h('div', { class: 'meter-row' }, h('span', { class: 'meter-label' }, label, extra ? h('span', { class: 'muted' }, ` · ${extra}`) : null), h('b', {}, value)),
  h('div', { class: 'meter-track' }, h('span', { style: { width: `${Math.max(2, Math.round(share * 100))}%` } })));

/** What connected systems bring in (connections.js): { sales, stock, ... }. */
async function connectedKinds() {
  const snap = await getDocs(collection(db, ws('connections')));
  const kinds = {};
  for (const d of snap.docs) if (d.data().on !== false) for (const f of d.data().feeds || []) if (f.on) kinds[f.kind] = true;
  return kinds;
}

export function render(main, connected = null) {
  const show = widgetsFor(session);
  // Without SuXin POS, sales and stock from a connected system still show, to whoever may see the figures.
  const mayFigures = session.isAdmin || session.can('POS_REPORTS');
  if (connected?.sales && mayFigures) show.sales = true;
  if ((connected?.stock || connected?.sales) && mayFigures) show.stock = true;
  if (!connected && (!show.sales || !show.stock) && mayFigures) {
    connectedKinds().then((k) => { if (k.sales || k.stock) render(main, k); }).catch(() => {});
  }
  const salesBox = h('div', {}, pending());
  const stockBox = h('div', {}, pending());
  const whBox = h('div', {}, pending());
  const cityBox = h('div', {});
  // Each read once: the figures below and the 3D town above share them.
  const salesP = show.sales ? recentSales() : null;
  const stockP = show.stock ? loadStockData() : null;
  const whP = show.warehouse ? warehouseWork() : null;
  const now = new Date();
  const greet = now.getHours() < 12 ? 'dashMorning' : now.getHours() < 18 ? 'dashAfternoon' : 'dashEvening';
  const lang = getLang();
  const dateText = now.toLocaleDateString(lang === 'zh' ? 'zh-CN' : lang === 'ms' ? 'ms-MY' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  mount(main,
    h('div', { class: 'dash-hello' },
      h('div', { class: 'muted' }, `${t(greet)}${session.name ? `, ${session.name}` : ''} · ${dateText}`),
      h('h1', {}, session.companyName || 'SuXin Every Data'),
      h('p', { class: 'muted' }, t('dashLead'))),
    cityBox,
    show.sales ? section(t('dashToday'), h('a', { class: 'dash-link', href: '/pos/#/reports/summary' }, `${t('repSummary')} →`), salesBox) : null,
    show.stock ? section(t('dashStock'), h('a', { class: 'dash-link', href: '/pos/#/inventory/levels' }, `${t('invLevels')} →`), stockBox) : null,
    show.warehouse ? section(MODULES.warehouse.displayName.en, h('a', { class: 'dash-link', href: '/warehouse/' }, `${t('whApp')} →`), whBox) : null,
    addMore());

  if (show.sales) {
    salesP.then((all) => {
      const d = daySummary(all, now.getTime());
      const y = d.sameTimeYesterday;
      const avg = d.receipts ? Math.round(d.salesSen / d.receipts) : 0;
      const yAvg = y.receipts ? Math.round(y.salesSen / y.receipts) : 0;
      const paid = d.methods.reduce((x, m) => x + m.sen, 0) || 1;
      const topSen = d.top[0]?.sen || 1;
      mount(salesBox,
        h('div', { class: 'cards' },
          stat('chart', t('dashSales'), rm(d.salesSen), { href: '/pos/#/reports/summary', tone: 'lead', sub: trend(d.salesSen, y.salesSen, rm) }),
          stat('receipt', t('dashReceipts'), String(d.receipts), { href: '/pos/#/reports/receipts', sub: trend(d.receipts, y.receipts) }),
          stat('calc', t('dashAverage'), d.receipts ? rm(avg) : '—', { sub: d.receipts && yAvg ? trend(avg, yAvg, rm) : null }),
          stat('trash', t('dashVoided'), String(d.voided), { tone: d.voided ? 'warn' : '' })),
        h('div', { class: 'dash-grid' },
          hourChart(d.hours, now.getHours()),
          h('div', { class: 'card dash-side' },
            h('h3', {}, t('dashPayTypes')),
            d.methods.length
              ? d.methods.map((m) => meter(paymentLabel(m.method), rm(m.sen), m.sen / paid, `${Math.round((m.sen / paid) * 100)}%`))
              : h('p', { class: 'muted' }, t('dashNoSales')),
            h('h3', {}, t('dashTopItems')),
            d.top.length
              ? d.top.map((it) => meter(it.name, rm(it.sen), it.sen / topSen, `×${formatQty(it.qtyMilli)}`))
              : h('p', { class: 'muted' }, '—'))),
        h('div', { class: 'card dash-receipts' },
          h('div', { class: 'dash-card-head' }, h('h3', {}, t('dashRecent')), h('a', { class: 'dash-link', href: '/pos/#/reports/receipts' }, `${t('dashAll')} →`)),
          d.recent.length
            ? h('div', { class: 'rc-list' }, d.recent.map((s) => h('div', { class: 'rc-row' },
              h('span', { class: 'rc-time' }, timeOfDay(s.createdAt)),
              h('span', { class: 'rc-main' }, h('b', {}, s.receiptNo || ''), h('span', { class: 'muted' }, [s.cashierName, s.tillName, s.table ? `${t('table')} ${s.table}` : ''].filter(Boolean).join(' · '))),
              h('span', { class: 'rc-pay' }, [...new Set((s.payments || []).map((p) => p.method))].map((m) => h('span', { class: 'chip' }, paymentLabel(m)))),
              h('b', { class: 'rc-total' }, rm(s.totalSen || 0)))))
            : h('div', { class: 'dash-empty' }, icon('receipt', 28), h('p', { class: 'muted' }, t('dashNoSales')))));
    }).catch((err) => mount(salesBox, failed(err)));
  }

  if (show.stock) {
    stockP.then((data) => {
      const catalogue = new Map(session.products.map((p) => [p.barcode, p]));
      const levels = levelsFor(data, 'ALL', catalogue);
      const low = levels.filter(isLow);
      const out = levels.filter((l) => l.onHand <= 0 && (l.counted != null || l.inSince || l.outSince));
      const value = levels.reduce((s, l) => s + Math.round(Math.max(0, l.onHand) * (catalogue.get(l.key)?.costSen || 0) / 1000), 0);
      mount(stockBox,
        h('div', { class: 'cards' },
          stat('box', t('dashItems'), String(levels.length), { href: '/pos/#/inventory/levels' }),
          stat('wallet', t('dashStockValue'), rm(value)),
          stat('alert', t('dashLow'), String(low.length), { tone: low.length ? 'warn' : '' }),
          stat('times', t('dashOut'), String(out.length), { tone: out.length ? 'bad' : '' })),
        low.length ? h('div', { class: 'card' },
          h('div', { class: 'dash-card-head' }, h('h3', {}, t('dashLowList'))),
          h('div', { class: 'low-list' }, low.slice(0, 6).map((l) => {
            const share = l.reorderLevel > 0 ? Math.max(0, Math.min(1, l.onHand / l.reorderLevel)) : 0;
            return h('div', { class: `meter${l.onHand <= 0 ? ' bad' : ' warn'}` },
              h('div', { class: 'meter-row' }, h('span', { class: 'meter-label' }, l.name || l.key), h('b', {}, `${formatQty(l.onHand)} / ${formatQty(l.reorderLevel)}`)),
              h('div', { class: 'meter-track' }, h('span', { style: { width: `${Math.max(2, Math.round(share * 100))}%` } })));
          }))) : null);
    }).catch((err) => mount(stockBox, failed(err)));
  }

  if (show.warehouse) {
    whP.then((w) => {
      mount(whBox, h('div', { class: 'cards' },
        stat('basket', t('dashToReceive'), String(w.toReceive.length), { href: '/warehouse/#/receive', tone: w.toReceive.length ? 'warn' : '' }),
        stat('truck', t('dashInTransit'), String(w.inTransit.length), { href: '/warehouse/#/transfers' }),
        session.can('WH_APPROVE') ? stat('check', t('dashToApprove'), String(w.toApprove.length), { href: '/warehouse/#/purchase', tone: w.toApprove.length ? 'warn' : '' }) : null));
    }).catch((err) => mount(whBox, failed(err)));
  }
  if (show.sales || show.stock) town(cityBox, salesP, stockP, whP, now.getTime());
  return null;
}

/**
 * The company as a little 3D town (city3d.js): every place this person
 * sees, as tall as today's takings or the stock in it.
 */
async function town(box, salesP, stockP, whP, now) {
  const [sales, stock, wh] = (await Promise.allSettled([salesP, stockP, whP])).map((r) => (r.status === 'fulfilled' ? r.value : null));
  const all = [{ id: '', name: t('mainShop'), kind: 'STORE' }, ...session.branches.filter((b) => b.active !== false)
    .map((b) => ({ id: b.id, name: b.name, kind: b.kind === 'WAREHOUSE' ? 'WAREHOUSE' : 'STORE' }))]
    .filter((p) => !session.branchIds.length || session.branchIds.includes(p.id));
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const catalogue = new Map(session.products.map((p) => [p.barcode, p]));
  const places = all.map((p) => {
    const mine = sales ? done(sales.filter((x) => x.createdAt >= start.getTime() && (x.branchId || '') === p.id)) : null;
    const levels = stock ? levelsFor(stock, p.id, catalogue) : null;
    return {
      ...p,
      salesSen: mine ? mine.reduce((x, s) => x + (s.totalSen || 0), 0) : null,
      receipts: mine ? mine.length : null,
      valueSen: levels ? levels.reduce((x, l) => x + Math.round(Math.max(0, l.onHand) * (catalogue.get(l.key)?.costSen || 0) / 1000), 0) : null,
      low: levels ? levels.filter(isLow).length : null,
    };
  });
  const name = (id) => all.find((p) => p.id === (id || ''))?.name || id;
  const moving = (wh?.inTransit || []).map((tr) => ({ from: tr.fromBranch || '', to: tr.toBranch || '', ref: tr.transferNo, fromName: name(tr.fromBranch), toName: name(tr.toBranch) }));
  mount(box, cityCard(places, moving, { links: { shop: session.may('pos.reports') ? '/pos/#/reports/summary' : '', warehouse: session.has('warehouse') ? '/warehouse/#/map' : '' } }));
}

/** The modules on sale that this company does not have yet, as one quiet line. */
function addMore() {
  const off = ['count', 'pos', 'warehouse', 'api'].filter((id) => MODULES[id].status === 'live' && !session.has(id));
  if (!off.length) return null;
  const lang = getLang();
  return h('a', { class: 'card dash-more', href: '/pos/#/settings/addons' },
    h('b', {}, t('dashGrow')), ' ',
    h('span', { class: 'muted' }, off.map((id) => (MODULES[id].displayName[lang] || MODULES[id].displayName.en)).join(' · ')), ' →');
}
