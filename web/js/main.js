/**
 * The POS website: sign in, then a back office with a register in it.
 *
 * Same accounts, same company and the same products and stock as the
 * JSOX Barcode Scan app -- both read and write one database, so there is nothing to
 * connect or sync.
 */
import { auth, signOut } from './fb.js';
import { h, local, mount } from './dom.js';
import { icon } from './icons.js';
import { getLang, LANGS, setLang, t } from './i18n.js';
import { onChange, session } from './session.js';
import './strings-pro.js';
import { appSwitcher, startApp, themeToggle } from './apps.js';
import { isTillLocked, tillLockButton, toggleTillLock } from './tilllock.js';
import { helpFab, stopTillHelp } from './pagehelp.js';

const app = document.getElementById('app');

/** The menu, Loyverse-style: groups with pages under them. */
const MENU = [
  { id: 'pos', icon: 'cart', label: 'navRegister', may: 'pos.sell', page: () => import('./register.js') },
  // The shop floor in 3D: tables, shelves and tills, as they are now.
  { id: 'floor', icon: 'grid', label: 'floor3d', may: 'pos.reports', page: () => import('./floor3d.js') },
  // JSOX Every Data: what is shown inside follows the company's modules (dashboard.js).
  // Every Data is its own page now (/data/); the old address goes there.
  { id: 'cloud', icon: 'chart', label: 'navCloud', perm: ['POS_REPORTS', 'POS_MANAGE', 'RECORD_STOCK_MOVEMENTS', 'WH_PURCHASE', 'WH_APPROVE'], href: '/data/', hidden: true },
  {
    id: 'reports', icon: 'chart', label: 'navReports', may: 'pos.reports', children: [
      ['summary', 'repSummary'], ['items', 'repItems'], ['categories', 'repCategories'],
      ['employees', 'repEmployees'], ['payments', 'repPayments'], ['receipts', 'repReceipts'],
      ['modifiers', 'repModifiers'], ['discounts', 'repDiscounts'], ['taxes', 'repTaxes'],
      ['shifts', 'repShifts'], ['einvoice', 'repEinvoice'],
    ], page: () => import('./reports.js'),
  },
  {
    id: 'items', icon: 'tag', label: 'navItems', perm: 'POS_MANAGE', children: [
      ['list', 'itemList'], ['categories', 'itemCategories'], ['modifiers', 'itemModifiers'], ['discounts', 'itemDiscounts'],
    ], page: () => import('./items.js'),
  },
  {
    id: 'inventory', icon: 'box', label: 'navInventory', perm: ['RECORD_STOCK_MOVEMENTS', 'POS_MANAGE'], children: [
      // Purchase orders, transfers and suppliers are the warehouse system's:
      // not in the menu, but old links still open a page pointing there.
      ['levels', 'invLevels'], ['adjust', 'invAdjust'],
      ['purchase', 'invPurchase', { hidden: true }], ['transfers', 'invTransfers', { hidden: true }], ['suppliers', 'invSuppliers', { hidden: true }],
    ], page: () => import('./inventory.js'),
  },
  { id: 'employees', icon: 'idcard', label: 'navEmployees', perm: 'VIEW_USERS', page: () => import('./employees.js') },
  { id: 'customers', icon: 'users', label: 'navCustomers', may: 'pos.customers', page: () => import('./customers.js') },
  {
    id: 'integrations', icon: 'plug', label: 'navIntegrations', may: 'api.tokens', children: [
      ['tokens', 'intTokens'], ['api', 'intApi'],
    ], page: () => import('./integrations.js'),
  },
  // The one guide page for every app, opened at the till's tab.
  { id: 'guide', icon: 'book', label: 'posGuide', perm: null, href: '/guide/#pos' },
  { id: 'profile', icon: 'user', label: 'navProfile', perm: null, page: () => import('./profile.js') },
  {
    id: 'settings', icon: 'sliders', label: 'navSettings', perm: null, children: [
      ['features', 'setFeatures'], ['payments', 'setPayments'], ['taxes', 'setTaxes'], ['loyalty', 'setLoyalty'],
      ['receipt', 'setReceipt'], ['stores', 'setStores'], ['device', 'setDevice'], ['qr', 'setQr'], ['notify', 'setNotify'], ['addons', 'setAddons'],
    ], page: () => import('./settings.js'),
  },
];

/**
 * Whether a menu entry shows: [may] asks the module registry (module on
 * and permission held, see modules.js); [perm] is a plain permission for
 * pages that belong to every plan.
 */
function allowed(item) {
  // A till locked to the register (tilllock.js) shows the register only.
  if (isTillLocked() && item.id !== 'pos') return false;
  if (item.may) return session.may(item.may);
  if (!item.perm) return true;
  const perms = Array.isArray(item.perm) ? item.perm : [item.perm];
  return perms.some((p) => session.can(p));
}

function currentRoute() {
  const [group = '', sub = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { group, sub };
}

function langPicker() {
  return h('select', {
    'aria-label': 'Language',
    onchange: (e) => { setLang(e.target.value); location.reload(); },
  }, LANGS.map(([code, name]) => h('option', { value: code, selected: code === getLang() }, name)));
}

// --------------------------------------------------------------------- shell

let shell;
let mainEl;
let sideEl;
let stopPage = null;

function renderShell() {
  sideEl = h('aside', { class: 'side' });
  mainEl = h('main', { class: 'main' });
  shell = h('div', { class: `shell${local.get('pos.sideCollapsed', false) ? ' collapsed' : ''}` }, sideEl, mainEl);
  mount(app, shell);
  // Every page's own tutorial; the till has its tutorial mode instead.
  helpFab(() => {
    const { group, sub } = currentRoute();
    return group === 'pos' ? '' : `pos-${group}${sub ? `-${sub}` : ''}`;
  });
  renderSide();
  route();
}

function renderSide() {
  const { group, sub } = currentRoute();
  const nav = h('nav', {});
  for (const item of MENU.filter(allowed).filter((m) => !m.hidden)) {
    if (!item.children) {
      nav.append(h('div', { class: 'group' },
        h('a', { class: `top${group === item.id ? ' current' : ''}`, href: item.href || `#/${item.id}` },
          icon(item.icon, 19), t(item.label))));
      continue;
    }
    const open = group === item.id;
    const box = h('div', { class: `group${open ? ' open current' : ''}` });
    const subs = h('div', { class: `sub${open ? '' : ' hidden'}` },
      item.children.filter(([, , opts]) => !opts?.hidden).map(([id, label]) => h('a', {
        href: `#/${item.id}/${id}`, class: open && sub === id ? 'current' : '',
      }, t(label))));
    box.append(
      h('button', { onclick: () => { subs.classList.toggle('hidden'); box.classList.toggle('open', !subs.classList.contains('hidden')); } },
        icon(item.icon, 19), h('span', { class: 'grow' }, t(item.label)), h('span', { class: 'chev' }, icon('chevron', 16))),
      subs);
    nav.append(box);
  }
  mount(sideEl,
    h('div', { class: 'brand' }, h('img', { src: '/icons/icon-64.png?v=4', alt: '', width: 28, height: 28 }), h('span', { class: 'grow' }, 'JSOX POS'),
      h('button', { class: 'ghost icon-btn side-collapse', title: t('sideHide'), 'aria-label': t('sideHide'), onclick: () => setCollapsed(true) }, icon('chevron', 18))),
    isTillLocked() ? h('div', { class: 'till-locked-note' }, icon('lock', 16), t('tlOnlyTill')) : null,
    h('div', { class: 'who' },
      h('div', { class: 'name' }, session.name),
      h('div', { class: 'sm' }, session.companyName || session.email),
      h('div', { class: 'sm' }, `${t('branch')}: ${session.branchName()}`)),
    nav,
    h('div', { class: 'foot' },
      session.has('warehouse') && !isTillLocked() ? h('a', { class: 'side-link', href: '/warehouse/' }, icon('box', 17), t('whApp')) : null,
      isTillLocked() ? null : appSwitcher('pos'),
      installPrompt ? h('button', { class: 'primary', onclick: install }, icon('download', 17), t('installApp')) : null,
      h('button', { 'data-act': 'side-till-lock', onclick: () => toggleTillLock(afterLock) }, icon('lock', 17), isTillLocked() ? t('tlUnlock') : t('tlLock')),
      themeToggle(),
      langPicker(),
      isTillLocked() ? null : h('button', { onclick: () => signOut(auth) }, icon('logout', 17), t('signOut'))));
}

async function route() {
  let { group, sub } = currentRoute();
  if (group !== 'pos') stopTillHelp();
  const visible = MENU.filter(allowed);
  let item = visible.find((m) => m.id === group);
  // A page that lives elsewhere now (#/cloud, #/guide): go there.
  if (item?.href) { location.replace(item.href); return; }
  if (!item) {
    item = visible.find((m) => !m.href);
    if (!item) return mount(mainEl, h('div', { class: 'card' }, t('errNoPosPermission')));
    location.replace(`#/${item.id}${item.children ? `/${item.children[0][0]}` : ''}`);
    return;
  }
  if (item.children && !item.children.some(([id]) => id === sub)) {
    location.replace(`#/${item.id}/${item.children[0][0]}`);
    return;
  }
  renderSide();
  shell.classList.remove('menu');
  stopPage?.();
  stopPage = null;
  // The register fills the whole screen; everything else scrolls.
  mainEl.style.padding = item.id === 'pos' ? '0' : '';
  mainEl.style.overflow = item.id === 'pos' ? 'hidden' : '';
  try {
    const module = await item.page();
    stopPage = module.render(mainEl, sub, { openMenu: () => shell.classList.add('menu') }) || null;
  } catch (err) {
    console.error(err);
    mount(mainEl, h('div', { class: 'card' }, `${t('errPage')}: ${err.message || err}`));
  }
}

/** A "☰" button pages put in their header, for narrow screens. */
export function menuButton() {
  return h('button', {
    class: 'menu-toggle ghost icon-btn', 'aria-label': 'Menu', 'data-help': 'menu',
    // On a wide screen with the menu put away, this brings it back; on a narrow one it slides over.
    onclick: () => (shell?.classList.contains('collapsed') && window.innerWidth > 960 ? setCollapsed(false) : shell?.classList.add('menu')),
  }, icon('menu', 20));
}

/** The left menu put away (more room for the till) or back; remembered on this computer. */
function setCollapsed(on) {
  local.set('pos.sideCollapsed', on);
  shell?.classList.toggle('collapsed', on);
  shell?.classList.remove('menu');
}

/** After locking or unlocking the till: the menu and the page follow. */
function afterLock(locked) {
  if (locked && !location.hash.startsWith('#/pos')) location.hash = '#/pos';
  else route();
}

/** The lock button, top right of the register. */
export const tillButton = () => tillLockButton(afterLock);

// ------------------------------------------------------------ install as app

// Chrome offers to install the website as an app (its own icon, full
// screen, opens with the internet down). The offer is kept and shown as a
// button in the sidebar, since the browser's own prompt is easy to miss.
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
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ---------------------------------------------------------------------- boot

// Before the shell is drawn (still signing in) there is nothing to route:
// renderShell() routes once it is up.
window.addEventListener('hashchange', () => {
  if (session.uid && sideEl) route();
});

// The sidebar's branch name and the page follow product and settings changes.
onChange(() => {
  if (session.uid && sideEl) renderSide();
});

// Signing in is the same screen in every JSOX app (apps.js): one account,
// one place to sign in, register or reset a password.
startApp(app, {
  name: 'JSOX POS', logo: '/icons/icon-192.png?v=4', tagline: t('signInTagline'),
  features: [['barcode', t('signFeat1')], ['store', t('signFeat2')], ['wifiOff', t('signFeat3')]],
  foot: t('signFoot'),
}, async () => {
  // The cashier's open shift, if any; the till asks before the first sale.
  await import('./shifts.js').then((m) => m.loadOpenShift()).catch(() => {});
  // A receipt printer chosen before on this computer, without asking again.
  import('./rawprint.js').then((m) => m.reconnect()).catch(() => {});
  renderShell();
}, { stop: () => { stopPage?.(); stopPage = null; sideEl = null; } });
