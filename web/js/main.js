/**
 * The POS website: sign in, then a back office with a register in it.
 *
 * Same accounts, same company and the same products and stock as the
 * Stock Check app -- both read and write one database, so there is nothing to
 * connect or sync.
 */
import { auth, initFirebase, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from './fb.js';
import { h, mount, toast } from './dom.js';
import { getLang, LANGS, setLang, t } from './i18n.js';
import { endSession, loadSession, onChange, session } from './session.js';

const app = document.getElementById('app');

/** The menu, Loyverse-style: groups with pages under them. */
const MENU = [
  { id: 'pos', icon: '🛒', label: 'navRegister', perm: 'POS_SELL', page: () => import('./register.js') },
  {
    id: 'reports', icon: '📊', label: 'navReports', perm: ['POS_REPORTS', 'POS_SELL'], children: [
      ['summary', 'repSummary'], ['items', 'repItems'], ['categories', 'repCategories'],
      ['employees', 'repEmployees'], ['payments', 'repPayments'], ['receipts', 'repReceipts'],
      ['modifiers', 'repModifiers'], ['discounts', 'repDiscounts'], ['taxes', 'repTaxes'],
    ], page: () => import('./reports.js'),
  },
  {
    id: 'items', icon: '🧺', label: 'navItems', perm: 'POS_MANAGE', children: [
      ['list', 'itemList'], ['categories', 'itemCategories'], ['modifiers', 'itemModifiers'], ['discounts', 'itemDiscounts'],
    ], page: () => import('./items.js'),
  },
  { id: 'inventory', icon: '📦', label: 'navInventory', perm: ['RECORD_STOCK_MOVEMENTS', 'POS_MANAGE'], page: () => import('./inventory.js') },
  { id: 'employees', icon: '🪪', label: 'navEmployees', perm: 'VIEW_USERS', page: () => import('./employees.js') },
  {
    id: 'settings', icon: '⚙️', label: 'navSettings', perm: null, children: [
      ['features', 'setFeatures'], ['payments', 'setPayments'], ['taxes', 'setTaxes'],
      ['receipt', 'setReceipt'], ['stores', 'setStores'], ['device', 'setDevice'],
    ], page: () => import('./settings.js'),
  },
];

function allowed(item) {
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
  h('div', { class: 'brandmark' }, h('span', { class: 'logo' }, 'S'), 'Stock Check POS'),
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
  mount(app, h('div', { class: 'signin' }, form));
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
          h('span', { class: 'icon' }, item.icon), t(item.label))));
      continue;
    }
    const open = group === item.id;
    const box = h('div', { class: `group${open ? ' open current' : ''}` });
    const subs = h('div', { class: `sub${open ? '' : ' hidden'}` },
      item.children.map(([id, label]) => h('a', {
        href: `#/${item.id}/${id}`, class: open && sub === id ? 'current' : '',
      }, t(label))));
    box.append(
      h('button', { onclick: () => subs.classList.toggle('hidden') },
        h('span', { class: 'icon' }, item.icon), h('span', { class: 'grow' }, t(item.label)), '▾'),
      subs);
    nav.append(box);
  }
  mount(sideEl,
    h('div', { class: 'who' },
      h('div', { class: 'name' }, session.name),
      h('div', { class: 'muted', style: { fontSize: '13px' } }, session.companyName || session.email),
      h('div', { class: 'muted', style: { fontSize: '13px' } }, `${t('branch')}: ${session.branchName()}`)),
    nav,
    h('div', { class: 'foot' },
      langPicker(),
      h('button', { onclick: () => signOut(auth) }, t('signOut'))));
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
  return h('button', { class: 'menu-toggle ghost', onclick: () => shell?.classList.add('menu') }, '☰');
}

// ---------------------------------------------------------------------- boot

window.addEventListener('hashchange', () => {
  if (session.uid) route();
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
      renderShell();
    } catch (err) {
      await signOut(auth);
      renderSignIn(err.message || String(err));
    }
  });
})();
