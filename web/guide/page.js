/**
 * /guide/: every product's step-by-step guide on one public page -- what the
 * phone app's "How to use" opens, and somewhere to send a new customer.
 * #app, #pos, #warehouse, #cloud or #account picks the tab.
 */
import { h, mount } from '../js/dom.js';
import { getLang, LANGS, setLang } from '../js/i18n.js';
import { renderGuide } from '../js/guide.js';
import { ACCOUNT_GUIDE, APP_GUIDE, CLOUD_GUIDE, POS_GUIDE, WAREHOUSE_GUIDE } from '../js/guides.js';
import { PAGES, TILL, helpVideo } from '../js/helpdata.js';

/** A guide made of the apps' own per-page (or per-button) tutorials. */
const fromHelp = (entries, intro) => Object.fromEntries(['zh', 'en', 'ms'].map((lang, i) => [lang, {
  intro: intro[i],
  sections: Object.entries(entries).map(([key, e]) => ({ id: key, title: e.title[i], video: helpVideo(key), steps: e.steps.map((s) => s.say[i]) })),
}]));
const TILL_GUIDE = fromHelp(TILL, [
  '收银画面上每一个按钮的短片。收银时按「教学」，再点任何按钮，也会播放它的短片。',
  'A short video for every button on the till. At the till, press How to, then tap any button to see it.',
  'Video pendek untuk setiap butang kaunter. Di kaunter, tekan Tutorial, kemudian tekan mana-mana butang.',
]);
const PAGES_GUIDE = fromHelp(PAGES, [
  '每一页自己的短片。在 app 里，每一页右下角的「▶ 教学」也会播放。',
  'Every page\'s own short video. In the apps, the ▶ How to button at the bottom right plays it too.',
  'Video pendek setiap halaman. Dalam aplikasi, butang ▶ Tutorial di kanan bawah juga memainkannya.',
]);

const TABS = {
  account: { guide: ACCOUNT_GUIDE, label: { zh: '账号和注册', en: 'Account & sign-up', ms: 'Akaun & daftar' } },
  app: { guide: APP_GUIDE, label: { zh: 'SuXin Count（手机 + 网页）', en: 'SuXin Count (phone + web)', ms: 'SuXin Count (telefon + web)' } },
  pos: { guide: POS_GUIDE, label: { zh: 'SuXin POS 收银', en: 'SuXin POS (till)', ms: 'SuXin POS (POS)' } },
  warehouse: { guide: WAREHOUSE_GUIDE, label: { zh: 'SuXin Warehouse 仓库', en: 'SuXin Warehouse', ms: 'SuXin Warehouse (gudang)' } },
  cloud: { guide: CLOUD_GUIDE, label: { zh: 'SuXin Cloud 老板总览', en: 'SuXin Cloud', ms: 'SuXin Cloud' } },
  till: { guide: TILL_GUIDE, label: { zh: '收银每个按钮', en: 'Every till button', ms: 'Setiap butang kaunter' } },
  pages: { guide: PAGES_GUIDE, label: { zh: '每一页的教学', en: 'Every page', ms: 'Setiap halaman' } },
};
const TITLE = { zh: '使用教程', en: 'How to use', ms: 'Cara guna' };

/**
 * Beside each guide: straight into the app it teaches (or, for the account
 * guide, sign in and register -- register asks for the company code).
 */
const SIDE = {
  account: [['/app/#signin', { zh: '登录', en: 'Sign in', ms: 'Log masuk' }], ['/app/#create', { zh: '注册', en: 'Register', ms: 'Daftar' }]],
  app: [['/count/', { zh: '打开网页版盘点', en: 'Open Count on the web', ms: 'Buka Count di web' }], ['/download/', { zh: '下载 app', en: 'Get the app', ms: 'Muat turun aplikasi' }]],
  pos: [['/pos/#/pos', { zh: '打开收银', en: 'Open the till', ms: 'Buka kaunter' }], ['/download/', { zh: '下载 app', en: 'Get the app', ms: 'Muat turun aplikasi' }]],
  warehouse: [['/warehouse/', { zh: '打开仓库', en: 'Open the warehouse', ms: 'Buka gudang' }], ['/download/', { zh: '下载 app', en: 'Get the app', ms: 'Muat turun aplikasi' }]],
  till: [['/pos/#/pos', { zh: '打开收银', en: 'Open the till', ms: 'Buka kaunter' }], ['/download/', { zh: '下载 app', en: 'Get the app', ms: 'Muat turun aplikasi' }]],
  pages: [['/app/', { zh: '打开应用中心', en: 'Open the app centre', ms: 'Buka pusat aplikasi' }], ['/download/', { zh: '下载 app', en: 'Get the app', ms: 'Muat turun aplikasi' }]],
  cloud: [['/pos/#/cloud', { zh: '打开 Cloud', en: 'Open Cloud', ms: 'Buka Cloud' }], ['/download/', { zh: '下载 app', en: 'Get the app', ms: 'Muat turun aplikasi' }]],
};

function sidePanel(tab, lang) {
  // The second button is the one to press for signing up; elsewhere the first.
  const main = tab === 'account' ? 1 : 0;
  return h('aside', { class: 'acct' }, (SIDE[tab] || []).map(([href, label], i) => h('a', {
    class: `btn-link${i === main ? ' primary' : ''}`, href, 'data-go': href.replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''),
  }, label[lang] || label.en)));
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
      h('select', { style: { width: 'auto' }, 'aria-label': 'Language', onchange: (e) => { setLang(e.target.value); draw(); } },
        LANGS.map(([code, name]) => h('option', { value: code, selected: code === lang }, name)))),
    h('div', { class: 'tabs' }, Object.entries(TABS).map(([k, v]) => h('button', {
      class: k === tab ? 'on' : '', onclick: () => { location.hash = k; },
    }, v.label[lang] || v.label.en))),
    body);
  const guide = h('div');
  mount(body, h('div', { class: 'gp-split' }, guide, sidePanel(tab, lang)));
  renderGuide(guide, TABS[tab].guide, null);
}

window.addEventListener('hashchange', draw);
draw();
