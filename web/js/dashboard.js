/**
 * SuXin Cloud: the owner's first look at the business. What it shows follows
 * the company's modules (modules.js) and the person's permissions -- a shop
 * with only the POS sees today's sales and stock; add SuXin Warehouse and the
 * orders to receive and goods on the way appear; a module that is not on
 * shows nothing here (and is offered under Settings -> Add more instead).
 *
 * Read-only: every figure comes from the same documents as the reports, the
 * stock levels and the warehouse, so it can never disagree with them.
 */
import { collection, db, getDocs, limit, orderBy, query, where } from './fb.js';
import { dateTime, h, mount } from './dom.js';
import { getLang, t } from './i18n.js';
import { formatQty, rm } from './money.js';
import { session, ws } from './session.js';
import { isLow } from './ledger.js';
import { levelsFor, loadStockData } from './stockdata.js';
import { MODULES } from './modules.js';
import { menuButton } from './main.js';

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

async function todaysSales() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const col = collection(db, ws('sales'));
  const range = [where('createdAt', '>=', start.getTime()), orderBy('createdAt', 'desc')];
  const q = session.branchIds.length ? query(col, where('branchId', 'in', inList()), ...range) : query(col, ...range);
  return (await getDocs(q)).docs.map((d) => ({ ...d.data(), id: d.id }));
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

const stat = (label, value, { tone = '', href = '' } = {}) => h(href ? 'a' : 'div',
  { class: `card stat${tone ? ` ${tone}` : ''}`, ...(href ? { href, style: { textDecoration: 'none', color: 'inherit' } } : {}) },
  h('div', { class: 'label' }, label), h('div', { class: 'value' }, value));

const section = (title, more, ...body) => h('section', { class: 'dash-part' },
  h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h2', { style: { margin: 0 } }, title), h('span', { class: 'grow' }), more), ...body);

const pending = () => h('p', { class: 'muted' }, t('loading'));
const failed = (err) => h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`);

export function render(main) {
  const show = widgetsFor(session);
  const salesBox = h('div', {}, pending());
  const stockBox = h('div', {}, pending());
  const whBox = h('div', {}, pending());

  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, 'SuXin Cloud'), h('span', { class: 'grow' }),
      h('span', { class: 'muted' }, session.companyName || '')),
    h('p', { class: 'muted', style: { marginTop: '-6px' } }, t('dashLead')),
    show.sales ? section(t('dashToday'), h('a', { href: '#/reports/summary' }, `${t('repSummary')} →`), salesBox) : null,
    show.stock ? section(t('dashStock'), h('a', { href: '#/inventory/levels' }, `${t('invLevels')} →`), stockBox) : null,
    show.warehouse ? section(MODULES.warehouse.displayName.en, h('a', { href: '/warehouse/' }, `${t('whApp')} →`), whBox) : null,
    addMore());

  if (show.sales) {
    todaysSales().then((all) => {
      const ok = done(all);
      const total = ok.reduce((s, x) => s + (x.totalSen || 0), 0);
      mount(salesBox,
        h('div', { class: 'cards' },
          stat(t('dashSales'), rm(total), { href: '#/reports/summary' }),
          stat(t('dashReceipts'), String(ok.length), { href: '#/reports/receipts' }),
          stat(t('dashAverage'), ok.length ? rm(Math.round(total / ok.length)) : '—'),
          stat(t('dashVoided'), String(all.length - ok.length), { tone: all.length > ok.length ? 'warn' : '' })),
        h('div', { class: 'card' },
          h('h3', { style: { margin: '0 0 8px' } }, t('dashRecent')),
          ok.length
            ? h('table', { class: 'list' }, h('tbody', {}, ok.slice(0, 6).map((s) => h('tr', {},
              h('td', { class: 'muted', style: { whiteSpace: 'nowrap' } }, dateTime(s.createdAt)),
              h('td', {}, s.receiptNo || ''),
              h('td', {}, s.cashierName || ''),
              h('td', { class: 'num' }, rm(s.totalSen || 0))))))
            : h('p', { class: 'muted', style: { margin: 0 } }, t('dashNoSales'))));
    }).catch((err) => mount(salesBox, failed(err)));
  }

  if (show.stock) {
    loadStockData().then((data) => {
      const catalogue = new Map(session.products.map((p) => [p.barcode, p]));
      const levels = levelsFor(data, 'ALL', catalogue);
      const low = levels.filter(isLow);
      const out = levels.filter((l) => l.onHand <= 0 && (l.counted != null || l.inSince || l.outSince));
      const value = levels.reduce((s, l) => s + Math.round(Math.max(0, l.onHand) * (catalogue.get(l.key)?.costSen || 0) / 1000), 0);
      mount(stockBox,
        h('div', { class: 'cards' },
          stat(t('dashItems'), String(levels.length), { href: '#/inventory/levels' }),
          stat(t('dashStockValue'), rm(value)),
          stat(t('dashLow'), String(low.length), { tone: low.length ? 'warn' : '' }),
          stat(t('dashOut'), String(out.length), { tone: out.length ? 'bad' : '' })),
        low.length ? h('div', { class: 'card' },
          h('h3', { style: { margin: '0 0 8px' } }, t('dashLowList')),
          h('table', { class: 'list' }, h('tbody', {}, low.slice(0, 6).map((l) => h('tr', {},
            h('td', {}, l.name || l.key),
            h('td', { class: 'num' }, `${formatQty(l.onHand)} / ${formatQty(l.reorderLevel)}`)))))) : null);
    }).catch((err) => mount(stockBox, failed(err)));
  }

  if (show.warehouse) {
    warehouseWork().then((w) => {
      mount(whBox, h('div', { class: 'cards' },
        stat(t('dashToReceive'), String(w.toReceive.length), { href: '/warehouse/#/receive', tone: w.toReceive.length ? 'warn' : '' }),
        stat(t('dashInTransit'), String(w.inTransit.length), { href: '/warehouse/#/transfers' }),
        session.can('WH_APPROVE') ? stat(t('dashToApprove'), String(w.toApprove.length), { href: '/warehouse/#/purchase', tone: w.toApprove.length ? 'warn' : '' }) : null));
    }).catch((err) => mount(whBox, failed(err)));
  }
  return null;
}

/** The modules on sale that this company does not have yet, as one quiet line. */
function addMore() {
  const off = ['count', 'pos', 'warehouse', 'api'].filter((id) => MODULES[id].status === 'live' && !session.has(id));
  if (!off.length) return null;
  const lang = getLang();
  return h('a', { class: 'card dash-more', href: '#/settings/addons' },
    h('b', {}, t('dashGrow')), ' ',
    h('span', { class: 'muted' }, off.map((id) => (MODULES[id].displayName[lang] || MODULES[id].displayName.en)).join(' · ')), ' →');
}
