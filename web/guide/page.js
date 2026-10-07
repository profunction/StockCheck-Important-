/**
 * /guide/: every product's step-by-step guide on one public page -- what the
 * phone app's "How to use" opens, and somewhere to send a new customer.
 * #app, #pos or #warehouse picks the tab.
 */
import { h, mount } from '../js/dom.js';
import { getLang, LANGS, setLang } from '../js/i18n.js';
import { renderGuide } from '../js/guide.js';
import { APP_GUIDE, POS_GUIDE, WAREHOUSE_GUIDE } from '../js/guides.js';

const TABS = {
  app: { guide: APP_GUIDE, label: { zh: 'Stock Check 手机 app', en: 'Stock Check app', ms: 'Aplikasi Stock Check' } },
  pos: { guide: POS_GUIDE, label: { zh: 'Pos Stock Check 收银', en: 'Pos Stock Check (till)', ms: 'Pos Stock Check (POS)' } },
  warehouse: { guide: WAREHOUSE_GUIDE, label: { zh: '仓库系统', en: 'Warehouse system', ms: 'Sistem gudang' } },
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
