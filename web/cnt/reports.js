/**
 * Reports: what the shelves held at one time against another, the app's
 * way (ReportsScreen.kt, StockComparison.kt). Either two months -- every
 * finished count of each, the latest per area and product -- or two
 * particular counts. Biggest changes first; exportable to Excel.
 */
import { collection, db, getDocs, limit, orderBy, query, where } from '../js/fb.js';
import { download, h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { formatQty } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { xlsx, XLSX_TYPE } from '../js/xlsx.js';
import { compareSnapshots, countsInMonth, isFinished, snapshot, summarise, takenAt } from '../js/countexport.js';
import { tabs } from './main.js';

const two = (n) => String(n).padStart(2, '0');
const monthOf = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}`;

async function visibleCounts() {
  const col = collection(db, ws('stockChecks'));
  const queries = !session.can('VIEW_ALL_HISTORY') ? [query(col, where('createdByUid', '==', session.uid))]
    : session.branchIds.length ? [query(col, where('createdByUid', '==', session.uid)), query(col, where('branchId', 'in', [...session.branchIds, ''].slice(0, 10)))]
      : [query(col, orderBy('createdAt', 'desc'), limit(1000))];
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  return [...new Map(snaps.flatMap((s) => s.docs).map((d) => [d.id, { ...d.data(), id: d.id }])).values()].sort((a, b) => takenAt(b) - takenAt(a));
}

const cache = new Map();
const itemsOf = (id) => {
  if (!cache.has(id)) cache.set(id, getDocs(collection(db, ws(`stockChecks/${id}/items`))).then((s) => s.docs.map((d) => d.data())));
  return cache.get(id);
};

export function render(main) {
  const now = new Date();
  const state = { mode: 'months', before: monthOf(new Date(now.getFullYear(), now.getMonth() - 1, 1)), after: monthOf(now), branch: '', a: '', b: '', changesOnly: false };
  let checks = [];
  let rows = [];
  let run = 0;
  const controls = h('div', { class: 'card cr-controls' });
  const summaryBox = h('div', {});
  const tableBox = h('div', {});

  const label = (c) => [c.refNo || c.id, c.branchName, c.zone].filter(Boolean).join(' · ');
  const sides = () => {
    if (state.mode === 'months') return [countsInMonth(checks, state.before, state.branch || null), countsInMonth(checks, state.after, state.branch || null)];
    return [checks.filter((c) => c.id === state.a), checks.filter((c) => c.id === state.b)];
  };

  const drawControls = () => {
    const seg = h('div', { class: 'seg' }, [['months', 'crMonths'], ['counts', 'crCounts']].map(([m, key]) => h('button', {
      class: state.mode === m ? 'on' : '', 'data-mode': m, onclick: () => { state.mode = m; drawControls(); build(); },
    }, t(key))));
    const branches = [...new Map(checks.filter((c) => c.branchId).map((c) => [c.branchId, c.branchName || c.branchId])).entries()];
    // Finished counts first; one still being counted can be compared too, and says so.
    const finished = [...checks.filter(isFinished), ...checks.filter((c) => !isFinished(c))];
    const pick = (key) => h('select', { 'data-pick': key, onchange: (e) => { state[key] = e.target.value; build(); } },
      finished.map((c) => h('option', { value: c.id, selected: c.id === state[key] }, `${label(c)} · ${new Date(takenAt(c)).toLocaleDateString()}${isFinished(c) ? '' : ` · ${t(`cst_${c.status}`)}`}`)));
    const month = (key) => h('input', { type: 'month', value: state[key], 'data-month': key, onchange: (e) => { state[key] = e.target.value; build(); } });
    mount(controls,
      seg,
      state.mode === 'months'
        ? h('div', { class: 'cr-pair' }, h('label', { class: 'field' }, t('crBefore'), month('before')), h('span', { class: 'cr-arrow' }, '→'), h('label', { class: 'field' }, t('crAfter'), month('after')),
          branches.length > 1 ? h('label', { class: 'field' }, t('cBranch'), h('select', { onchange: (e) => { state.branch = e.target.value; build(); } },
            h('option', { value: '' }, t('cAllBranches')), branches.map(([id, name]) => h('option', { value: id, selected: id === state.branch }, name)))) : null)
        : finished.length ? h('div', { class: 'cr-pair' }, h('label', { class: 'field' }, t('crBefore'), pick('a')), h('span', { class: 'cr-arrow' }, '→'), h('label', { class: 'field' }, t('crAfter'), pick('b')))
          : h('p', { class: 'muted' }, t('crNoFinished')),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: state.changesOnly, onchange: (e) => { state.changesOnly = e.target.checked; drawTable(); } }), t('crChangesOnly')));
  };

  const card = (n, key, tone = '') => h('div', { class: `card stat kpi ${tone}` }, h('div', { class: 'label' }, t(key)), h('div', { class: 'value' }, n));
  const drawTable = () => {
    const shown = state.changesOnly ? rows.filter((r) => r.kind !== 'same') : rows;
    mount(tableBox, !rows.length ? null : h('div', { class: 'card' },
      h('div', { class: 'dash-card-head' }, h('h3', {}, `${shown.length} ${t('crProducts')}`),
        h('button', { class: 'ghost', 'data-act': 'export-report', onclick: exportReport }, icon('download', 17), 'Excel')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list cr-table' },
        h('thead', {}, h('tr', {}, h('th', {}, t('cProductName')), h('th', { class: 'num' }, t('crBefore')), h('th', { class: 'num' }, t('crAfter')), h('th', { class: 'num' }, t('crChange')))),
        h('tbody', {}, shown.map((r) => h('tr', { 'data-key': r.key },
          h('td', {}, h('div', {}, r.name || r.barcode), h('small', { class: 'muted mono' }, r.barcode)),
          h('td', { class: 'num' }, r.before == null ? '—' : formatQty(r.before)),
          h('td', { class: 'num' }, r.after == null ? '—' : formatQty(r.after)),
          h('td', { class: `num cr-${r.kind}` }, r.kind === 'new' ? t('crNew') : r.kind === 'gone' ? t('crGone') : r.change === 0 ? '=' : `${r.change > 0 ? '+' : ''}${formatQty(r.change)}`))))))));
  };

  const exportReport = () => {
    const sheet = [['Product', 'Barcode', 'Unit', 'Before', 'After', 'Change', 'What changed'],
      ...rows.map((r) => [r.name, r.barcode, r.unit, r.before == null ? '' : r.before / 1000, r.after == null ? '' : r.after / 1000, r.change == null ? '' : r.change / 1000,
        { up: 'Up', down: 'Down', same: 'Same', new: 'New', gone: 'Not counted' }[r.kind]])];
    const name = state.mode === 'months' ? `stock-${state.before}-vs-${state.after}` : 'stock-comparison';
    download(`${name}.xlsx`, xlsx([{ name: 'Report', rows: sheet }]), XLSX_TYPE);
  };

  const build = async () => {
    const mine = ++run;
    const [before, after] = sides();
    mount(summaryBox, h('p', { class: 'muted' }, t('loading')));
    try {
      const load = (list) => Promise.all(list.map(async (check) => ({ check, items: await itemsOf(check.id) })));
      const [b, a] = await Promise.all([load(before), load(after)]);
      if (mine !== run) return;
      rows = compareSnapshots(snapshot(b), snapshot(a));
      const s = summarise(rows);
      mount(summaryBox,
        !before.length && !after.length ? h('div', { class: 'cnt-empty-big' }, icon('chart', 36), h('p', {}, t('crNothing'))) : h('div', {},
          h('p', { class: 'muted cr-sides' }, `${t('crBefore')}: ${before.length} ${t('crCountsN')} · ${t('crAfter')}: ${after.length} ${t('crCountsN')}`),
          h('div', { class: 'cards' },
            card(formatQty(s.beforeTotal), 'crBeforeTotal'), card(formatQty(s.afterTotal), 'crAfterTotal'),
            card(String(s.up), 'crUp'), card(String(s.down), 'crDown', s.down ? 'warn' : ''), card(String(s.new), 'crNewN'), card(String(s.gone), 'crGoneN', s.gone ? 'bad' : ''))));
      drawTable();
    } catch (err) {
      if (mine === run) mount(summaryBox, h('p', { class: 'card' }, `${t('errLoad')}: ${err.message || err}`));
    }
  };

  mount(main, tabs('reports'), h('h1', {}, t('crTitle')), h('p', { class: 'muted' }, t('crLead')), controls, summaryBox, tableBox);
  visibleCounts().then((list) => {
    checks = list;
    const finished = list.filter(isFinished);
    // Two sensible counts are already picked by the time anyone switches.
    state.b = finished[0]?.id || '';
    state.a = finished.find((c) => c.id !== state.b && c.zone === finished[0]?.zone && c.branchId === finished[0]?.branchId)?.id || finished[1]?.id || '';
    drawControls();
    build();
  }).catch((err) => toast(err.message || String(err), 'error'));
  return null;
}
