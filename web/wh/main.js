/**
 * The warehouse system: receiving, transfers, adjustments, purchasing and
 * stock control for the same company, products and stock as the JSOX Barcode Scan
 * app and the till. Laid out for a phone in a worker's hand (big buttons,
 * a bar along the bottom) and for a manager at a computer (a sidebar).
 */
import { auth, signOut } from '../js/fb.js';
import { h, mount, toast } from '../js/dom.js';
import { addStrings, getLang, LANGS, setLang, t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { onChange, session } from '../js/session.js';
import { STRINGS } from './strings.js';
import '../js/strings-pro.js';
import { appSwitcher, startApp, themeToggle } from '../js/apps.js';
import { guardTillLock } from '../js/tilllock.js';
import { helpFab } from '../js/pagehelp.js';
import { menu3d } from '../js/view3d.js';
// The words of the Connections page (连接), for the menu entry that opens it.
import '../js/connections.js';

addStrings(STRINGS);
const app = document.getElementById('app');

const MENU = [
  { id: 'home', icon: 'chart', label: 'whHome', perm: null, page: () => import('./home.js'), bottom: true },
  { id: 'receive', icon: 'download', label: 'whReceive', perm: 'RECORD_STOCK_MOVEMENTS', page: () => import('./receive.js'), bottom: true },
  { id: 'transfers', icon: 'box', label: 'whTransfers', perm: 'RECORD_STOCK_MOVEMENTS', page: () => import('./transfers.js'), bottom: true },
  { id: 'picking', icon: 'basket', label: 'whPicking', perm: 'RECORD_STOCK_MOVEMENTS', page: () => import('./picking.js'), bottom: true },
  { id: 'outbound', icon: 'tag', label: 'whOutbound', perm: 'RECORD_STOCK_MOVEMENTS', page: () => import('./outbound.js') },
  { id: 'docks', icon: 'truck', label: 'whDocks', perm: 'RECORD_STOCK_MOVEMENTS', page: () => import('./docks.js') },
  { id: 'map', icon: 'grid', label: 'whMap', perm: null, when: menu3d, page: () => import('./map.js') },
  { id: 'adjust', icon: 'sliders', label: 'whAdjust', perm: 'RECORD_STOCK_MOVEMENTS', page: () => import('./adjust.js') },
  { id: 'stock', icon: 'barcode', label: 'whStock', perm: null, page: () => import('./stock.js'), bottom: true },
  { id: 'reserve', icon: 'lock', label: 'whReserve', perm: ['RECORD_STOCK_MOVEMENTS', 'POS_MANAGE'], page: () => import('./reserve.js') },
  { id: 'returns', icon: 'trash', label: 'whReturns', perm: ['RECORD_STOCK_MOVEMENTS', 'WH_PURCHASE', 'POS_MANAGE'], page: () => import('./returns.js') },
  { id: 'purchase', icon: 'receipt', label: 'whPurchase', may: 'procurement.purchase', page: () => import('./purchase.js') },
  { id: 'online', icon: 'download', label: 'whOnline', may: 'procurement.purchase', page: () => import('./online.js') },
  { id: 'cost', icon: 'calc', label: 'whCost', perm: null, page: () => import('./cost.js') },
  { id: 'suppliers', icon: 'users', label: 'whSuppliers', may: 'procurement.suppliers', page: () => import('./suppliers.js') },
  { id: 'variance', icon: 'percent', label: 'whVariance', perm: null, page: () => import('./variance.js') },
  { id: 'monthend', icon: 'calc', label: 'whMonthEnd', perm: ['RECORD_STOCK_MOVEMENTS', 'WH_PURCHASE', 'POS_MANAGE', 'WH_APPROVE', 'POS_REPORTS'], page: () => import('./monthend.js') },
  { id: 'places', icon: 'store', label: 'whPlaces', perm: 'ADMIN', page: () => import('./places.js') },
  { id: 'connections', icon: 'plug', label: 'cnTitle', perm: 'ADMIN', page: () => import('./connections.js') },
  { id: 'audit', icon: 'idcard', label: 'whAudit', perm: 'VIEW_AUDIT_LOG', page: () => import('./audit.js') },
  // The one guide page for every app, opened at the warehouse tab.
  { id: 'guide', icon: 'book', label: 'whGuide', perm: null, href: '/guide/#warehouse' },
];

function allowed(item) {
  if (item.when && !item.when()) return false;
  // [may] asks the module registry: module on and permission held.
  if (item.may) return session.may(item.may);
  if (!item.perm) return true;
  if (item.perm === 'ADMIN') return session.isAdmin;
  return (Array.isArray(item.perm) ? item.perm : [item.perm]).some((p) => session.can(p));
}

function currentRoute() {
  const [group = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { group, sub: rest.join('/') };
}

// ------------------------------------------------------------------ language

function langPicker() {
  return h('select', { 'aria-label': 'Language', onchange: (e) => { setLang(e.target.value); location.reload(); } },
    LANGS.map(([code, name]) => h('option', { value: code, selected: code === getLang() }, name)));
}

// --------------------------------------------------------------------- shell

let shell;
let mainEl;
let sideEl;
let bottomEl;
let stopPage = null;

function renderShell() {
  // A counter computer locked to the till does not open the warehouse.
  if (guardTillLock()) return;
  sideEl = h('aside', { class: 'side' });
  mainEl = h('main', { class: 'main' });
  bottomEl = h('nav', { class: 'wh-bottom', 'aria-label': t('whMenu') });
  shell = h('div', { class: 'shell wh' }, sideEl, mainEl, bottomEl,
    h('div', { class: 'scrim', onclick: () => shell.classList.remove('menu') }));
  mount(app, shell);
  // Each page's own tutorial; above the phone's bottom buttons.
  helpFab(() => `wh-${currentRoute().group || 'home'}`, { lift: true });
  route();
}

function placePicker() {
  const list = session.sellableBranches();
  if (list.length < 2) return null;
  return h('label', { class: 'field', style: { color: 'var(--side-muted)' } }, t('whWorkingAt'),
    h('select', {
      onchange: (e) => { session.setBranch(e.target.value); route(); },
    }, list.map((b) => h('option', { value: b.id, selected: b.id === session.branchId }, b.name))));
}

function renderSide() {
  const { group } = currentRoute();
  const visible = MENU.filter(allowed);
  mount(sideEl,
    h('div', { class: 'brand' }, h('img', { src: '/icons/wh-64.png?v=4', alt: '', width: 28, height: 28 }), 'JSOX WMS'),
    h('div', { class: 'who' },
      h('div', { class: 'name' }, session.name),
      h('div', { class: 'sm' }, session.companyName || session.email),
      h('div', { class: 'sm' }, `${t('whAt')}: ${session.branchName()}`)),
    h('nav', {}, visible.map((item) => h('div', { class: 'group' },
      h('a', { class: `top${group === item.id ? ' current' : ''}`, href: item.href || `#/${item.id}` }, icon(item.icon, 19), t(item.label))))),
    h('div', { class: 'foot' },
      placePicker(),
      h('a', { class: 'side-link', href: '/pos/' }, icon('cart', 17), t('whOpenPos')),
      appSwitcher('warehouse'),
      installPrompt ? h('button', { class: 'primary', onclick: install }, icon('download', 17), t('installApp')) : null,
      themeToggle(),
      langPicker(),
      h('button', { onclick: () => signOut(auth) }, icon('logout', 17), t('signOut'))));
  mount(bottomEl,
    visible.filter((m) => m.bottom).map((item) => h('a', { class: group === item.id ? 'on' : '', href: `#/${item.id}` }, icon(item.icon, 22), h('span', {}, t(item.label)))),
    h('button', { type: 'button', onclick: () => shell.classList.add('menu') }, icon('menu', 22), h('span', {}, t('whMore'))));
}

async function route() {
  const { group, sub } = currentRoute();
  const visible = MENU.filter(allowed);
  const item = visible.find((m) => m.id === group);
  // The guide lives on the guide page now: an old link goes there.
  if (item?.href) { location.replace(item.href); return; }
  if (!item) {
    location.replace(`#/${visible.find((m) => !m.href).id}`);
    return;
  }
  renderSide();
  shell.classList.remove('menu');
  stopPage?.();
  stopPage = null;
  mainEl.scrollTop = 0;
  // Every page needs a plan with the warehouse in it.
  if (!session.has('warehouse')) {
    mount(mainEl, h('div', { class: 'card' }, menuButton(), h('p', {}, t('planNoWarehouse'))));
    return;
  }
  // Automatic dispatch runs while the WMS is open (auto.js), wherever it is switched on.
  import('./auto.js').then((m) => m.startAutopilot()).catch(() => {});
  try {
    const module = await item.page();
    stopPage = module.render(mainEl, sub) || null;
  } catch (err) {
    console.error(err);
    mount(mainEl, h('div', { class: 'card' }, `${t('errPage')}: ${err.message || err}`));
  }
}

/** The "☰" button pages put in their header, for narrow screens. */
export function menuButton() {
  return h('button', { class: 'menu-toggle ghost icon-btn', 'aria-label': t('whMenu'), onclick: () => shell?.classList.add('menu') }, icon('menu', 20));
}

/** Go to a page, e.g. go('receive', poId). */
export function go(group, sub = '') {
  const hash = `#/${group}${sub ? `/${sub}` : ''}`;
  // Same address (an order saved from its own page): no hashchange, so draw again.
  if (location.hash === hash) route();
  else location.hash = hash;
}

// ------------------------------------------------------------ install as app

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  if (session.uid && sideEl) renderSide();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  if (session.uid && sideEl) renderSide();
});
async function install() {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  renderSide();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// ---------------------------------------------------------------------- boot

window.addEventListener('hashchange', () => { if (session.uid && sideEl) route(); });
let sideTimer;
onChange(() => {
  // Products and settings arrive in several snapshots; redraw the menu once.
  clearTimeout(sideTimer);
  sideTimer = setTimeout(() => { if (session.uid && sideEl) renderSide(); }, 50);
});

// Signing in is the same screen in every JSOX app (apps.js).
startApp(app, {
  name: 'JSOX WMS', logo: '/icons/wh-64.png?v=4', tagline: t('whTagline'),
  features: [['download', t('whFeat1')], ['box', t('whFeat2')], ['receipt', t('whFeat3')]],
  foot: 'JSOX · Malaysia',
}, renderShell, { stop: () => { stopPage?.(); stopPage = null; sideEl = null; } });
