/**
 * The books at a glance: money in the bank and the till, who owes us and
 * whom we owe (and how much of it is late), this month's sales and profit,
 * the late invoices, and what is still missing before the first e-invoice.
 */
import { h, mount } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { aging, balanceOf, profitAndLoss, sums } from '../js/books.js';
import { accounts, books, canPost, company, dayMs, monthStart, ymd } from './data.js';
import { head, money, moneyAccount, rmText, table } from './common.js';
import { menu3d, scene3d } from '../js/view3d.js';
import { moneyLayout } from '../js/town.js';
import { go } from './main.js';

export function render(main) {
  const now = Date.now();
  const s = sums(books.journal);
  const cash = accounts().filter(moneyAccount).reduce((x, a) => x + balanceOf(a, s.get(a.code)), 0);
  const ar = aging(books.docs, books.payments, { now, sales: true });
  const ap = aging(books.docs, books.payments, { now, sales: false });
  const late = (rows) => rows.reduce((x, r) => x + r.totalSen - r.current, 0);
  const total = (rows) => rows.reduce((x, r) => x + r.totalSen, 0);
  const pl = profitAndLoss(books.journal, accounts(), { from: dayMs(monthStart()), to: now });
  const lateDocs = ar.flatMap((r) => r.docs.filter((d) => d.late > 0).map((d) => ({ ...d, name: r.name }))).sort((a, b) => b.late - a.late).slice(0, 8);
  const c = company();
  const todo = [
    !c.tin || !c.brn || !c.msic || !c.address ? ['sliders', 'bkTodoCompany', 'settings'] : null,
    !books.contacts.length ? ['users', 'bkTodoContacts', 'contacts'] : null,
    !books.journal.some((e) => e.source === 'OPENING') ? ['book', 'bkTodoOpening', 'journal/new'] : null,
  ].filter(Boolean);
  const stat = (label, value, sub = '', tone = '', attr = '') => h('div', { class: `card stat ${tone}`, 'data-stat': attr },
    h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'sub muted' }, sub) : null);
  const tile = (ic, label, sub, to, act) => h('button', { class: 'wh-tile', 'data-act': act, onclick: () => go(...to.split(/\/(.*)/s)) },
    h('span', { class: 'ic-wrap' }, icon(ic, 24)), h('span', { class: 't' }, label), h('span', { class: 's' }, sub));

  mount(main,
    head(t('bkHome')),
    todo.length && canPost() ? h('section', { class: 'card bk-todo' }, h('h2', {}, t('bkGetStarted')),
      todo.map(([ic, key, to]) => h('a', { class: 'bk-todo-row', href: `#/${to}` }, icon(ic, 18), t(key)))) : null,
    h('div', { class: 'cards' },
      stat(t('bkCashBank'), rmText(cash), '', '', 'cash'),
      stat(t('bkOwedToUs'), rmText(total(ar)), late(ar) ? `${t('bkLate')} ${money(late(ar))}` : '', late(ar) ? 'warn' : '', 'ar'),
      stat(t('bkWeOweThem'), rmText(total(ap)), late(ap) ? `${t('bkLate')} ${money(late(ap))}` : '', late(ap) ? 'warn' : '', 'ap'),
      stat(t('bkMonthSales'), rmText(pl.incomeSen), ymd(dayMs(monthStart())).slice(0, 7), '', 'sales'),
      stat(t(pl.profitSen < 0 ? 'bkMonthLoss' : 'bkMonthProfit'), rmText(pl.profitSen), '', pl.profitSen < 0 ? 'bad' : '', 'profit')),
    towers([
      { id: 'cash', label: t('bkCashBank'), sen: cash, color: '#14a37f', to: ['payments'] },
      { id: 'ar', label: t('bkOwedToUs'), sen: total(ar), lateSen: late(ar), color: '#2f6fde', to: ['sales'] },
      { id: 'ap', label: t('bkWeOweThem'), sen: total(ap), lateSen: late(ap), color: '#8b5cf6', to: ['purchases'] },
      { id: 'sales', label: t('bkMonthSales'), sen: pl.incomeSen, color: '#0ea5e9', to: ['reports', 'pl'] },
      { id: 'costs', label: t('bk3dCosts'), sen: pl.cogsSen + pl.expenseSen, color: '#f59e0b', to: ['reports', 'pl'] },
      { id: 'profit', label: t(pl.profitSen < 0 ? 'bkMonthLoss' : 'bkMonthProfit'), sen: pl.profitSen, color: '#22a06b', to: ['reports', 'pl'] },
    ]),
    canPost() ? h('div', { class: 'wh-tiles' },
      tile('receipt', t('bkNewInvoice'), t('bkNewInvoiceSub'), 'sales/new/INVOICE', 'new-invoice'),
      tile('calc', t('bkReceive'), t('bkReceiveSub'), 'payments/in', 'receive'),
      tile('basket', t('bkNewBill'), t('bkNewBillSub'), 'purchases/new/BILL', 'new-bill'),
      tile('trash', t('bkExpense'), t('bkExpenseSub'), 'payments/expense', 'expense'),
      tile('percent', t('bkReports'), t('bkReportsSub'), 'reports/pl', 'reports')) : null,
    lateDocs.length ? h('section', { class: 'card' }, h('h2', {}, t('bkLateInvoices')),
      table([t('bkNo'), t('bkCustomer'), t('bkDaysLate'), t('bkOwed')],
        lateDocs.map((d) => [d.no, d.name, String(d.late), money(d.owe)]), { num: [2, 3], onRow: (i) => go('sales', lateDocs[i].id) })) : null);
  return null;
}

/** The figures above as towers in 3D (town.js); a tap says what one is and opens its page. */
function towers(figures) {
  // 3D turned off for this company: no card, but for the owner (to turn it back on).
  if (!menu3d()) return null;
  const info = h('div', { class: 'city-info' }, h('span', { class: 'muted' }, t('bk3dTap')));
  const { boxes, W, D } = moneyLayout(figures);
  const scene = scene3d({
    boxes: boxes.map((b) => (b.fig ? { ...b, title: `${b.fig.label}: ${rmText(b.fig.sen)}` } : b)), W, D, height: 560,
    onPick: (b) => {
      const f = b.fig;
      if (!f) return;
      scene.select(b.id);
      mount(info, h('div', {}, h('b', {}, f.label), ' ', h('span', {}, rmText(f.sen))),
        f.lateSen ? h('div', { class: 'muted' }, `${t('bkLate')} ${money(f.lateSen)}`) : null,
        h('a', { class: 'dash-link', href: `#/${f.to.join('/')}`, 'data-go': f.id }, `${t('bk3dOpen')} →`));
    },
  });
  return h('div', { class: 'card city-card', 'data-card': 'books3d' },
    h('div', { class: 'dash-card-head' }, h('h3', {}, t('bk3dTitle')), h('span', { class: 'muted' }, t('bk3dLead'))),
    scene.el,
    h('div', { class: 'map-legend' }, h('span', {}, h('i', { style: { background: '#e5484d' } }), t('bk3dLateKey'))),
    info);
}
