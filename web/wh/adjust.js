/**
 * Correcting stock by hand, always with a reason: broken, expired, missing,
 * found, opening stock, or a plain correction. Either by how much it goes up
 * or down, or "there are really N here", which works the difference out.
 *
 * Each adjustment is a movement (WRITE_OFF down, RECEIVE up) marked
 * kind: ADJUSTMENT with its reason, plus an audit entry with the figure
 * before and after -- so the stock is never just overwritten, and anyone can
 * see later who changed it, when, and why.
 */
import { collection, db, doc, getDocs, query, where, writeBatch } from '../js/fb.js';
import { dateTime, h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty, parseQty } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { levelsFor, loadStockData } from '../js/stockdata.js';
import { audit, canMove, failed, head, isMine, loading, movement, myPlaces, placeName, productBox, send } from './common.js';

const DOWN = ['DAMAGED', 'EXPIRED', 'MISSING', 'USED', 'CORRECTION', 'OTHER'];
const UP = ['FOUND', 'OPENING', 'RETURNED', 'CORRECTION', 'OTHER'];

let stock = null;

export function render(main) {
  if (!canMove()) { mount(main, head(t('whAdjust')), h('p', { class: 'muted' }, t('noStockPermission'))); return null; }
  let product = null;
  let mode = 'DOWN';
  let reason = 'DAMAGED';
  let branch = myPlaces().some((p) => p.id === session.branchId) ? session.branchId : (myPlaces()[0]?.id ?? '');
  const card = h('div');
  const recent = h('div');
  const qty = h('input', { class: 'big-num', inputmode: 'decimal', placeholder: '0' });
  const note = h('input', { placeholder: t('whAdjustNoteHint') });
  const onHand = () => {
    if (!product || !stock) return null;
    const row = levelsFor(stock, branch).find((r) => r.key === product.barcode);
    return row ? row.onHand : 0;
  };

  const draw = () => {
    if (!product) { mount(card, h('p', { class: 'muted' }, t('whAdjustStart'))); return; }
    const now = onHand();
    const reasons = mode === 'UP' ? UP : mode === 'DOWN' ? DOWN : [...new Set([...DOWN, ...UP])];
    if (!reasons.includes(reason)) reason = reasons[0];
    mount(card, h('div', { class: 'card', style: { display: 'grid', gap: '14px' } },
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('strong', { style: { fontSize: '18px' } }, product.name || product.barcode), h('div', { class: 'muted' }, product.barcode)),
        h('div', { class: 'wh-onhand' }, h('span', { class: 'muted' }, t('onHand')), h('strong', {}, now == null ? '…' : `${formatQty(now)} ${product.unit || ''}`))),
      h('div', { class: 'seg', role: 'group' }, ['DOWN', 'UP', 'SET'].map((m) => h('button', { class: mode === m ? 'on' : '', onclick: () => { mode = m; draw(); } }, t(`whAdj_${m}`)))),
      h('label', { class: 'field' }, mode === 'SET' ? t('whActualQty') : t('quantity'), qty),
      h('div', { class: 'wh-chips' }, reasons.map((r) => h('button', { class: reason === r ? 'on' : '', onclick: () => { reason = r; draw(); } }, t(`reason_${r}`)))),
      note,
      h('button', { class: 'primary', style: { minHeight: '54px', fontSize: '17px' }, onclick: save }, icon('check', 18), t('whSaveAdjust'))));
    qty.focus();
  };

  const save = () => {
    const q = parseQty(qty.value);
    if (q == null || q < 0 || (mode !== 'SET' && q === 0)) return toast(t('errQty'), 'error');
    const before = onHand();
    const delta = mode === 'UP' ? q : mode === 'DOWN' ? -q : q - (before ?? 0);
    if (mode === 'SET' && before == null) return toast(t('loading'), 'error');
    if (delta === 0) return toast(t('whNoChange'), 'error');
    const type = delta > 0 ? 'RECEIVE' : 'WRITE_OFF';
    const batch = writeBatch(db);
    const m = movement(product, type, Math.abs(delta), branch, { reason, kind: 'ADJUSTMENT', note: note.value.trim() });
    batch.set(doc(collection(db, ws('movements'))), m);
    audit(batch, 'Adjustment', product.barcode, product.name || product.barcode, 'UPDATE', {
      field: `stock @ ${placeName(branch)} (${reason})`, oldValue: before == null ? '' : formatQty(before), newValue: before == null ? `${delta > 0 ? '+' : ''}${formatQty(delta)}` : formatQty(before + delta),
    });
    send(batch, t('saved'));
    // The same movement locally, so the figure on screen moves at once.
    stock?.moves.push(m);
    qty.value = ''; note.value = '';
    draw();
    loadRecent();
  };

  async function loadRecent() {
    try {
      const col = collection(db, ws('movements'));
      const q = session.branchIds.length
        ? query(col, where('branchId', 'in', [...session.branchIds, ''].slice(0, 30)), where('kind', '==', 'ADJUSTMENT'))
        : query(col, where('kind', '==', 'ADJUSTMENT'));
      const rows = (await getDocs(q)).docs.map((d) => d.data()).filter((m) => isMine(m.branchId)).sort((a, b) => b.at - a.at).slice(0, 40);
      mount(recent, rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, [t('date'), t('name'), t('whReason'), t('quantity'), t('whAt'), t('employee')].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map((m) => h('tr', {},
          h('td', { class: 'muted' }, dateTime(m.at)), h('td', {}, m.productName || m.barcode), h('td', {}, t(`reason_${m.reason || 'OTHER'}`), m.note ? h('div', { class: 'muted' }, m.note) : null),
          h('td', { class: 'num', style: { color: m.type === 'WRITE_OFF' ? 'var(--danger)' : 'var(--ok)' } }, `${m.type === 'WRITE_OFF' ? '−' : '+'}${formatQty(m.quantityMilli)}`),
          h('td', {}, placeName(m.branchId)), h('td', {}, m.createdByName || '')))))) : h('p', { class: 'muted' }, t('whNoAdjustments')));
    } catch (err) {
      failed(recent, err);
    }
  }

  const scan = productBox({ big: true, onPick: (p) => { product = p; draw(); } });
  mount(main,
    head(t('whAdjust'),
      myPlaces().length > 1 ? h('select', { style: { width: 'auto' }, onchange: (e) => { branch = e.target.value; draw(); } },
        myPlaces().map((p) => h('option', { value: p.id, selected: p.id === branch }, p.name))) : null),
    h('p', { class: 'muted' }, t('whAdjustHelp')),
    h('div', { class: 'wh-scan' }, scan),
    card,
    h('h2', { style: { marginTop: '24px' } }, t('whRecentAdjustments')),
    recent);
  draw();
  loading(recent);
  loadRecent();
  // Read fresh every time the page opens: a figure from earlier would be wrong.
  stock = null;
  loadStockData().then((d) => { stock = d; draw(); }).catch(() => {});
  return null;
}
