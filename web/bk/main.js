/**
 * SuXin Books: the company's accounts -- e-invoices, bills, money in and
 * out, the journal and the reports -- for the shop itself or its
 * accountant. Same sign-in and company as the other SuXin apps; the plan
 * must include it (the 'accounting' module) and the person must hold
 * BOOKS_VIEW, BOOKS_POST or BOOKS_ADMIN (an admin always may).
 */
import { auth, signOut } from '../js/fb.js';
import { h, mount } from '../js/dom.js';
import { addStrings, getLang, LANGS, setLang, t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { onChange, session } from '../js/session.js';
import { STRINGS } from './strings.js';
import '../js/strings-pro.js';
import { appSwitcher, startApp } from '../js/apps.js';
import { guardTillLock } from '../js/tilllock.js';
import { books, canPost, canView, onBooks, ready, saveChart, stopBooks, watchBooks } from './data.js';
import { DEFAULT_ACCOUNTS } from '../js/books.js';

addStrings(STRINGS);
const app = document.getElementById('app');

const MENU = [
  { id: 'home', icon: 'chart', label: 'bkHome', page: () => import('./home.js'), bottom: true },
  { id: 'sales', icon: 'receipt', label: 'bkSales', page: () => import('./docs.js'), bottom: true },
  { id: 'purchases', icon: 'basket', label: 'bkPurchases', page: () => import('./docs.js') },
  { id: 'payments', icon: 'calc', label: 'bkPayments', page: () => import('./payments.js'), bottom: true },
  { id: 'contacts', icon: 'users', label: 'bkContacts', page: () => import('./contacts.js') },
  { id: 'reports', icon: 'percent', label: 'bkReports', page: () => import('./reports.js'), bottom: true },
  { id: 'journal', icon: 'book', label: 'bkJournal', page: () => import('./journal.js') },
  { id: 'accounts', icon: 'grid', label: 'bkAccounts', page: () => import('./accounts.js') },
  { id: 'settings', icon: 'sliders', label: 'bkSettings', page: () => import('./settings.js') },
];

function currentRoute() {
  const [group = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { group, sub: rest.join('/') };
}

function langPicker() {
  return h('select', { 'aria-label': 'Language', onchange: (e) => { setLang(e.target.value); location.reload(); } },
    LANGS.map(([code, name]) => h('option', { value: code, selected: code === getLang() }, name)));
}

let shell;
let mainEl;
let sideEl;
let bottomEl;
let stopPage = null;
let stopRedraw = null;

function renderShell() {
  if (guardTillLock()) return;
  sideEl = h('aside', { class: 'side' });
  mainEl = h('main', { class: 'main' });
  bottomEl = h('nav', { class: 'wh-bottom', 'aria-label': t('bkMenu') });
  shell = h('div', { class: 'shell wh bk' }, sideEl, mainEl, bottomEl,
    h('div', { class: 'scrim', onclick: () => shell.classList.remove('menu') }));
  mount(app, shell);
  if (session.has('accounting') && canView()) watchBooks();
  route();
}

function renderSide() {
  const { group } = currentRoute();
  mount(sideEl,
    h('div', { class: 'brand' }, h('img', { src: '/icons/bk-64.png', alt: '', width: 28, height: 28 }), 'SuXin Books'),
    h('div', { class: 'who' },
      h('div', { class: 'name' }, session.name),
      h('div', { class: 'sm' }, session.companyName || session.email)),
    h('nav', {}, MENU.map((item) => h('div', { class: 'group' },
      h('a', { class: `top${group === item.id ? ' current' : ''}`, href: `#/${item.id}` }, icon(item.icon, 19), t(item.label))))),
    h('div', { class: 'foot' },
      appSwitcher('books'),
      langPicker(),
      h('button', { onclick: () => signOut(auth) }, icon('logout', 17), t('signOut'))));
  mount(bottomEl,
    MENU.filter((m) => m.bottom).map((item) => h('a', { class: group === item.id ? 'on' : '', href: `#/${item.id}` }, icon(item.icon, 22), h('span', {}, t(item.label)))),
    h('button', { type: 'button', onclick: () => shell.classList.add('menu') }, icon('menu', 22), h('span', {}, t('bkMore'))));
}

let seeding = false;
/** The first bookkeeper to open the books saves the starting chart of accounts. */
function seedChart() {
  if (seeding || books.chart !== null || !books.loaded.has('chart') || !canPost()) return;
  seeding = true;
  saveChart(DEFAULT_ACCOUNTS).catch((err) => console.error(err));
}

let routing = 0;
async function route() {
  // Only the latest move draws: a page still loading from a moment ago gives way.
  const mine = ++routing;
  const { group, sub } = currentRoute();
  const item = MENU.find((m) => m.id === group);
  if (!item) { location.replace('#/home'); return; }
  renderSide();
  shell.classList.remove('menu');
  stopPage?.();
  stopPage = null;
  stopRedraw?.();
  stopRedraw = null;
  mainEl.scrollTop = 0;
  if (!session.has('accounting')) {
    mount(mainEl, h('div', { class: 'card' }, menuButton(), h('p', {}, t('bkNoPlan')), h('button', { class: 'primary', onclick: () => { location.href = '/app/'; } }, t('appBuy'))));
    return;
  }
  if (!canView()) {
    mount(mainEl, h('div', { class: 'card' }, menuButton(), h('p', {}, t('bkNoAccess'))));
    return;
  }
  try {
    const module = await item.page();
    if (mine !== routing) return;
    // Each page draws from the live books, and again whenever they change.
    const draw = () => {
      if (!ready()) { mount(mainEl, h('div', { class: 'card' }, h('p', { class: 'muted' }, t('loading')))); return; }
      seedChart();
      stopPage?.();
      stopPage = module.render(mainEl, sub, group) || null;
    };
    draw();
    stopRedraw = onBooks(() => {
      // A page with a form being filled in keeps it; the others redraw.
      if (mainEl.querySelector('[data-editing]')) return;
      draw();
    });
  } catch (err) {
    console.error(err);
    mount(mainEl, h('div', { class: 'card' }, `${t('errPage')}: ${err.message || err}`));
  }
}

/** The "☰" button pages put in their header, for narrow screens. */
export function menuButton() {
  return h('button', { class: 'menu-toggle ghost icon-btn', 'aria-label': t('bkMenu'), onclick: () => shell?.classList.add('menu') }, icon('menu', 20));
}

/** Go to a page, e.g. go('sales', docId). */
export function go(group, sub = '') {
  const hash = `#/${group}${sub ? `/${sub}` : ''}`;
  if (location.hash === hash) route();
  else location.hash = hash;
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

window.addEventListener('hashchange', () => { if (session.uid && sideEl) route(); });
let sideTimer;
onChange(() => {
  clearTimeout(sideTimer);
  sideTimer = setTimeout(() => { if (session.uid && sideEl) renderSide(); }, 50);
});

startApp(app, {
  name: 'SuXin Books', logo: '/icons/bk-64.png', tagline: t('bkTagline'),
  features: [['receipt', t('bkFeat1')], ['calc', t('bkFeat2')], ['percent', t('bkFeat3')]],
  foot: 'SuXin · Malaysia',
}, renderShell, { stop: () => { stopPage?.(); stopPage = null; stopRedraw?.(); stopRedraw = null; stopBooks(); sideEl = null; } });
