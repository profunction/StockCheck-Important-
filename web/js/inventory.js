/**
 * Inventory at the till: stock on hand and quick adjustments. Purchase
 * orders, receiving, transfers and suppliers are the warehouse system's.
 *
 * Everything that changes stock is a movement -- the same documents the
 * NEXO Count app writes -- so the app and the website always agree.
 */
import { collection, db, doc, getDocs, query, setDoc, where } from './fb.js';
import { dateTime, h, mount, toast } from './dom.js';
import { t } from './i18n.js';
import { formatQty, parseQty, rm } from './money.js';
import { isLow } from './ledger.js';
import { branchQuery, levelsFor, loadStockData } from './stockdata.js';
import { session, ws } from './session.js';
import { menuButton } from './main.js';
import { scanWithCamera } from './camera.js';

export function render(main, sub) {
  const pages = {
    levels: levelsPage,
    adjust: adjustPage,
    purchase: (m) => movedPage(m, t('invPurchase'), 'purchase'),
    transfers: (m) => movedPage(m, t('invTransfers'), 'transfers'),
    suppliers: (m) => movedPage(m, t('invSuppliers'), 'suppliers'),
  };
  (pages[sub] || levelsPage)(main);
  return null;
}

const head = (title, ...extra) => h('div', { class: 'page-head' }, menuButton(), h('h1', {}, title), h('span', { class: 'grow' }), ...extra);
const canMove = () => session.can('RECORD_STOCK_MOVEMENTS');
const allBranches = () => [{ id: '', name: t('mainShop') }, ...session.branches.filter((b) => b.active !== false)];
const productFor = (text) => session.find(text) ||
  session.products.find((p) => (p.name || '').toLowerCase() === String(text).trim().toLowerCase()) || null;

function movement(p, type, qtyMilli, branchId, reference, note) {
  const now = Date.now();
  return {
    barcode: p.barcode, productName: p.name || '', branchId, type, quantityMilli: qtyMilli, at: now,
    source: 'MANUAL', reference, note, createdByUid: session.uid, createdByName: session.name, createdAt: now,
  };
}

// --------------------------------------------------------------- stock levels

function levelsPage(main) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  let data = null;
  let branch = 'ALL';
  let filter = 'all';
  let q = '';
  const catalogue = new Map(session.products.map((p) => [p.barcode, p]));

  const draw = () => {
    if (!data) return;
    let rows = levelsFor(data, branch, catalogue);
    if (filter === 'low') rows = rows.filter(isLow);
    if (filter === 'uncounted') rows = rows.filter((r) => r.counted == null);
    const text = q.trim().toLowerCase();
    if (text) rows = rows.filter((r) => (r.name || '').toLowerCase().includes(text) || r.key.toLowerCase().includes(text));
    const value = rows.reduce((s, r) => s + Math.max(0, r.onHand) * (catalogue.get(r.key)?.costSen || 0) / 1000, 0);
    mount(box,
      h('div', { class: 'cards' },
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('itemsCount')), h('div', { class: 'value' }, String(rows.length))),
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('lowStock')), h('div', { class: 'value' }, String(rows.filter(isLow).length))),
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('stockValue')), h('div', { class: 'value' }, rm(Math.round(value))))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, [[t('name')], [t('lastCount')], [t('inSince'), 1], [t('outSince'), 1], [t('onHand'), 1]].map(([x, n]) => h('th', { class: n ? 'num' : '' }, x)))),
        h('tbody', {}, rows.slice(0, 1000).map((r) => h('tr', {},
          h('td', {}, h('div', {}, r.name || r.key), h('div', { class: 'muted', style: { fontSize: '12px' } }, r.barcode)),
          h('td', {}, r.counted == null ? h('span', { class: 'muted' }, t('neverCounted')) : `${formatQty(r.counted)} · ${dateTime(r.countedAt)}`),
          h('td', { class: 'num' }, r.inSince ? `+${formatQty(r.inSince)}` : ''),
          h('td', { class: 'num' }, r.outSince ? `−${formatQty(r.outSince)}` : ''),
          h('td', { class: 'num', style: { fontWeight: 700, color: isLow(r) ? 'var(--danger)' : '' } }, `${formatQty(r.onHand)} ${r.unit || ''}`)))))));
  };

  mount(main,
    head(t('invLevels'), h('button', { onclick: () => location.reload() }, `↻ ${t('refresh')}`)),
    h('p', { class: 'muted' }, t('levelsHelp')),
    h('div', { class: 'row', style: { marginBottom: '12px' } },
      h('input', { type: 'search', placeholder: t('searchProducts'), style: { maxWidth: '280px' }, oninput: (e) => { q = e.target.value; draw(); } }),
      h('select', { style: { width: 'auto' }, onchange: (e) => { filter = e.target.value; draw(); } },
        h('option', { value: 'all' }, t('all')), h('option', { value: 'low' }, t('lowStock')), h('option', { value: 'uncounted' }, t('neverCounted'))),
      session.branches.length ? h('select', { style: { width: 'auto' }, onchange: (e) => { branch = e.target.value; draw(); } },
        h('option', { value: 'ALL' }, t('allBranches')), allBranches().map((b) => h('option', { value: b.id }, b.name))) : null),
    box);
  loadStockData().then((d) => { data = d; draw(); }).catch((err) => mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message}`)));
}

// ----------------------------------------------------------------- adjust

function adjustPage(main) {
  const code = h('input', { placeholder: t('scanOrType'), autofocus: true, list: 'inv-products' });
  const type = h('select', {}, ['RECEIVE', 'WRITE_OFF'].map((k) => h('option', { value: k }, t(`move_${k}`))));
  const qty = h('input', { inputmode: 'decimal', placeholder: '0' });
  const note = h('input', { placeholder: t('noteRefHint') });
  const found = h('span', { class: 'muted' });
  const recent = h('div');
  code.addEventListener('input', () => {
    const p = productFor(code.value);
    found.textContent = p ? `${p.name || p.barcode} (${p.unit || 'pcs'})` : '';
  });
  const save = async () => {
    const p = productFor(code.value);
    const q = parseQty(qty.value);
    if (!p) return toast(t('notFound'), 'error');
    if (!q) return toast(t('errQty'), 'error');
    try {
      await setDoc(doc(collection(db, ws('movements'))), movement(p, type.value, q, session.branchId, '', note.value.trim()));
      toast(t('saved'), 'ok');
      code.value = ''; qty.value = ''; note.value = ''; found.textContent = '';
      code.focus();
      loadRecent();
    } catch (err) {
      toast(err.message || String(err), 'error');
    }
  };
  async function loadRecent() {
    const since = Date.now() - 30 * 24 * 3600 * 1000;
    const col = collection(db, ws('movements'));
    try {
      const snap = await getDocs(session.branchIds.length ? branchQuery(col) : query(col, where('at', '>=', since)));
      const rows = snap.docs.map((d) => d.data()).filter((m) => m.at >= since).sort((a, b) => b.at - a.at).slice(0, 200);
      mount(recent, h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, [t('date'), t('name'), t('type'), t('quantity'), t('branch'), t('employee')].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map((m) => h('tr', {},
          h('td', {}, dateTime(m.at)), h('td', {}, m.productName || m.barcode), h('td', {}, t(`move_${m.type}`)),
          h('td', { class: 'num' }, formatQty(m.quantityMilli)), h('td', {}, session.branchName(m.branchId || '')), h('td', {}, m.createdByName || '')))))));
    } catch (err) {
      mount(recent, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message}`));
    }
  }
  mount(main,
    head(t('invAdjust')),
    h('p', { class: 'muted' }, t('inventoryHelp')),
    canMove() ? h('div', { class: 'card', style: { display: 'grid', gap: '12px', maxWidth: '720px', marginBottom: '16px' } },
      h('label', { class: 'field' }, t('product'), h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        h('div', { class: 'grow', style: { flex: 1 } }, code),
        h('button', { type: 'button', title: t('scanCamera'), onclick: async () => { const c = await scanWithCamera(); if (c) { code.value = c; code.dispatchEvent(new Event('input')); } } }, '📷'))), found,
      h('datalist', { id: 'inv-products' }, session.products.slice(0, 3000).map((p) => h('option', { value: p.barcode }, p.name))),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('type'), type), h('label', { class: 'field' }, t('quantity'), qty)),
      h('label', { class: 'field' }, t('note'), note),
      h('p', { class: 'muted', style: { margin: 0 } }, `${t('branch')}: ${session.branchName()}`),
      h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: save }, t('save'))))
      : h('p', { class: 'muted' }, t('noStockPermission')),
    h('h2', {}, t('recentMovements')),
    recent);
  loadRecent();
}

// ------------------------------------------------- moved to the warehouse

/**
 * Buying, receiving, transfers and suppliers live in the warehouse system
 * now -- one place for them, with approval and in-transit stock. These
 * menu entries stay so nobody hunts for them, and lead there.
 */
function movedPage(main, title, target) {
  mount(main,
    head(title),
    h('div', { class: 'card', style: { maxWidth: '640px', display: 'grid', gap: '12px' } },
      h('p', { style: { margin: 0 } }, t('movedToWarehouse')),
      h('div', {}, h('a', { class: 'btn-link primary', href: `/warehouse/#/${target}` }, t('openWarehouse')))));
}
