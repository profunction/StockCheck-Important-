/**
 * JEXO Count on the web: stock counting in a browser, on a computer or a
 * phone, writing the very same stock checks as the JEXO Count Android app
 * (workspaces/{ws}/stockChecks/{id}, its lines under items/). A count
 * started here can be finished on a phone and the other way round; the
 * till, the warehouse and the back office read it the moment it is saved.
 *
 *   #/            the counts: mine, or everyone's for whoever may see them
 *   #/new         start a count: branch, area, note
 *   #/c/<id>      counting (count.js)
 */
import {
  collection, db, doc, getDocs, limit, orderBy, query, runTransaction, where, writeBatch,
} from '../js/fb.js';
import { dateTime, h, mount, toast } from '../js/dom.js';
import { addStrings, t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { formatQty } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { appSwitcher, langPicker, signOutNow, startApp } from '../js/apps.js';
import { period, refNo, tempRefNo } from '../js/counting.js';
import { guardTillLock } from '../js/tilllock.js';
import { STRINGS } from './strings.js';
import '../js/strings-pro.js';

addStrings(STRINGS);
const app = document.getElementById('app');
let mainEl;
let stopPage = null;

export const canCount = () => session.has('count') && session.can('CREATE_STOCK_CHECK');
export const statusPill = (status) => h('span', { class: `pill${status === 'IN_PROGRESS' ? ' warn' : status === 'DRAFT' ? '' : ' good'}` }, t(`cst_${status}`) || status);

/** An audit entry, as the app writes it: who did what to which count. */
export function audit(batch, entity, entityId, entityLabel, action, stockCheckId, { field = '', oldValue = '', newValue = '' } = {}) {
  batch.set(doc(collection(db, ws('auditLog'))), {
    stockCheckId, entity, entityId, entityLabel, action, field, oldValue: String(oldValue), newValue: String(newValue),
    actorUid: session.uid, actorName: session.name, at: Date.now(),
  });
}

function shell() {
  if (guardTillLock()) return;
  mainEl = h('main', { class: 'cnt-main' });
  mount(app, h('div', { class: 'cnt' },
    h('header', { class: 'cnt-top' },
      h('a', { class: 'brandmark', href: '#/' }, h('img', { src: '/icons/icon-192.png', alt: '', width: 30, height: 30 }), 'JEXO Count'),
      h('span', { class: 'grow' }),
      appSwitcher('count'),
      h('a', { class: 'btn ghost icon-btn', href: '/guide/#app', title: t('posGuide'), 'aria-label': t('posGuide'), 'data-act': 'guide' }, icon('check', 18)),
      langPicker(),
      h('button', { class: 'ghost icon-btn', title: t('signOut'), 'aria-label': t('signOut'), onclick: signOutNow }, icon('logout', 18))),
    mainEl));
  route();
}

export function go(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}

async function route() {
  stopPage?.();
  stopPage = null;
  window.scrollTo(0, 0);
  const [page = '', id = ''] = location.hash.replace(/^#\/?/, '').split('/');
  if (!session.has('count')) {
    mount(mainEl, h('div', { class: 'card' }, h('p', {}, t('cPlanNo')), h('a', { href: '/app/' }, `${t('appAll')} →`)));
    return;
  }
  if (page === 'new') return newCount();
  if (page === 'c' && id) {
    const m = await import('./count.js');
    stopPage = m.render(mainEl, id) || null;
    return;
  }
  list();
}

// ------------------------------------------------------------------ list

let scope = 'mine';

async function loadCounts() {
  const col = collection(db, ws('stockChecks'));
  const mine = query(col, where('createdByUid', '==', session.uid));
  let queries = [mine];
  if (scope === 'all' && session.can('VIEW_ALL_HISTORY')) {
    queries = session.branchIds.length
      ? [mine, query(col, where('branchId', 'in', [...session.branchIds, ''].slice(0, 10)))]
      : [query(col, orderBy('createdAt', 'desc'), limit(200))];
  }
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  return [...new Map(snaps.flatMap((s) => s.docs).map((d) => [d.id, { ...d.data(), id: d.id }])).values()]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function list() {
  const box = h('div', { class: 'cnt-list' }, h('p', { class: 'muted' }, t('loading')));
  const tabs = session.can('VIEW_ALL_HISTORY') ? h('div', { class: 'seg' },
    [['mine', 'cMine'], ['all', 'cAll']].map(([id, key]) => h('button', { class: scope === id ? 'on' : '', onclick: () => { scope = id; list(); } }, t(key)))) : null;
  mount(mainEl,
    h('div', { class: 'row', style: { alignItems: 'center', marginBottom: '6px' } },
      h('h1', { class: 'grow', style: { margin: 0 } }, t('cTitle')),
      canCount() ? h('button', { class: 'primary', onclick: () => go('#/new') }, icon('plus', 18), t('cNew')) : null),
    h('p', { class: 'muted' }, t('cAppHint')),
    !canCount() ? h('p', { class: 'card' }, t('cNoCreate')) : null,
    tabs, box);
  loadCounts().then((rows) => {
    mount(box, rows.length ? rows.map((c) => h('a', { class: 'cnt-card', href: `#/c/${c.id}` },
      h('div', { class: 'row' }, h('strong', { class: 'grow' }, c.refNo || c.id), statusPill(c.status)),
      h('div', {}, [c.branchName, c.zone].filter(Boolean).join(' · ') || ' '),
      h('div', { class: 'muted' }, `${c.itemCount || 0} ${t('cItems')} · ${t('cTotal')} ${formatQty(c.totalQuantityMilli ?? (c.totalQuantity || 0) * 1000)} · ${t('cBy')} ${c.createdByName || ''} · ${dateTime(c.createdAt)}`)))
      : h('p', { class: 'muted' }, t('cNone')));
  }).catch((err) => mount(box, h('p', { class: 'card' }, `${t('errLoad')}: ${err.message || err}`)));
}

// -------------------------------------------------------------- new count

/** Claims the month's next reference number, as the app does (meta/counters). */
async function nextRef(now) {
  const key = period(now);
  try {
    const seq = await runTransaction(db, async (tx) => {
      const ref = doc(db, ws('meta/counters'));
      const snap = await tx.get(ref);
      const taken = (snap.exists() ? snap.data()?.[key] : 0) || 0;
      tx.set(ref, { [key]: taken + 1 }, { merge: true });
      return taken + 1;
    });
    return refNo(now, seq);
  } catch {
    toast(t('cTempRef'));
    return tempRefNo(now);
  }
}

function newCount() {
  if (!canCount()) { go('#/'); return; }
  const places = session.sellableBranches();
  const branch = places.length ? h('select', {}, places.map((b) => h('option', { value: b.id, selected: b.id === session.branchId }, b.name))) : null;
  const zone = h('input', { placeholder: 'A, B, Cold room…', autocomplete: 'off' });
  const note = h('input', {});
  const start = h('button', { class: 'primary', type: 'submit' }, icon('barcode', 18), t('cStart'));
  mount(mainEl,
    h('div', { class: 'row', style: { marginBottom: '10px' } }, h('a', { href: '#/' }, `← ${t('cTitle')}`)),
    h('h1', {}, t('cNew')),
    h('form', {
      class: 'card', style: { display: 'grid', gap: '14px', maxWidth: '560px' },
      onsubmit: async (e) => {
        e.preventDefault();
        start.disabled = true;
        const now = new Date();
        const id = doc(collection(db, ws('stockChecks'))).id;
        const branchId = branch?.value ?? '';
        const check = {
          refNo: await nextRef(now), templateId: '', templateName: '', status: 'IN_PROGRESS',
          createdByUid: session.uid, createdByName: session.name, createdAt: now.getTime(), updatedAt: now.getTime(),
          completedAt: null, reviewedByUid: null, reviewedByName: null, lockedByUid: null,
          itemCount: 0, totalQuantity: 0, totalQuantityMilli: 0, photoCount: 0,
          zone: zone.value.trim(), branchId, branchName: branchId ? session.branchName(branchId) : '', note: note.value.trim(),
        };
        const batch = writeBatch(db);
        batch.set(doc(db, ws(`stockChecks/${id}`)), check);
        audit(batch, 'StockCheck', id, check.refNo, 'CREATE', id);
        // Not awaited: with no signal the count starts anyway and is sent later.
        batch.commit().catch((err) => toast(err.message || String(err), 'error'));
        go(`#/c/${id}`);
      },
    },
    branch ? h('label', { class: 'field' }, t('cBranch'), branch) : null,
    h('label', { class: 'field' }, t('cZone'), zone),
    h('label', { class: 'field' }, t('cNote'), note),
    start));
  zone.focus();
}

window.addEventListener('hashchange', () => { if (session.uid && mainEl) route(); });

startApp(app, {
  name: 'JEXO Count', logo: '/icons/icon-192.png', tagline: t('cAppHint'),
  features: [['barcode', t('cScan')], ['wifiOff', t('signFeat3')], ['apps', t('appSwitch')]],
  foot: 'JEXO · One Business. Connected.',
}, shell, { stop: () => { stopPage?.(); stopPage = null; mainEl = null; } });
