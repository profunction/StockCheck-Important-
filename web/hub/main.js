/**
 * The SuXin app centre (/app/): sign in once, then choose SuXin Barcode Scan, SuXin
 * POS, SuXin Every Data or SuXin WMS. What the plan includes opens; the rest
 * is shown locked with where to add it (apps.js decides which is which).
 */
import { h, mount } from '../js/dom.js';
import { addStrings, t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { PLANS } from '../js/plans.js';
import { session } from '../js/session.js';
import { APPS, appState, langPicker, signOutNow, startApp, themeToggle } from '../js/apps.js';
import { guardTillLock } from '../js/tilllock.js';
import { helpFab } from '../js/pagehelp.js';
import '../js/strings-pro.js';

// The plan's name in the page's language ("Trial" is 试用 in Chinese).
addStrings({
  zh: { plan_TRIAL: '试用' },
  ms: { plan_TRIAL: 'Percubaan' },
});
const planName = (id) => (t(`plan_${id}`) !== `plan_${id}` ? t(`plan_${id}`) : PLANS[id]?.label || id);

const app = document.getElementById('app');

function render() {
  if (guardTillLock()) return;
  const plan = session.licence ? planName(session.licence.plan) : '';
  mount(app, h('div', { class: 'hub' },
    h('header', { class: 'hub-top' },
      h('div', { class: 'brandmark' }, h('img', { src: '/icons/icon-192.png', alt: '', width: 34, height: 34 }), 'SuXin'),
      h('span', { class: 'grow' }),
      h('a', { class: 'btn ghost', href: '/guide/#account', 'data-act': 'guide' }, icon('book', 17), t('posGuide')),
      themeToggle(),
      langPicker(),
      h('button', { class: 'ghost', onclick: signOutNow }, icon('logout', 17), t('signOut'))),
    h('main', { class: 'hub-main' },
      h('h1', {}, t('appCentre')),
      h('p', { class: 'muted' }, `${session.name} · ${session.companyName || ''}`),
      h('p', { class: 'hub-plan' }, h('span', { class: 'muted' }, `${t('appPlan')}: `), h('b', {}, plan || t('appNoPlan'))),
      h('p', { class: 'muted', style: { maxWidth: '60ch' } }, t('appCentreLead'),
        ' ', h('a', { href: '/download/', 'data-act': 'download' }, `${t('appDownload')} →`)),
      h('div', { class: 'hub-grid' }, APPS.map((a) => {
        const state = appState(session, a);
        const open = state === 'open';
        return h(open ? 'a' : 'div', {
          class: `hub-app${open ? '' : ' locked'}`, 'data-app': a.id, 'data-state': state,
          ...(open ? { href: a.href } : {}),
          style: { '--app': a.color },
        },
        h('span', { class: 'hub-ic' }, icon(open ? a.icon : 'lock', 28)),
        h('b', {}, a.name),
        h('span', { class: 'muted' }, t(`app_${a.id}`)),
        open ? h('span', { class: 'hub-go' }, `${t('appOpen')} →`)
          : state === 'locked'
            ? h('span', { class: 'hub-lock' }, t('appLocked'), ' · ',
              h('a', { href: session.isAdmin ? '/pos/#/settings/addons' : '/#pricing' }, `${t('appBuy')} →`))
            : h('span', { class: 'hub-lock' }, t('appDenied')));
      })))));
  helpFab(() => 'hub');
}

startApp(app, {
  name: 'SuXin', logo: '/icons/icon-192.png', tagline: t('brandTagline'),
  features: APPS.map((a) => [a.icon, `${a.name} — ${t(`app_${a.id}`)}`]),
  foot: 'SuXin · Malaysia',
}, render);
