/**
 * SuXin TMS, the transport system: lorries, drivers clocking in and out,
 * trips carrying the warehouse's transfers and customer orders, and signed
 * proof of delivery. Comes with the warehouse (the 'warehouse' module) and
 * reads the same transfers and reservations. Laid out like SuXin WMS: a
 * bar along the bottom on a driver's phone, a sidebar at a computer.
 */
import { auth, signOut } from '../js/fb.js';
import { h, mount, toast } from '../js/dom.js';
import { addStrings, getLang, LANGS, setLang, t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { onChange, session } from '../js/session.js';
import { STRINGS } from './strings.js';
import '../js/strings-pro.js';
import { canManage, canWork } from './common.js';
import { appSwitcher, startApp, themeToggle } from '../js/apps.js';
import { guardTillLock } from '../js/tilllock.js';
import { helpFab } from '../js/pagehelp.js';

addStrings(STRINGS);
const app = document.getElementById('app');

const MENU = [
  { id: 'home', icon: 'chart', label: 'tmHome', page: () => import('./home.js'), bottom: true },
  { id: 'trips', icon: 'truck', label: 'tmTrips', page: () => import('./trips.js'), bottom: true },
  { id: 'drivers', icon: 'idcard', label: 'tmDrivers', page: () => import('./drivers.js'), bottom: true },
  { id: 'lorries', icon: 'box', label: 'tmLorries', page: () => import('./lorries.js') },
  { id: 'pod', icon: 'receipt', label: 'tmPod', page: () => import('./pod.js'), bottom: true },
  { id: 'map', icon: 'grid', label: 'tmMap', page: () => import('./map.js') },
]

const allowed = () => true;

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
  bottomEl = h('nav', { class: 'wh-bottom', 'aria-label': t('tmMenu') });
  shell = h('div', { class: 'shell wh' }, sideEl, mainEl, bottomEl,
    h('div', { class: 'scrim', onclick: () => shell.classList.remove('menu') }));
  mount(app, shell);
  // Each page's own tutorial; above the phone's bottom buttons.
  helpFab(() => `tm-${currentRoute().group || 'home'}`, { lift: true });
  route();
}

function placePicker() {
  const list = session.sellableBranches();
  if (list.length < 2) return null;
  return h('label', { class: 'field', style: { color: 'var(--side-muted)' } }, t('branch'),
    h('select', {
      onchange: (e) => { session.setBranch(e.target.value); route(); },
    }, list.map((b) => h('option', { value: b.id, selected: b.id === session.branchId }, b.name))));
}

function renderSide() {
  const { group } = currentRoute();
  const visible = MENU.filter(allowed);
  mount(sideEl,
    h('div', { class: 'brand' }, h('img', { src: '/icons/tms-64.png?v=4', alt: '', width: 28, height: 28 }), 'SuXin TMS'),
    h('div', { class: 'who' },
      h('div', { class: 'name' }, session.name),
      h('div', { class: 'sm' }, session.companyName || session.email),
      h('div', { class: 'sm' }, session.branchName())),
    h('nav', {}, visible.map((item) => h('div', { class: 'group' },
      h('a', { class: `top${group === item.id ? ' current' : ''}`, href: item.href || `#/${item.id}` }, icon(item.icon, 19), t(item.label))))),
    h('div', { class: 'foot' },
      placePicker(),
      h('a', { class: 'side-link', href: '/warehouse/' }, icon('box', 17), 'SuXin WMS'),
      appSwitcher('tms'),
      installPrompt ? h('button', { class: 'primary', onclick: install }, icon('download', 17), t('installApp')) : null,
      themeToggle(),
      langPicker(),
      h('button', { onclick: () => signOut(auth) }, icon('logout', 17), t('signOut'))));
  mount(bottomEl,
    visible.filter((m) => m.bottom).map((item) => h('a', { class: group === item.id ? 'on' : '', href: `#/${item.id}` }, icon(item.icon, 22), h('span', {}, t(item.label)))),
    h('button', { type: 'button', onclick: () => shell.classList.add('menu') }, icon('menu', 22), h('span', {}, t('tmMore'))));
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
  // The lorries come with the warehouse; and with the right to move stock.
  if (!session.has('warehouse')) {
    mount(mainEl, h('div', { class: 'card' }, menuButton(), h('p', {}, t('tmNoPlan'))));
    return;
  }
  if (!canWork() && !canManage()) {
    mount(mainEl, h('div', { class: 'card' }, menuButton(), h('p', {}, t('tmNoRight'))));
    return;
  }
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
  return h('button', { class: 'menu-toggle ghost icon-btn', 'aria-label': t('tmMenu'), onclick: () => shell?.classList.add('menu') }, icon('menu', 20));
}

/** Go to a page, e.g. go('trips', tripId). */
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

// Signing in is the same screen in every SuXin app (apps.js).
startApp(app, {
  name: 'SuXin TMS', logo: '/icons/tms-64.png?v=4', tagline: t('tmTagline'),
  features: [['truck', t('tmFeat1')], ['idcard', t('tmFeat2')], ['receipt', t('tmFeat3')]],
  foot: 'SuXin · Malaysia',
}, renderShell, { stop: () => { stopPage?.(); stopPage = null; sideEl = null; } });
