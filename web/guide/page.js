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
  renderGuide(body, TABS[tab].guide, null);
}

window.addEventListener('hashchange', draw);
draw();
