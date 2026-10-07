/**
 * What a count found against what the books expected -- the meeting point
 * of the JEXO Count app and the warehouse.
 *
 * For a finished count: expected is what earlier counts plus the movements
 * up to that moment said should be there (the same ledger as everywhere);
 * counted is what the count says is there now. The difference is what went
 * missing, or turned up, that no movement explains -- each line valued at
 * cost so the owner sees what it is worth.
 *
 * A finished count already is the new figure the stock is worked from; this
 * page is for finding out why, not for changing anything.
 */
import { dateTime, h, mount } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty, formatSen, rm } from '../js/money.js';
import { levels, productKey, takenAt } from '../js/ledger.js';
import { loadStockData } from '../js/stockdata.js';
import { session } from '../js/session.js';
import { failed, head, loading, pill, placeName } from './common.js';
import { go } from './main.js';

let data = null;

export function render(main, sub) {
  const box = h('div');
  mount(main, head(t('whVariance')), h('p', { class: 'muted' }, t('whVarianceHelp')), box);
  loading(box);
  loadStockData().then((d) => {
    data = d;
    if (sub) one(box, sub);
    else list(box);
  }).catch((err) => failed(box, err));
  return null;
}

function list(box) {
  const counts = [...data.checks].sort((a, b) => takenAt(b) - takenAt(a)).slice(0, 100);
  mount(box, counts.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
    h('thead', {}, h('tr', {}, [t('whCount'), t('whAt'), t('whZone'), t('employee'), t('date'), t('whItems'), t('whShortValue'), t('whOverValue')].map((x, i) => h('th', { class: i > 4 ? 'num' : '' }, x)))),
    h('tbody', {}, counts.map((c) => {
      const s = summary(c);
      return h('tr', { class: 'click', onclick: () => go('variance', c.id) },
        h('td', {}, h('strong', {}, c.refNo || c.templateName || c.id.slice(0, 6))), h('td', {}, placeName(c.branchId)), h('td', {}, c.zone || ''),
        h('td', {}, c.createdByName || ''), h('td', { class: 'muted' }, dateTime(takenAt(c))), h('td', { class: 'num' }, String(s.rows.length)),
        h('td', { class: 'num', style: { color: s.short ? 'var(--danger)' : '' } }, s.short ? formatSen(s.short) : ''),
        h('td', { class: 'num', style: { color: s.over ? 'var(--ok)' : '' } }, s.over ? formatSen(s.over) : ''));
    }))))
    : h('p', { class: 'muted' }, t('whNoCountsYet')));
}

/** Expected (before the count) and counted (by the count) for each product it covered. */
function compare(count) {
  const branch = count.branchId || '';
  const when = takenAt(count);
  const catalogue = new Map(session.products.map((p) => [p.barcode, p]));
  const earlier = data.checks.filter((c) => (c.branchId || '') === branch && c.id !== count.id && (takenAt(c) < when || (takenAt(c) === when && (c.createdAt || 0) < (count.createdAt || 0))));
  const moves = data.moves.filter((m) => (m.branchId || '') === branch && m.at <= when);
  const itemsOf = (c) => data.items.get(c.id) || [];
  const before = new Map(levels(earlier, itemsOf, moves, catalogue).map((r) => [r.key, r]));
  const after = new Map(levels([...earlier, count], itemsOf, moves, catalogue).map((r) => [r.key, r]));
  const keys = [...new Set(itemsOf(count).map(productKey).filter(Boolean))];
  return keys.map((key) => {
    const expected = before.get(key)?.onHand ?? 0;
    const counted = after.get(key)?.onHand ?? 0;
    const diff = counted - expected;
    const cost = catalogue.get(key)?.costSen || 0;
    return { key, name: after.get(key)?.name || key, unit: after.get(key)?.unit || '', expected, counted, diff, valueSen: Math.round(diff * cost / 1000), known: before.has(key) };
  }).sort((a, b) => a.valueSen - b.valueSen || a.diff - b.diff);
}

function summary(count) {
  const rows = compare(count);
  return { rows, short: -rows.filter((r) => r.valueSen < 0).reduce((s, r) => s + r.valueSen, 0), over: rows.filter((r) => r.valueSen > 0).reduce((s, r) => s + r.valueSen, 0) };
}

function one(box, id) {
  const count = data.checks.find((c) => c.id === id);
  if (!count) { mount(box, h('p', { class: 'muted' }, t('notFound'))); return; }
  const { rows, short, over } = summary(count);
  let onlyDiff = true;
  const table = h('div');
  const draw = () => mount(table, h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
    h('thead', {}, h('tr', {}, [t('name'), t('whExpectedQty'), t('whCounted'), t('whDiff'), t('whValue')].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
    h('tbody', {}, rows.filter((r) => !onlyDiff || r.diff).map((r) => h('tr', { class: 'click', onclick: () => go('stock', encodeURIComponent(r.key)) },
      h('td', {}, r.name, r.known ? null : h('span', {}, ' ', pill(t('whFirstCount')))),
      h('td', { class: 'num' }, formatQty(r.expected)), h('td', { class: 'num' }, formatQty(r.counted)),
      h('td', { class: 'num', style: { fontWeight: 700, color: r.diff < 0 ? 'var(--danger)' : r.diff > 0 ? 'var(--ok)' : '' } }, r.diff ? `${r.diff > 0 ? '+' : ''}${formatQty(r.diff)}` : '0'),
      h('td', { class: 'num' }, r.valueSen ? formatSen(r.valueSen) : '')))))));
  mount(box,
    h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { onclick: () => go('variance') }, t('back'))),
    h('div', { class: 'card wh-head' },
      h('strong', { style: { fontSize: '18px' } }, count.refNo || count.templateName || count.id),
      h('div', { class: 'muted' }, [placeName(count.branchId), count.zone, count.createdByName, dateTime(takenAt(count)), t(`st_${count.status}`)].filter(Boolean).join(' · '))),
    h('div', { class: 'cards' },
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('whItems')), h('div', { class: 'value' }, String(rows.length))),
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('whWithDiff')), h('div', { class: 'value' }, String(rows.filter((r) => r.diff).length))),
      h('div', { class: 'card stat bad' }, h('div', { class: 'label' }, t('whShortValue')), h('div', { class: 'value' }, rm(short))),
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('whOverValue')), h('div', { class: 'value' }, rm(over)))),
    h('label', { class: 'check', style: { margin: '6px 0 12px' } }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { onlyDiff = e.target.checked; draw(); } }), t('whOnlyDiff')),
    table,
    h('p', { class: 'muted' }, t('whVarianceNote')));
  draw();
}
