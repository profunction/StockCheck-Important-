/**
 * Stock: every product at a place (or every place added up) -- on hand, in
 * transit to it, on order, available, reorder point and value -- and, for
 * one product, the answer to "why is it 87?": the last count, then every
 * movement since, with the running figure after each.
 */
import { db, doc, writeBatch } from '../js/fb.js';
import { dateTime, h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty, formatSen, parseQty, parseSen, rm } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { levelsFor } from '../js/stockdata.js';
import { audit, canBuy, canMove, failed, findProduct, head, loading, myPlaces, pill, places, productBox } from './common.js';
import { loadAll, stockRows } from './data.js';
import { go } from './main.js';

let scope = null;
let filter = 'all';
let q = '';
let data = null;

const SIGN = { RECEIVE: 1, REFUND: 1, TRANSFER_IN: 1, SALE: -1, WRITE_OFF: -1, TRANSFER_OUT: -1 };

export function render(main, sub) {
  if (scope == null) scope = session.branchIds.length ? session.branchId : 'ALL';
  const box = h('div');
  if (sub) {
    mount(main, head(t('whStock')), box);
    loading(box);
    loadAll().then((d) => { data = d; productPage(box, decodeURIComponent(sub)); }).catch((err) => failed(box, err));
    return null;
  }
  const scan = productBox({ onPick: (p) => go('stock', encodeURIComponent(p.barcode)), placeholder: t('whScanToLook') });
  const places2 = myPlaces();
  mount(main,
    head(t('whStock'),
      h('button', { onclick: () => render(main) }, icon('download', 16), t('refresh'))),
    h('div', { class: 'wh-scan' }, scan),
    h('div', { class: 'row', style: { margin: '12px 0' } },
      h('div', { class: 'search-box', style: { maxWidth: '280px', flex: 1 } }, icon('search', 18),
        h('input', { type: 'search', placeholder: t('searchProducts'), value: q, oninput: (e) => { q = e.target.value; draw(); } })),
      places2.length > 1 ? h('select', { style: { width: 'auto' }, onchange: (e) => { scope = e.target.value; draw(); } },
        !session.branchIds.length ? h('option', { value: 'ALL', selected: scope === 'ALL' }, t('allBranches')) : null,
        places2.map((p) => h('option', { value: p.id, selected: scope === p.id }, p.name))) : null,
      h('div', { class: 'seg' }, ['all', 'low', 'out', 'transit', 'uncounted'].map((f) => h('button', { class: filter === f ? 'on' : '', onclick: () => { filter = f; draw(); } }, t(`whF_${f}`))))),
    box);

  function draw() {
    if (!data) return;
    let rows = stockRows(data, scope);
    if (filter === 'low') rows = rows.filter((r) => r.low);
    if (filter === 'out') rows = rows.filter((r) => r.out);
    if (filter === 'transit') rows = rows.filter((r) => r.inTransit || r.onOrder);
    if (filter === 'uncounted') rows = rows.filter((r) => r.counted == null);
    const text = q.trim().toLowerCase();
    if (text) rows = rows.filter((r) => (r.name || '').toLowerCase().includes(text) || r.key.toLowerCase().includes(text));
    const value = rows.reduce((s, r) => s + r.valueSen, 0);
    mount(box,
      h('div', { class: 'cards' },
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('itemsCount')), h('div', { class: 'value' }, String(rows.length))),
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('stockValue')), h('div', { class: 'value' }, rm(value)))),
      rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'list wh-stock' },
        h('thead', {}, h('tr', {}, [[t('name')], [t('onHand'), 1], [t('whInTransit'), 1], [t('whOnOrder'), 1], [t('whAvailable'), 1], [t('whReorderAt'), 1], [t('whValue'), 1]]
          .map(([x, n]) => h('th', { class: n ? 'num' : '' }, x)))),
        h('tbody', {}, rows.slice(0, 1500).map((r) => h('tr', { class: 'click', onclick: () => go('stock', encodeURIComponent(r.key)) },
          h('td', {}, h('div', {}, r.name || r.key, r.low ? h('span', {}, ' ', pill(t('lowStock'), 'warn')) : null), h('div', { class: 'muted', style: { fontSize: '12px' } }, r.barcode)),
          h('td', { class: 'num', style: { fontWeight: 700, color: r.out ? 'var(--danger)' : '' } }, `${formatQty(r.onHand)} ${r.unit || ''}`),
          h('td', { class: 'num' }, r.inTransit ? formatQty(r.inTransit) : ''),
          h('td', { class: 'num' }, r.onOrder ? formatQty(r.onOrder) : ''),
          h('td', { class: 'num' }, formatQty(r.available)),
          h('td', { class: 'num muted' }, r.reorderLevel != null ? formatQty(r.reorderLevel) : ''),
          h('td', { class: 'num' }, r.valueSen ? formatSen(r.valueSen) : ''))))))
        : h('p', { class: 'muted' }, t('noMatch')));
  }
  // Show what was read last time at once, then the figures as they are now:
  // a delivery or transfer since then must not be missing from the page.
  if (data) draw();
  else loading(box);
  loadAll().then((d) => { data = d; draw(); }).catch((err) => { if (!data) failed(box, err); });
  return null;
}

/** Movements of [key] at [branch], oldest first, from the loaded data. */
const movesOf = (key, branch) => data.stock.moves.filter((m) => m.barcode === key && (m.branchId || '') === branch).sort((a, b) => a.at - b.at);

function productPage(box, key) {
  const product = findProduct(key) || session.products.find((p) => p.barcode === key) || null;
  const name = product?.name || key;
  const placeRows = places().map((p) => ({ place: p, row: stockRows(data, p.id).find((r) => r.key === key) }))
    .filter((x) => x.row || myPlaces().some((m) => m.id === x.place.id));
  let at = placeRows.find((x) => x.place.id === session.branchId)?.place.id ?? placeRows.find((x) => x.row)?.place.id ?? '';
  const ledgerBox = h('div');

  const drawLedger = () => {
    const level = levelsFor(data.stock, at).find((r) => r.key === key);
    const moves = movesOf(key, at);
    const base = level?.counted ?? null;
    const since = level?.countedAt != null ? moves.filter((m) => m.at > level.countedAt) : moves;
    const before = level?.countedAt != null ? moves.filter((m) => m.at <= level.countedAt) : [];
    let running = base ?? 0;
    const line = (m, counted) => {
      const d = (SIGN[m.type] || 0) * (m.quantityMilli || 0);
      if (counted) running += d;
      return h('tr', { class: counted ? '' : 'old' },
        h('td', { class: 'muted', style: { whiteSpace: 'nowrap' } }, dateTime(m.at)),
        h('td', {}, t(`move_${m.type}`), m.reason ? h('span', { class: 'muted' }, ` · ${t(`reason_${m.reason}`)}`) : null,
          h('div', { class: 'muted', style: { fontSize: '12px' } }, [m.reference, m.note, m.createdByName, sourceLabel(m.source)].filter(Boolean).join(' · '))),
        h('td', { class: 'num', style: { color: d < 0 ? 'var(--danger)' : 'var(--ok)', fontWeight: 650 } }, `${d < 0 ? '−' : '+'}${formatQty(Math.abs(d))}`),
        h('td', { class: 'num', style: { fontWeight: 700 } }, counted ? formatQty(running) : ''));
    };
    mount(ledgerBox,
      h('div', { class: 'row', style: { marginBottom: '10px' } },
        h('h2', { style: { margin: 0 }, class: 'grow' }, `${t('whWhy')} ${formatQty(level?.onHand ?? 0)}?`),
        placeRows.length > 1 ? h('select', { style: { width: 'auto' }, onchange: (e) => { at = e.target.value; drawLedger(); } },
          placeRows.map((x) => h('option', { value: x.place.id, selected: x.place.id === at }, x.place.name))) : null),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list wh-ledger' },
        h('thead', {}, h('tr', {}, [t('date'), t('whWhat'), t('whChange'), t('whBalance')].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
        h('tbody', {},
          base != null
            ? h('tr', { class: 'base' }, h('td', { class: 'muted' }, dateTime(level.countedAt)), h('td', {}, h('strong', {}, t('whLastCount')), h('div', { class: 'muted', style: { fontSize: '12px' } }, t('whCountIsBase'))),
              h('td', {}), h('td', { class: 'num', style: { fontWeight: 800 } }, formatQty(base)))
            : h('tr', { class: 'base' }, h('td', {}), h('td', { colspan: 3, class: 'muted' }, t('whNeverCounted'))),
          since.map((m) => line(m, true)),
          h('tr', { class: 'total' }, h('td', {}), h('td', {}, h('strong', {}, t('onHand'))), h('td', {}), h('td', { class: 'num', style: { fontWeight: 800, fontSize: '18px' } }, formatQty(level?.onHand ?? 0)))))),
      before.length ? h('details', { style: { marginTop: '10px' } }, h('summary', { class: 'muted' }, `${t('whBeforeCount')} (${before.length})`),
        h('table', { class: 'list wh-ledger' }, h('tbody', {}, before.slice(-50).map((m) => line(m, false))))) : null);
  };

  const prices = priceHistory(key);
  mount(box,
    h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { onclick: () => go('stock') }, t('back'))),
    h('div', { class: 'card wh-head' },
      h('div', { class: 'row' }, product?.photoUrl ? h('img', { class: 'thumb', src: product.photoUrl, alt: '', style: { width: '56px', height: '56px', borderRadius: '10px', objectFit: 'cover' } }) : null,
        h('div', { class: 'grow' }, h('strong', { style: { fontSize: '19px' } }, name), h('div', { class: 'muted' }, `${key}${product?.sku ? ` · ${product.sku}` : ''}${product?.unit ? ` · ${product.unit}` : ''}`))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, [t('whAt'), t('onHand'), t('whInTransit'), t('whOnOrder'), t('whAvailable'), t('whLastCount')].map((x, i) => h('th', { class: i && i < 5 ? 'num' : '' }, x)))),
        h('tbody', {}, placeRows.map(({ place, row }) => h('tr', {},
          h('td', {}, place.name, place.kind === 'WAREHOUSE' ? h('span', {}, ' ', pill(t('whKind_WAREHOUSE'))) : null),
          h('td', { class: 'num', style: { fontWeight: 700 } }, formatQty(row?.onHand ?? 0)),
          h('td', { class: 'num' }, row?.inTransit ? formatQty(row.inTransit) : ''),
          h('td', { class: 'num' }, row?.onOrder ? formatQty(row.onOrder) : ''),
          h('td', { class: 'num' }, formatQty(row?.available ?? 0)),
          h('td', { class: 'muted' }, row?.countedAt ? dateTime(row.countedAt) : t('neverCounted')))))))),
    h('section', { class: 'card', style: { marginTop: '16px' } }, ledgerBox),
    product ? settingsCard(product) : null,
    prices.length ? h('section', { class: 'card', style: { marginTop: '16px' } }, h('h2', {}, t('whPriceHistory')),
      h('table', { class: 'list' }, h('thead', {}, h('tr', {}, [t('supplier'), t('whLastPrice'), t('whAvgPrice'), t('whTimes'), t('date')].map((x, i) => h('th', { class: i && i < 4 ? 'num' : '' }, x)))),
        h('tbody', {}, prices.map((p) => h('tr', {}, h('td', {}, p.supplier), h('td', { class: 'num' }, formatSen(p.last)), h('td', { class: 'num' }, formatSen(p.avg)), h('td', { class: 'num' }, String(p.n)), h('td', { class: 'muted' }, dateTime(p.at))))))) : null);
  drawLedger();
}

/** What each supplier charged for [key] on purchase orders that went out. */
function priceHistory(key) {
  const by = new Map();
  for (const po of data.pos) {
    if (['DRAFT', 'SUBMITTED', 'CANCELLED'].includes(po.status)) continue;
    const l = (po.lines || []).find((x) => x.barcode === key && x.costSen);
    if (!l) continue;
    const k = po.supplierName || '—';
    const e = by.get(k) || { supplier: k, sum: 0, n: 0, last: 0, at: 0 };
    e.sum += l.costSen; e.n += 1;
    if ((po.createdAt || 0) >= e.at) { e.at = po.createdAt || 0; e.last = l.costSen; }
    by.set(k, e);
  }
  return [...by.values()].map((e) => ({ ...e, avg: Math.round(e.sum / e.n) })).sort((a, b) => a.last - b.last);
}

const sourceLabel = (s) => ({ POS: 'POS', LOYVERSE: 'Loyverse', API: 'API', FILE: t('whSrc_FILE'), WAREHOUSE: t('whSrc_WAREHOUSE') }[s] || '');

/** Reorder point (whoever keeps stock), maximum, supplier and cost (the buyer). */
function settingsCard(product) {
  const buyer = canBuy();
  const keeper = canMove();
  if (!buyer && !keeper) return null;
  const reorder = h('input', { inputmode: 'decimal', value: product.reorderLevelMilli != null ? formatQty(product.reorderLevelMilli) : '' });
  const max = h('input', { inputmode: 'decimal', value: product.maxStockMilli != null ? formatQty(product.maxStockMilli) : '', disabled: !buyer });
  const cost = h('input', { inputmode: 'decimal', value: product.costSen != null ? formatSen(product.costSen) : '', disabled: !buyer });
  const supplier = h('select', { disabled: !buyer }, h('option', { value: '' }, '—'),
    (session.suppliers || []).map((s) => h('option', { value: s.id, selected: s.id === product.preferredSupplierId }, s.name)));
  return h('section', { class: 'card', style: { marginTop: '16px', display: 'grid', gap: '12px' } },
    h('h2', { style: { margin: 0 } }, t('whReorderSettings')),
    h('p', { class: 'muted', style: { margin: 0 } }, t('whReorderHelp')),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('whReorderAt'), reorder), h('label', { class: 'field' }, t('whMaxStock'), max)),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('whPreferredSupplier'), supplier), h('label', { class: 'field' }, t('cost'), cost)),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: async () => {
      const r = reorder.value.trim() ? parseQty(reorder.value) : null;
      const m = max.value.trim() ? parseQty(max.value) : null;
      const c = cost.value.trim() ? parseSen(cost.value) : null;
      if ((reorder.value.trim() && r == null) || (max.value.trim() && m == null) || (cost.value.trim() && c == null)) return toast(t('errQty'), 'error');
      const patch = { reorderLevelMilli: r, updatedAt: Date.now() };
      if (buyer) Object.assign(patch, { maxStockMilli: m, preferredSupplierId: supplier.value || null, costSen: c });
      const batch = writeBatch(db);
      batch.update(doc(db, ws(`products/${product.barcode}`)), patch);
      audit(batch, 'Product', product.barcode, product.name || product.barcode, 'UPDATE', { field: 'reorder', oldValue: product.reorderLevelMilli ?? '', newValue: r ?? '' });
      try { await batch.commit(); toast(t('saved'), 'ok'); } catch (err) { toast(err.message || String(err), 'error'); }
    } }, t('save'))));
}
