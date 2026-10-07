/**
 * The JEXO app centre (/app/): sign in once, then choose JEXO Count, JEXO
 * POS, JEXO Cloud or JEXO Warehouse. What the plan includes opens; the rest
 * is shown locked with where to add it (apps.js decides which is which).
 */
import { h, mount } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { PLANS } from '../js/plans.js';
import { session } from '../js/session.js';
import { APPS, appState, langPicker, signOutNow, startApp } from '../js/apps.js';
import { guardTillLock } from '../js/tilllock.js';
import '../js/strings-pro.js';

const app = document.getElementById('app');

function render() {
  if (guardTillLock()) return;
  const plan = session.licence ? PLANS[session.licence.plan]?.label || session.licence.plan : '';
  mount(app, h('div', { class: 'hub' },
    h('header', { class: 'hub-top' },
      h('div', { class: 'brandmark' }, h('img', { src: '/icons/icon-192.png', alt: '', width: 34, height: 34 }), 'JEXO'),
      h('span', { class: 'grow' }),
      h('a', { class: 'btn ghost', href: '/guide/#account', 'data-act': 'guide' }, icon('check', 17), t('posGuide')),
      langPicker(),
      h('button', { class: 'ghost', onclick: signOutNow }, icon('logout', 17), t('signOut'))),
    h('main', { class: 'hub-main' },
      h('h1', {}, t('appCentre')),
      h('p', { class: 'muted' }, `${session.name} · ${session.companyName || ''}`),
      h('p', { class: 'hub-plan' }, h('span', { class: 'muted' }, `${t('appPlan')}: `), h('b', {}, plan || t('appNoPlan'))),
      h('p', { class: 'muted', style: { maxWidth: '60ch' } }, t('appCentreLead')),
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
}

startApp(app, {
  name: 'JEXO', logo: '/icons/icon-192.png', tagline: 'One Business. Connected.',
  features: APPS.map((a) => [a.icon, `${a.name} — ${t(`app_${a.id}`)}`]),
  foot: 'JEXO · Malaysia',
}, render);
