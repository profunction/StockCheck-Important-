/**
 * SuXin Every Data, on its own page: the owner's look at the whole business
 * -- today's sales, the stock, the warehouse -- without the till around it
 * (dashboard.js draws it). The till's old address, /pos/#/cloud, comes here.
 */
import { h, mount } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { session } from '../js/session.js';
import { APPS, appState, appSwitcher, langPicker, signOutNow, startApp, themeToggle } from '../js/apps.js';
import { guardTillLock } from '../js/tilllock.js';
import { helpFab } from '../js/pagehelp.js';
import { render as dashboard } from '../js/dashboard.js';
import '../js/strings-pro.js';

const app = document.getElementById('app');
const ME = APPS.find((a) => a.id === 'cloud');

function shell() {
  if (guardTillLock()) return;
  const main = h('main', { class: 'cnt-main data-main' });
  mount(app, h('div', { class: 'cnt data' },
    h('header', { class: 'cnt-top' },
      h('a', { class: 'brandmark', href: '/data/' }, h('img', { src: '/icons/icon-192.png?v=4', alt: '', width: 30, height: 30 }), ME.name),
      h('span', { class: 'grow' }),
      appSwitcher('cloud'),
      h('a', { class: 'btn ghost icon-btn', href: '/guide/#cloud', title: t('posGuide'), 'aria-label': t('posGuide'), 'data-act': 'guide' }, icon('book', 18)),
      themeToggle(),
      langPicker(),
      h('button', { class: 'ghost icon-btn', title: t('signOut'), 'aria-label': t('signOut'), onclick: signOutNow }, icon('logout', 18))),
    main));
  const state = appState(session, ME);
  if (state === 'open') dashboard(main);
  else mount(main, h('div', { class: 'card' }, h('p', {}, t(state === 'locked' ? 'appLocked' : 'appDenied')), h('a', { href: '/app/' }, `${t('appAll')} →`)));
  helpFab(() => 'data-home');
}

startApp(app, {
  name: ME.name, logo: '/icons/icon-192.png?v=4', tagline: t('dashLead'),
  features: [['chart', t('dashToday')], ['box', t('dashStock')], ['apps', t('appSwitch')]],
  foot: 'SuXin · Malaysia',
}, shell);
