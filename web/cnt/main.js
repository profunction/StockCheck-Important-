/**
 * SuXin Barcode Scan on the web: stock counting in a browser, on a computer or a
 * phone, writing the very same stock checks as the SuXin Barcode Scan Android app
 * (workspaces/{ws}/stockChecks/{id}, its lines under items/). A count
 * started here can be finished on a phone and the other way round; the
 * till, the warehouse and the back office read it the moment it is saved.
 *
 *   #/            the counts: mine, or everyone's for whoever may see them
 *   #/new         start a count: count list (template), branch, area, note
 *   #/c/<id>      counting (count.js)
 *   #/p/<id>      the count's photos (photos.js)
 */
import {
  collection, db, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, updateDoc, where, writeBatch,
} from '../js/fb.js';
import { dateTime, h, modal, mount, toast } from '../js/dom.js';
import { addStrings, t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { formatQty } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { APPS, appState, appSwitcher, langPicker, signOutNow, startApp, themeToggle } from '../js/apps.js';
import { period, refNo, tempRefNo } from '../js/counting.js';
import { matchesSearch } from '../js/countexport.js';
import { deleteCounts, exportCounts, mayDelete, mayExport } from './manage.js';
import { guardTillLock } from '../js/tilllock.js';
import { helpFab } from '../js/pagehelp.js';
import { STRINGS } from './strings.js';
import '../js/strings-pro.js';

addStrings(STRINGS);
const app = document.getElementById('app');
let mainEl;
let stopPage = null;

export const canCount = () => session.has('count') && session.can('CREATE_STOCK_CHECK');
export const statusPill = (status) => h('span', { class: `pill${status === 'IN_PROGRESS' ? ' warn' : status === 'DRAFT' ? '' : status === 'LOCKED' ? ' locked' : ' good'}` }, t(`cst_${status}`) || status);

/** The app writes status names in English in the change history; so does this. */
export const STATUS_EN = { DRAFT: 'Draft', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', REVIEWED: 'Reviewed', LOCKED: 'Locked' };

/** An audit entry, as the app writes it: who did what to which count. */
export function audit(batch, entity, entityId, entityLabel, action, stockCheckId, { field = '', oldValue = '', newValue = '' } = {}) {
  batch.set(doc(collection(db, ws('auditLog'))), {
    stockCheckId, entity, entityId, entityLabel, action, field, oldValue: String(oldValue), newValue: String(newValue),
    actorUid: session.uid, actorName: session.name, at: Date.now(),
  });
}

/** On a phone everything but the name folds into one menu button. */
function phoneMenu() {
  modal((close) => [
    h('h2', {}, 'SuXin Barcode Scan'),
    h('div', { class: 'cnt-menu' },
      APPS.filter((a) => a.id !== 'count' && appState(session, a) === 'open').map((a) => h('a', { class: 'btn-link', href: a.href }, icon(a.icon, 18), a.name)),
      h('a', { class: 'btn-link', href: '/app/' }, icon('apps', 18), t('appAll')),
      h('hr'),
      h('a', { class: 'btn-link', href: '/guide/#app' }, icon('book', 18), t('posGuide')),
      themeToggle(),
      h('label', { class: 'field' }, 'Language / 语言', langPicker()),
      h('button', { onclick: () => { close(); signOutNow(); } }, icon('logout', 18), t('signOut'))),
  ]);
}

function shell() {
  if (guardTillLock()) return;
  mainEl = h('main', { class: 'cnt-main' });
  mount(app, h('div', { class: 'cnt' },
    h('header', { class: 'cnt-top' },
      h('a', { class: 'brandmark', href: '#/' }, h('img', { src: '/icons/icon-192.png?v=4', alt: '', width: 30, height: 30 }), h('span', {}, 'SuXin ', h('b', {}, 'Barcode Scan'))),
      h('span', { class: 'grow' }),
      h('div', { class: 'cnt-top-wide' },
        appSwitcher('count'),
        h('a', { class: 'btn ghost icon-btn', href: '/guide/#app', title: t('posGuide'), 'aria-label': t('posGuide'), 'data-act': 'guide' }, icon('book', 18)),
        themeToggle(),
        langPicker(),
        h('button', { class: 'ghost icon-btn', title: t('signOut'), 'aria-label': t('signOut'), onclick: signOutNow }, icon('logout', 18))),
      h('button', { class: 'ghost icon-btn cnt-top-menu', 'aria-label': t('cMenu'), 'data-act': 'top-menu', onclick: phoneMenu }, icon('menu', 22))),
    mainEl));
  helpFab(() => {
    const page = location.hash.replace(/^#\/?/, '').split('/')[0];
    return page === 'new' ? 'cnt-new' : page === 'c' || page === 'p' ? 'cnt-count' : 'cnt-list';
  });
  route();
}

export function go(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}

async function route() {
  stopPage?.();
  stopPage = null;
  window.scrollTo(0, 0);
  const [path, search = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [page = '', id = ''] = path.split('/');
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
  if (page === 'reports') {
    const m = await import('./reports.js');
    stopPage = m.render(mainEl) || null;
    return;
  }
  if (page === 'lists') {
    const m = await import('./lists.js');
    stopPage = m.render(mainEl, id) || null;
    return;
  }
  if (page === 'p' && id) {
    const m = await import('./photos.js');
    stopPage = m.render(mainEl, id, new URLSearchParams(search)) || null;
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

function countCard(c) {
  const where = [c.branchName, c.zone].filter(Boolean).join(' · ');
  const stat = (ic, text) => h('span', { class: 'cnt-stat' }, icon(ic, 15), text);
  return h('a', { class: `cnt-card${c.status === 'IN_PROGRESS' ? ' open' : ''}`, href: `#/c/${c.id}` },
    h('div', { class: 'cnt-card-top' }, h('strong', { class: 'grow mono' }, c.refNo || c.id), statusPill(c.status)),
    where || c.templateName ? h('div', { class: 'cnt-card-where' }, [where, c.templateName].filter(Boolean).join(' · ')) : null,
    h('div', { class: 'cnt-card-stats' },
      stat('barcode', `${c.itemCount || 0} ${t('cItems')}`),
      stat('box', `${formatQty(c.totalQuantityMilli ?? (c.totalQuantity || 0) * 1000)} ${t('cTotal')}`),
      c.photoCount ? stat('camera', String(c.photoCount)) : null),
    h('div', { class: 'cnt-card-who muted' }, [c.createdByName, c.createdAt ? dateTime(c.createdAt) : ''].filter(Boolean).join(' · ')));
}

/** The app's three places: the counts, comparing them, and the count lists. */
export function tabs(current) {
  const may = (p) => session.isAdmin || session.can(p);
  const items = [['', 'barcode', 'cTitle'], ['reports', 'chart', 'crTitle'], may('VIEW_TEMPLATE') || may('CREATE_TEMPLATE') ? ['lists', 'book', 'clTitle'] : null].filter(Boolean);
  return h('nav', { class: 'cnt-tabs' }, items.map(([page, ic, key]) => h('a', { href: `#/${page}`, class: page === current ? 'on' : '', 'data-tab': page || 'counts' }, icon(ic, 17), t(key))));
}

const filters = { text: '', status: '', branch: '' };
let selecting = new Set();

function list() {
  const box = h('div', { class: 'cnt-list' }, h('p', { class: 'muted' }, t('loading')));
  const selBar = h('div', {});
  let rows = [];
  const scopeTabs = session.can('VIEW_ALL_HISTORY') ? h('div', { class: 'seg' },
    [['mine', 'cMine'], ['all', 'cAll']].map(([id, key]) => h('button', { class: scope === id ? 'on' : '', onclick: () => { scope = id; selecting = new Set(); list(); } }, t(key)))) : null;
  const search = h('input', { placeholder: t('cSearch'), value: filters.text, oninput: (e) => { filters.text = e.target.value; draw(); } });
  const statusChips = h('div', { class: 'chips-row cnt-filter' });
  const branchChips = h('div', { class: 'chips-row cnt-filter' });

  const shown = () => rows.filter((c) => matchesSearch(c, filters.text) && (!filters.status || c.status === filters.status) && (!filters.branch || (c.branchId || '') === filters.branch));
  const paintChips = () => {
    mount(statusChips, ['', 'IN_PROGRESS', 'COMPLETED', 'REVIEWED', 'LOCKED'].map((st) => h('button', {
      type: 'button', class: filters.status === st ? 'on' : '', onclick: () => { filters.status = st; draw(); },
    }, st ? t(`cst_${st}`) : t('cAllStatus'))));
    const branches = [...new Map(rows.filter((c) => c.branchId).map((c) => [c.branchId, c.branchName || c.branchId])).entries()];
    mount(branchChips, branches.length > 1 ? [['', t('cAllBranches')], ...branches].map(([id, name]) => h('button', {
      type: 'button', class: filters.branch === id ? 'on' : '', onclick: () => { filters.branch = id; draw(); },
    }, name)) : null);
  };
  const drawSel = () => {
    const picked = rows.filter((c) => selecting.has(c.id));
    mount(selBar, picked.length ? h('div', { class: 'cnt-selbar card' },
      h('button', { class: 'ghost icon-btn', 'aria-label': t('cancel'), onclick: () => { selecting = new Set(); draw(); } }, icon('times', 18)),
      h('b', { class: 'grow' }, `${picked.length} ${t('cSelected')}`),
      mayExport() ? h('button', { 'data-act': 'export-selected', onclick: () => exportCounts(picked) }, icon('download', 17), t('cxTitle')) : null,
      picked.some(mayDelete) ? h('button', { class: 'danger', 'data-act': 'delete-selected', onclick: async () => { if (await deleteCounts(picked)) { selecting = new Set(); list(); } } }, icon('trash', 17)) : null) : null);
  };
  const card = (c) => {
    const el = countCard(c);
    const tick = h('input', { type: 'checkbox', class: 'cnt-tick', checked: selecting.has(c.id), 'aria-label': c.refNo,
      onclick: (e) => { e.stopPropagation(); if (e.target.checked) selecting.add(c.id); else selecting.delete(c.id); drawSel(); el.classList.toggle('picked', e.target.checked); } });
    el.prepend(tick);
    if (selecting.has(c.id)) el.classList.add('picked');
    // While picking, a tap picks rather than opens: a mis-tap must not lose the selection.
    el.addEventListener('click', (e) => { if (selecting.size && e.target !== tick) { e.preventDefault(); tick.click(); } });
    return el;
  };
  const draw = () => {
    paintChips();
    drawSel();
    const list = shown();
    const open = list.filter((c) => ['DRAFT', 'IN_PROGRESS'].includes(c.status));
    const done = list.filter((c) => !['DRAFT', 'IN_PROGRESS'].includes(c.status));
    mount(box, list.length ? [
      open.length ? h('div', { class: 'cnt-group' }, h('h3', {}, `${t('cOpenNow')} · ${open.length}`), open.map(card)) : null,
      done.length ? h('div', { class: 'cnt-group' }, h('h3', {}, `${t('cDoneList')} · ${done.length}`), done.map(card)) : null,
    ] : h('div', { class: 'cnt-empty-big' }, icon('barcode', 40), h('p', {}, rows.length ? t('cNoMatch') : t('cNone'))));
  };

  mount(mainEl,
    tabs(''),
    h('div', { class: 'cnt-titlebar' },
      h('h1', {}, t('cTitle')),
      mayExport() ? h('button', { class: 'ghost', 'data-act': 'export-shown', title: t('cxShown'), onclick: () => exportCounts(shown()) }, icon('download', 18), h('span', { class: 'hide-phone' }, t('cxTitle'))) : null,
      canCount() ? h('button', { class: 'primary', 'data-act': 'new-count', onclick: () => go('#/new') }, icon('plus', 18), t('cNew')) : null),
    !canCount() ? h('p', { class: 'card' }, t('cNoCreate')) : null,
    h('div', { class: 'cnt-filters' }, scopeTabs, h('div', { class: 'search-box grow' }, icon('search', 18), search)),
    statusChips, branchChips, selBar, box,
    h('p', { class: 'muted cnt-hint' }, t('cAppHint')));
  loadCounts().then((r) => { rows = r; draw(); }).catch((err) => mount(box, h('p', { class: 'card' }, `${t('errLoad')}: ${err.message || err}`)));
}

// -------------------------------------------------------------- new count

/** Claims the month's next reference number, as the app does (meta/counters). */
export async function nextRef(now) {
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

async function newCount() {
  if (!canCount()) { go('#/'); return; }
  const places = session.sellableBranches();
  const branch = places.length ? h('select', {}, places.map((b) => h('option', { value: b.id, selected: b.id === session.branchId }, b.name))) : null;
  const zone = h('input', { placeholder: t('cZoneHint'), autocomplete: 'off' });
  const zoneChips = h('div', { class: 'chips-row' });
  const note = h('input', {});
  const tpl = h('select', {}, h('option', { value: '' }, t('cNoTemplate')));
  const tplNote = h('small', { class: 'muted' });
  const start = h('button', { class: 'primary', type: 'submit' }, icon('barcode', 18), t('cStart'));
  let templates = [];
  let zones = [];
  const paintZones = () => mount(zoneChips, zones.map((z) => h('button', {
    type: 'button', class: zone.value.trim().toLowerCase() === z.toLowerCase() ? 'on' : '',
    onclick: () => { zone.value = zone.value.trim().toLowerCase() === z.toLowerCase() ? '' : z; paintZones(); },
  }, z)));
  zone.addEventListener('input', paintZones);
  const describe = () => {
    const chosen = templates.find((x) => x.id === tpl.value);
    tplNote.textContent = chosen ? [chosen.description, chosen.photoRequired ? t('cNeedPhotos').replace('{n}', chosen.minPhotos || 1) : '', chosen.fields?.length ? `${chosen.fields.length} ${t('cFieldsN')}` : ''].filter(Boolean).join(' · ') : t('cNoTemplateSub');
  };
  tpl.addEventListener('change', describe);
  describe();

  mount(mainEl,
    h('div', { class: 'row cnt-back' }, h('a', { href: '#/' }, `← ${t('cTitle')}`)),
    h('h1', {}, t('cNew')),
    h('form', {
      class: 'card cnt-newform',
      onsubmit: async (e) => {
        e.preventDefault();
        start.disabled = true;
        const now = new Date();
        const id = doc(collection(db, ws('stockChecks'))).id;
        const branchId = branch?.value ?? '';
        const chosen = templates.find((x) => x.id === tpl.value);
        const area = zone.value.trim();
        const check = {
          refNo: await nextRef(now), templateId: chosen?.id || '', templateName: chosen?.name || '', status: 'IN_PROGRESS',
          createdByUid: session.uid, createdByName: session.name, createdAt: now.getTime(), updatedAt: now.getTime(),
          completedAt: null, reviewedByUid: null, reviewedByName: null, lockedByUid: null,
          itemCount: 0, totalQuantity: 0, totalQuantityMilli: 0, photoCount: 0,
          zone: area, branchId, branchName: branchId ? session.branchName(branchId) : '', note: note.value.trim(),
        };
        const batch = writeBatch(db);
        batch.set(doc(db, ws(`stockChecks/${id}`)), check);
        audit(batch, 'StockCheck', id, check.refNo, 'CREATE', id);
        // Not awaited: with no signal the count starts anyway and is sent later.
        batch.commit().catch((err) => toast(err.message || String(err), 'error'));
        // A new area joins the company's list, so the next person taps it
        // instead of typing "cold room" beside "Cold Room". Best effort: only
        // an admin may write the list, and nobody's count waits on it.
        if (area && !zones.some((z) => z.toLowerCase() === area.toLowerCase())) {
          updateDoc(doc(db, ws('meta/config')), { zones: [...zones, area] }).catch(() => {});
        }
        go(`#/c/${id}`);
      },
    },
    h('label', { class: 'field' }, t('cTemplate'), tpl, tplNote),
    branch ? h('label', { class: 'field' }, t('cBranch'), branch) : null,
    h('label', { class: 'field' }, t('cZone'), zone, zoneChips),
    h('label', { class: 'field' }, t('cNote'), note),
    start));
  zone.focus();

  // The count lists and the company's areas fill in as they arrive.
  getDocs(collection(db, ws('templates'))).then((snap) => {
    templates = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((x) => x.active !== false).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    mount(tpl, h('option', { value: '' }, t('cNoTemplate')), templates.map((x) => h('option', { value: x.id }, x.name)));
    describe();
  }).catch(() => {});
  getDoc(doc(db, ws('meta/config'))).then((snap) => { zones = snap.data()?.zones || []; paintZones(); }).catch(() => {});
}

window.addEventListener('hashchange', () => { if (session.uid && mainEl) route(); });

startApp(app, {
  name: 'SuXin Barcode Scan', logo: '/icons/icon-192.png?v=4', tagline: t('cAppHint'),
  features: [['barcode', t('cScan')], ['wifiOff', t('signFeat3')], ['apps', t('appSwitch')]],
  foot: `SuXin · ${t('brandTagline')}`,
}, shell, { stop: () => { stopPage?.(); stopPage = null; mainEl = null; } });
