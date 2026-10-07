/**
 * The POS website: sign in, then a back office with a register in it.
 *
 * Same accounts, same company and the same products and stock as the
 * JEXO Count app -- both read and write one database, so there is nothing to
 * connect or sync.
 */
import { auth, initFirebase, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from './fb.js';
import { h, mount, toast } from './dom.js';
import { icon } from './icons.js';
import { getLang, LANGS, setLang, t } from './i18n.js';
import { endSession, loadSession, onChange, session } from './session.js';
import './strings-pro.js';

const app = document.getElementById('app');

/** The menu, Loyverse-style: groups with pages under them. */
const MENU = [
  { id: 'pos', icon: 'cart', label: 'navRegister', may: 'pos.sell', page: () => import('./register.js') },
  // JEXO Cloud: what is shown inside follows the company's modules (dashboard.js).
  { id: 'cloud', icon: 'chart', label: 'navCloud', perm: ['POS_REPORTS', 'POS_MANAGE', 'RECORD_STOCK_MOVEMENTS', 'WH_PURCHASE', 'WH_APPROVE'], page: () => import('./dashboard.js') },
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
      ['levels', 'invLevels'], ['adjust', 'invAdjust'], ['purchase', 'invPurchase'], ['transfers', 'invTransfers'], ['suppliers', 'invSuppliers'],
    ], page: () => import('./inventory.js'),
  },
  { id: 'employees', icon: 'idcard', label: 'navEmployees', perm: 'VIEW_USERS', page: () => import('./employees.js') },
  { id: 'customers', icon: 'users', label: 'navCustomers', may: 'pos.customers', page: () => import('./customers.js') },
  {
    id: 'integrations', icon: 'plug', label: 'navIntegrations', may: 'api.tokens', children: [
      ['tokens', 'intTokens'], ['api', 'intApi'],
    ], page: () => import('./integrations.js'),
  },
  { id: 'guide', icon: 'check', label: 'posGuide', perm: null, page: () => import('./posguide.js') },
  {
    id: 'settings', icon: 'sliders', label: 'navSettings', perm: null, children: [
      ['features', 'setFeatures'], ['payments', 'setPayments'], ['taxes', 'setTaxes'], ['loyalty', 'setLoyalty'],
      ['receipt', 'setReceipt'], ['stores', 'setStores'], ['device', 'setDevice'], ['addons', 'setAddons'],
    ], page: () => import('./settings.js'),
  },
];

/**
 * Whether a menu entry shows: [may] asks the module registry (module on
 * and permission held, see modules.js); [perm] is a plain permission for
 * pages that belong to every plan.
 */
function allowed(item) {
  if (item.may) return session.may(item.may);
  if (!item.perm) return true;
  const perms = Array.isArray(item.perm) ? item.perm : [item.perm];
  return perms.some((p) => session.can(p));
}

function currentRoute() {
  const [group = '', sub = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { group, sub };
}

// ------------------------------------------------------------------- sign in

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
  h('div', { class: 'brandmark' }, h('img', { src: '/icons/icon-192.png', alt: '', width: 40, height: 40 }), 'JEXO POS'),
  h('h2', { style: { margin: '6px 0 0' } }, t('signIn')),
  h('p', { class: 'muted', style: { margin: 0 } }, t('signInHint')),
  h('label', { class: 'field' }, t('email'), email),
  h('label', { class: 'field' }, t('password'), password),
  error,
  submit,
  h('button', {
    type: 'button', class: 'ghost',
    onclick: async () => {
      if (!email.value.trim()) return toast(t('enterEmailFirst'));
      try {
        await sendPasswordResetEmail(auth, email.value.trim());
        toast(t('resetSent'), 'ok');
      } catch (err) {
        toast(friendlyAuthError(err), 'error');
      }
    },
  }, t('forgotPassword')),
  langPicker());
  mount(app, h('div', { class: 'signin-split' },
    h('section', { class: 'signin-brand' },
      h('div', { class: 'brandmark', style: { color: '#fff' } }, h('img', { src: '/icons/icon-192.png', alt: '', width: 36, height: 36 }), 'JEXO POS'),
      h('div', { style: { display: 'grid', gap: '22px' } },
        h('h1', {}, t('signInTagline')),
        h('ul', {},
          h('li', {}, icon('barcode', 18), t('signFeat1')),
          h('li', {}, icon('store', 18), t('signFeat2')),
          h('li', {}, icon('wifiOff', 18), t('signFeat3')))),
      h('div', { class: 'foot' }, t('signFoot'))),
    h('section', { class: 'signin-form signin' }, form)));
}

function friendlyAuthError(err) {
  const code = err?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return t('errWrongPassword');
  if (code.includes('too-many-requests')) return t('errTooMany');
  if (code.includes('network')) return t('errNetwork');
  return err?.message || String(err);
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
  shell = h('div', { class: 'shell' }, sideEl, mainEl);
  mount(app, shell);
  renderSide();
  route();
}

function renderSide() {
  const { group, sub } = currentRoute();
  const nav = h('nav', {});
  for (const item of MENU.filter(allowed)) {
    if (!item.children) {
      nav.append(h('div', { class: 'group' },
        h('a', { class: `top${group === item.id ? ' current' : ''}`, href: `#/${item.id}` },
          icon(item.icon, 19), t(item.label))));
      continue;
    }
    const open = group === item.id;
    const box = h('div', { class: `group${open ? ' open current' : ''}` });
    const subs = h('div', { class: `sub${open ? '' : ' hidden'}` },
      item.children.map(([id, label]) => h('a', {
        href: `#/${item.id}/${id}`, class: open && sub === id ? 'current' : '',
      }, t(label))));
    box.append(
      h('button', { onclick: () => { subs.classList.toggle('hidden'); box.classList.toggle('open', !subs.classList.contains('hidden')); } },
        icon(item.icon, 19), h('span', { class: 'grow' }, t(item.label)), h('span', { class: 'chev' }, icon('chevron', 16))),
      subs);
    nav.append(box);
  }
  mount(sideEl,
    h('div', { class: 'brand' }, h('img', { src: '/icons/icon-64.png', alt: '', width: 28, height: 28 }), 'JEXO POS'),
    h('div', { class: 'who' },
      h('div', { class: 'name' }, session.name),
      h('div', { class: 'sm' }, session.companyName || session.email),
      h('div', { class: 'sm' }, `${t('branch')}: ${session.branchName()}`)),
    nav,
    h('div', { class: 'foot' },
      session.has('warehouse') ? h('a', { class: 'side-link', href: '/warehouse/' }, icon('box', 17), t('whApp')) : null,
      installPrompt ? h('button', { class: 'primary', onclick: install }, icon('download', 17), t('installApp')) : null,
      langPicker(),
      h('button', { onclick: () => signOut(auth) }, icon('logout', 17), t('signOut'))));
}

async function route() {
  let { group, sub } = currentRoute();
  const visible = MENU.filter(allowed);
  let item = visible.find((m) => m.id === group);
  if (!item) {
    item = visible[0];
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
  return h('button', { class: 'menu-toggle ghost icon-btn', 'aria-label': 'Menu', onclick: () => shell?.classList.add('menu') }, icon('menu', 20));
}

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
      // The cashier's open shift, if any; the till asks before the first sale.
      await import('./shifts.js').then((m) => m.loadOpenShift()).catch(() => {});
      // A receipt printer chosen before on this computer, without asking again.
      import('./rawprint.js').then((m) => m.reconnect()).catch(() => {});
      renderShell();
    } catch (err) {
      await signOut(auth);
      renderSignIn(err.message || String(err));
    }
  });
})();
