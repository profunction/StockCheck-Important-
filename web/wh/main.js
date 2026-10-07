/**
 * The warehouse system: receiving, transfers, adjustments, purchasing and
 * stock control for the same company, products and stock as the JEXO Count
 * app and the till. Laid out for a phone in a worker's hand (big buttons,
 * a bar along the bottom) and for a manager at a computer (a sidebar).
 */
import { auth, initFirebase, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from '../js/fb.js';
import { h, mount, toast } from '../js/dom.js';
import { addStrings, getLang, LANGS, setLang, t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { endSession, loadSession, onChange, session } from '../js/session.js';
import { STRINGS } from './strings.js';
import '../js/strings-pro.js';

addStrings(STRINGS);
const app = document.getElementById('app');

const MENU = [
  { id: 'home', icon: 'chart', label: 'whHome', perm: null, page: () => import('./home.js'), bottom: true },
  { id: 'receive', icon: 'download', label: 'whReceive', perm: 'RECORD_STOCK_MOVEMENTS', page: () => import('./receive.js'), bottom: true },
  { id: 'transfers', icon: 'box', label: 'whTransfers', perm: 'RECORD_STOCK_MOVEMENTS', page: () => import('./transfers.js'), bottom: true },
  { id: 'adjust', icon: 'sliders', label: 'whAdjust', perm: 'RECORD_STOCK_MOVEMENTS', page: () => import('./adjust.js') },
  { id: 'stock', icon: 'barcode', label: 'whStock', perm: null, page: () => import('./stock.js'), bottom: true },
  { id: 'purchase', icon: 'receipt', label: 'whPurchase', may: 'procurement.purchase', page: () => import('./purchase.js') },
  { id: 'online', icon: 'download', label: 'whOnline', may: 'procurement.purchase', page: () => import('./online.js') },
  { id: 'suppliers', icon: 'users', label: 'whSuppliers', may: 'procurement.suppliers', page: () => import('./suppliers.js') },
  { id: 'variance', icon: 'percent', label: 'whVariance', perm: null, page: () => import('./variance.js') },
  { id: 'places', icon: 'store', label: 'whPlaces', perm: 'ADMIN', page: () => import('./places.js') },
  { id: 'audit', icon: 'idcard', label: 'whAudit', perm: 'VIEW_AUDIT_LOG', page: () => import('./audit.js') },
  { id: 'guide', icon: 'check', label: 'whGuide', perm: null, page: () => import('./guide.js') },
];

function allowed(item) {
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

// ------------------------------------------------------------------- sign in

function langPicker() {
  return h('select', { 'aria-label': 'Language', onchange: (e) => { setLang(e.target.value); location.reload(); } },
    LANGS.map(([code, name]) => h('option', { value: code, selected: code === getLang() }, name)));
}

function friendlyAuthError(err) {
  const code = err?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return t('errWrongPassword');
  if (code.includes('too-many-requests')) return t('errTooMany');
  if (code.includes('network')) return t('errNetwork');
  return err?.message || String(err);
}

function renderSignIn(message = '') {
  const email = h('input', { type: 'email', autocomplete: 'username', required: true, autofocus: true });
  const password = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const error = h('p', { class: 'muted', style: { color: 'var(--danger)', margin: 0 } }, message);
  const submit = h('button', { class: 'primary', type: 'submit' }, t('signIn'));
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true;
      error.textContent = '';
      try {
        await signInWithEmailAndPassword(auth, email.value.trim(), password.value);
      } catch (err) {
        error.textContent = friendlyAuthError(err);
        submit.disabled = false;
      }
    },
  },
  h('div', { class: 'brandmark' }, h('img', { src: '/icons/wh-192.png', alt: '', width: 40, height: 40 }), 'JEXO Warehouse'),
  h('h2', { style: { margin: '6px 0 0' } }, t('signIn')),
  h('p', { class: 'muted', style: { margin: 0 } }, t('signInHint')),
  h('label', { class: 'field' }, t('email'), email),
  h('label', { class: 'field' }, t('password'), password),
  error, submit,
  h('button', {
    type: 'button', class: 'ghost',
    onclick: async () => {
      if (!email.value.trim()) return toast(t('enterEmailFirst'));
      try { await sendPasswordResetEmail(auth, email.value.trim()); toast(t('resetSent'), 'ok'); } catch (err) { toast(friendlyAuthError(err), 'error'); }
    },
  }, t('forgotPassword')),
  langPicker());
  mount(app, h('div', { class: 'signin-split' },
    h('section', { class: 'signin-brand wh-brand' },
      h('div', { class: 'brandmark', style: { color: '#fff' } }, h('img', { src: '/icons/wh-192.png', alt: '', width: 36, height: 36 }), 'JEXO Warehouse'),
      h('div', { style: { display: 'grid', gap: '22px' } },
        h('h1', {}, t('whTagline')),
        h('ul', {},
          h('li', {}, icon('download', 18), t('whFeat1')),
          h('li', {}, icon('box', 18), t('whFeat2')),
          h('li', {}, icon('receipt', 18), t('whFeat3')))),
      h('div', { class: 'foot' }, t('whFoot'))),
    h('section', { class: 'signin-form signin' }, form)));
}

// --------------------------------------------------------------------- shell

let shell;
let mainEl;
let sideEl;
let bottomEl;
let stopPage = null;

function renderShell() {
  sideEl = h('aside', { class: 'side' });
  mainEl = h('main', { class: 'main' });
  bottomEl = h('nav', { class: 'wh-bottom', 'aria-label': t('whMenu') });
  shell = h('div', { class: 'shell wh' }, sideEl, mainEl, bottomEl,
    h('div', { class: 'scrim', onclick: () => shell.classList.remove('menu') }));
  mount(app, shell);
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
    h('div', { class: 'brand' }, h('img', { src: '/icons/wh-64.png', alt: '', width: 28, height: 28 }), 'JEXO Warehouse'),
    h('div', { class: 'who' },
      h('div', { class: 'name' }, session.name),
      h('div', { class: 'sm' }, session.companyName || session.email),
      h('div', { class: 'sm' }, `${t('whAt')}: ${session.branchName()}`)),
    h('nav', {}, visible.map((item) => h('div', { class: 'group' },
      h('a', { class: `top${group === item.id ? ' current' : ''}`, href: `#/${item.id}` }, icon(item.icon, 19), t(item.label))))),
    h('div', { class: 'foot' },
      placePicker(),
      h('a', { class: 'side-link', href: '/pos/' }, icon('cart', 17), t('whOpenPos')),
      installPrompt ? h('button', { class: 'primary', onclick: install }, icon('download', 17), t('installApp')) : null,
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
  if (!item) {
    location.replace(`#/${visible[0].id}`);
    return;
  }
  renderSide();
  shell.classList.remove('menu');
  stopPage?.();
  stopPage = null;
  mainEl.scrollTop = 0;
  // The guide is open to everyone; the rest needs a plan with the warehouse in it.
  if (!session.has('warehouse') && group !== 'guide') {
    mount(mainEl, h('div', { class: 'card' }, menuButton(), h('p', {}, t('planNoWarehouse'))));
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

window.addEventListener('hashchange', () => { if (session.uid) route(); });
let sideTimer;
onChange(() => {
  // Products and settings arrive in several snapshots; redraw the menu once.
  clearTimeout(sideTimer);
  sideTimer = setTimeout(() => { if (session.uid && sideEl) renderSide(); }, 50);
});

(async () => {
  try {
    await initFirebase();
  } catch (err) {
    mount(app, h('div', { class: 'signin' }, h('div', { class: 'card' }, String(err.message || err))));
    return;
  }
  onAuthStateChanged(auth, async (user) => {
    stopPage?.();
    stopPage = null;
    endSession();
    if (!user) return renderSignIn();
    mount(app, h('div', { class: 'signin' }, h('p', { class: 'muted' }, t('loading'))));
    try {
      await loadSession(user);
      renderShell();
    } catch (err) {
      await signOut(auth);
      renderSignIn(err.message || String(err));
    }
  });
})();
