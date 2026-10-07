/**
 * /guide/: every product's step-by-step guide on one public page -- what the
 * phone app's "How to use" opens, and somewhere to send a new customer.
 * #app, #pos, #warehouse, #cloud or #account picks the tab.
 */
import { h, mount } from '../js/dom.js';
import { getLang, LANGS, setLang } from '../js/i18n.js';
import { renderGuide } from '../js/guide.js';
import { ACCOUNT_GUIDE, APP_GUIDE, CLOUD_GUIDE, POS_GUIDE, WAREHOUSE_GUIDE } from '../js/guides.js';

const TABS = {
  account: { guide: ACCOUNT_GUIDE, label: { zh: '账号和注册', en: 'Account & sign-up', ms: 'Akaun & daftar' } },
  app: { guide: APP_GUIDE, label: { zh: 'JEXO Count（手机 + 网页）', en: 'JEXO Count (phone + web)', ms: 'JEXO Count (telefon + web)' } },
  pos: { guide: POS_GUIDE, label: { zh: 'JEXO POS 收银', en: 'JEXO POS (till)', ms: 'JEXO POS (POS)' } },
  warehouse: { guide: WAREHOUSE_GUIDE, label: { zh: 'JEXO Warehouse 仓库', en: 'JEXO Warehouse', ms: 'JEXO Warehouse (gudang)' } },
  cloud: { guide: CLOUD_GUIDE, label: { zh: 'JEXO Cloud 老板总览', en: 'JEXO Cloud', ms: 'JEXO Cloud' } },
};
const TITLE = { zh: '使用教程', en: 'How to use', ms: 'Cara guna' };

/** Beside the account guide: the real sign-in and sign-up, one tap away. */
const ACCOUNT = {
  zh: {
    title: '马上开始', signin: '登录', create: '注册新公司', createSub: '老板用：自己定一个公司代码',
    join: '加入公司', joinSub: '员工用：填老板给的公司代码', reset: '忘记密码？',
    code: '公司代码是老板注册时自己定的（至少 4 个字，例如 KEDAIMAJU）。员工加入、忘记密码时都要填它。',
  },
  en: {
    title: 'Get started', signin: 'Sign in', create: 'Register a company', createSub: 'For the owner: choose a company code',
    join: 'Join a company', joinSub: 'For staff: the code from the owner', reset: 'Forgot password?',
    code: 'The owner chooses the company code when registering (4 characters or more, e.g. KEDAIMAJU). Staff type it to join, and everyone types it to reset a password.',
  },
  ms: {
    title: 'Mula sekarang', signin: 'Log masuk', create: 'Daftar syarikat', createSub: 'Untuk pemilik: pilih kod syarikat',
    join: 'Sertai syarikat', joinSub: 'Untuk pekerja: kod daripada pemilik', reset: 'Lupa kata laluan?',
    code: 'Pemilik memilih kod syarikat semasa mendaftar (4 aksara atau lebih, cth. KEDAIMAJU). Pekerja menaipnya untuk menyertai, dan semua menaipnya untuk set semula kata laluan.',
  },
};

function accountPanel(lang) {
  const a = ACCOUNT[lang] || ACCOUNT.en;
  const go = (hash, label, sub, primary = false) => h('a', { class: `btn-link${primary ? ' primary' : ''} acct-go`, href: `/app/${hash}`, 'data-go': hash.slice(1) || 'signin' },
    h('b', {}, label), sub ? h('small', {}, sub) : null);
  return h('aside', { class: 'card acct' },
    h('h2', { style: { margin: 0 } }, a.title),
    go('#create', a.create, a.createSub, true),
    go('#join', a.join, a.joinSub),
    go('#signin', a.signin),
    h('a', { href: '/app/#reset', 'data-go': 'reset' }, a.reset),
    h('p', { class: 'muted', style: { margin: 0, fontSize: '14px' } }, a.code));
}

const root = document.getElementById('gp');
document.documentElement.lang = getLang();

function draw() {
  const tab = TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'app';
  const lang = getLang();
  const body = h('div');
  mount(root,
    h('header', {},
      h('img', { src: '/icons/icon-64.png', alt: '', width: 36, height: 36, style: { borderRadius: '9px' } }),
      h('h1', { class: 'grow' }, TITLE[lang] || TITLE.en),
      h('a', { class: 'btn-link primary', href: '/app/', 'data-go': 'top' }, (ACCOUNT[lang] || ACCOUNT.en).signin, ' / ', (ACCOUNT[lang] || ACCOUNT.en).create),
      h('select', { style: { width: 'auto' }, 'aria-label': 'Language', onchange: (e) => { setLang(e.target.value); draw(); } },
        LANGS.map(([code, name]) => h('option', { value: code, selected: code === lang }, name)))),
    h('div', { class: 'tabs' }, Object.entries(TABS).map(([k, v]) => h('button', {
      class: k === tab ? 'on' : '', onclick: () => { location.hash = k; },
    }, v.label[lang] || v.label.en))),
    body);
  if (tab === 'account') {
    const guide = h('div');
    mount(body, h('div', { class: 'gp-split' }, guide, accountPanel(lang)));
    renderGuide(guide, TABS[tab].guide, null);
  } else {
    renderGuide(body, TABS[tab].guide, null);
  }
}

window.addEventListener('hashchange', draw);
draw();
