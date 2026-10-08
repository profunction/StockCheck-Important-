/**
 * Month-end stock (月结): each place's stock and its value at cost as it
 * stood at 23:59 on the last day of the month, frozen for the accounts. It
 * is worked out from the counts and movements up to that moment, so closing
 * a few days late gives the same figures. A month once closed is never
 * changed (the rules refuse it); the morning job closes any month nobody
 * closed by hand.
 */
import { collection, db, doc, getDocs, query, where, writeBatch } from '../js/fb.js';
import { confirmBox, dateTime, download, h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty, formatSen, rm } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { asOf, levelsFor, loadStockData } from '../js/stockdata.js';
import { closingRows, monthBefore, monthEnd, monthOf } from '../js/wms.js';
import { xlsx, XLSX_TYPE } from '../js/xlsx.js';
import { audit, canApprove, failed, head, loading, myPlaces, placeName, send } from './common.js';
import { go } from './main.js';

const mayClose = () => canApprove() || session.can('POS_MANAGE') || session.isAdmin;
const idOf = (month, branchId) => `${month}_${branchId || '-'}`;

async function loadClosings() {
  const col = collection(db, ws('stockClosings'));
  const snap = await getDocs(session.branchIds.length ? query(col, where('branchId', 'in', [...session.branchIds, ''].slice(0, 30))) : col);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => b.month.localeCompare(a.month) || placeName(a.branchId).localeCompare(placeName(b.branchId)));
}

export function render(main) {
  const box = h('div');
  const month = monthBefore(monthOf());
  const action = h('span');
  mount(main, head(t('whMonthEnd'), action), h('p', { class: 'muted' }, t('whMonthEndHelp')), box);
  loading(box);
  loadClosings().then((list) => {
    const closed = new Set(list.map((c) => c.id));
    const open = myPlaces().filter((p) => !closed.has(idOf(month, p.id)));
    mount(action, mayClose()
      ? (open.length
        ? h('button', { class: 'primary', 'data-act': 'close-month', onclick: () => closeMonth(month, open) }, icon('check', 17), t('whCloseMonth').replace('{m}', month))
        : h('span', { class: 'pill good' }, `${month} · ${t('whAlreadyClosed')}`))
      : null);
    const months = [...new Set(list.map((c) => c.month))];
    mount(box, months.length ? months.map((m) => {
      const rows = list.filter((c) => c.month === m);
      return h('section', { class: 'card', style: { marginBottom: '12px' }, 'data-month': m },
        h('div', { class: 'row' }, h('h2', { class: 'grow', style: { margin: 0 } }, m),
          h('strong', {}, rm(rows.reduce((s, c) => s + (c.valueSen || 0), 0))),
          h('button', { onclick: () => excel(m, rows) }, icon('download', 16), t('whDownload'))),
        h('table', { class: 'list' },
          h('thead', {}, h('tr', {}, [t('whAt'), t('itemsCount'), t('whClosingValue'), t('whTakenBy')].map((x, i) => h('th', { class: i === 1 || i === 2 ? 'num' : '' }, x)))),
          h('tbody', {}, rows.map((c) => h('tr', {},
            h('td', {}, placeName(c.branchId)), h('td', { class: 'num' }, String((c.lines || []).length)), h('td', { class: 'num' }, rm(c.valueSen || 0)),
            h('td', { class: 'muted' }, `${c.createdByName || 'SuXin'} · ${dateTime(c.createdAt)}`))))));
    }) : h('p', { class: 'muted' }, t('whNoMonths')));
  }).catch((err) => failed(box, err));
  return null;
}

async function closeMonth(month, places) {
  if (!await confirmBox(t('whCloseMonthQ').replace('{m}', month), t('whCloseMonth').replace('{m}', month), t('cancel'), { tone: 'primary' })) return;
  let data;
  try { data = await loadStockData(); } catch (err) { return toast(err.message || String(err), 'error'); }
  const end = monthEnd(month);
  const then = asOf(data, end);
  const cost = new Map(session.products.map((p) => [p.barcode, p.costSen ?? 0]));
  const now = Date.now();
  const batch = writeBatch(db);
  for (const p of places) {
    const c = closingRows(levelsFor(then, p.id), (k) => cost.get(k));
    batch.set(doc(db, ws(`stockClosings/${idOf(month, p.id)}`)), {
      month, branchId: p.id || '', asOf: end, lines: c.lines, valueSen: c.valueSen, qtyMilli: c.qtyMilli,
      createdByUid: session.uid, createdByName: session.name, createdAt: now,
    });
    audit(batch, 'StockClosing', idOf(month, p.id), `${month} ${placeName(p.id)}`, 'CREATE', { newValue: formatSen(c.valueSen) });
  }
  send(batch, t('whMonthClosed').replace('{m}', month));
  setTimeout(() => go('monthend'), 300);
}

function excel(month, rows) {
  const sheets = rows.map((c) => ({
    name: placeName(c.branchId),
    rows: [['Barcode', t('name'), t('unit'), t('onHand'), t('cost'), t('whValue')],
      ...(c.lines || []).map((l) => [l.barcode, l.name, l.unit, Number(formatQty(l.onHandMilli)), l.costSen / 100, l.valueSen / 100]),
      ['', '', '', '', '', (c.valueSen || 0) / 100]],
  }));
  download(`stock-${month}.xlsx`, xlsx(sheets), XLSX_TYPE);
}
