/**
 * Goods going back to the supplier (退货给供应商): broken, expired, or the
 * wrong thing sent. The worker scans what goes back, says why, and the
 * stock leaves at once -- WRITE_OFF movements with reason SUPPLIER_RETURN,
 * in the same batch as the return record and its audit entry. The return
 * then waits for the supplier's credit note, which the buyer notes down
 * (OPEN -> CREDITED); the value at cost shows what to expect back.
 */
import { collection, db, doc, getDocs, query, where, writeBatch } from '../js/fb.js';
import { confirmBox, dateTime, h, modal, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatSen, parseSen, rm, UNIT } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import {
  audit, canBuy, canMove, failed, head, loading, movement, myPlaces, newId, packButton, pill, placeName, productBox, qtyFields, qtyText, refNo, send,
} from './common.js';
import { loadPurchaseOrders } from './data.js';
import { go } from './main.js';

const WHY = ['DAMAGED', 'EXPIRED', 'WRONG', 'OTHER'];
const TONE = { OPEN: 'warn', CREDITED: 'good' };

export async function loadReturns() {
  const col = collection(db, ws('supplierReturns'));
  const snap = await getDocs(session.branchIds.length ? query(col, where('branchId', 'in', [...session.branchIds, ''].slice(0, 30))) : col);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function render(main, sub) {
  if (!canMove() && !canBuy()) { mount(main, head(t('whReturns')), h('p', { class: 'muted' }, t('noStockPermission'))); return null; }
  if (sub === 'new' && canMove()) return newReturn(main);
  const box = h('div');
  mount(main,
    head(t('whReturns'), canMove() ? h('button', { class: 'primary', 'data-act': 'ret-new', onclick: () => go('returns', 'new') }, icon('plus', 17), t('whNewReturn')) : null),
    h('p', { class: 'muted' }, t('whReturnHelp')),
    box);
  loading(box);
  loadReturns().then((list) => mount(box, list.length ? h('div', { class: 'wh-list' }, list.map((r) => h('button', { class: 'wh-card', 'data-ret': r.id, onclick: () => show(r) },
    h('div', { class: 'row' }, h('strong', { class: 'grow' }, r.returnNo), pill(t(`ret_${r.status}`), TONE[r.status])),
    h('div', {}, `${r.supplierName || '—'} · ${placeName(r.branchId)}`),
    h('div', { class: 'muted' }, `${(r.lines || []).length} ${t('whLines')} · ${t('whReturnValue')} ${rm(r.valueSen || 0)} · ${dateTime(r.createdAt)}`,
      r.creditNo ? ` · ${t('whCreditNo')} ${r.creditNo}` : '')))) : h('p', { class: 'muted' }, t('whNoReturns'))))
    .catch((err) => failed(box, err));
  return null;
}

function show(r) {
  modal((close) => {
    const creditNo = h('input', { maxlength: 40, 'data-act': 'credit-no' });
    const creditAmt = h('input', { inputmode: 'decimal', value: formatSen(r.valueSen || 0) });
    return [
      h('h2', {}, `${r.returnNo} · ${t(`ret_${r.status}`)}`),
      h('p', { class: 'muted', style: { margin: 0 } }, [r.supplierName, placeName(r.branchId), r.poNo, r.createdByName, dateTime(r.createdAt)].filter(Boolean).join(' · ')),
      h('table', { class: 'list' }, h('tbody', {}, (r.lines || []).map((l) => h('tr', {},
        h('td', {}, l.name || l.barcode, h('div', { class: 'muted', style: { fontSize: '12px' } }, t(`whR_${l.why || 'OTHER'}`))),
        h('td', { class: 'num' }, qtyText(l.qtyMilli, session.find(l.barcode))),
        h('td', { class: 'num' }, rm(Math.round(l.qtyMilli * (l.costSen || 0) / UNIT))))))),
      r.note ? h('p', { style: { margin: 0 } }, r.note) : null,
      r.status === 'CREDITED' ? h('p', { style: { margin: 0 } }, `${t('whCreditNo')} ${r.creditNo} · ${rm(r.creditSen || 0)} · ${r.creditedByName || ''}`) : null,
      r.status === 'OPEN' && canBuy() ? h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('whCreditNo'), creditNo), h('label', { class: 'field' }, t('whCreditAmount'), creditAmt)) : null,
      h('div', { class: 'actions' },
        h('button', { onclick: close }, t('close')),
        r.status === 'OPEN' && canBuy() ? h('button', { class: 'primary', 'data-act': 'credit-save', onclick: () => {
          const sen = parseSen(creditAmt.value);
          if (!creditNo.value.trim() || sen == null) return toast(t('errAmount'), 'error');
          const now = Date.now();
          const batch = writeBatch(db);
          batch.update(doc(db, ws(`supplierReturns/${r.id}`)), { status: 'CREDITED', creditNo: creditNo.value.trim(), creditSen: sen, creditedAt: now, creditedByName: session.name, updatedAt: now });
          audit(batch, 'SupplierReturn', r.id, r.returnNo, 'STATUS_CHANGE', { field: 'status', oldValue: 'OPEN', newValue: `CREDITED ${creditNo.value.trim()} ${formatSen(sen)}` });
          send(batch, t('saved'));
          close();
          go('returns');
        } }, t('whMarkCredited')) : null),
    ];
  }, { wide: true });
}

function newReturn(main) {
  const id = newId('supplierReturns');
  let branch = myPlaces().some((p) => p.id === session.branchId) ? session.branchId : (myPlaces()[0]?.id ?? '');
  const lines = [];
  const linesBox = h('div', { class: 'wh-lines' });
  const supplier = h('select', { 'data-act': 'ret-supplier' }, h('option', { value: '' }, t('whNoSupplier')), (session.suppliers || []).map((s) => h('option', { value: s.id }, s.name)));
  const poPick = h('select', {}, h('option', { value: '' }, '—'));
  const note = h('input', { placeholder: t('note') });
  let pos = [];
  loadPurchaseOrders().then((list) => {
    pos = list.filter((p) => ['PARTIAL', 'RECEIVED', 'CLOSED'].includes(p.status)).slice(0, 60);
    mount(poPick, h('option', { value: '' }, '—'), pos.map((p) => h('option', { value: p.id }, `${p.poNo} · ${p.supplierName || ''}`)));
  }).catch(() => {});
  poPick.onchange = () => { const p = pos.find((x) => x.id === poPick.value); if (p?.supplierId) supplier.value = p.supplierId; };

  const draw = (flash = '') => mount(linesBox, lines.length ? lines.map((l) => {
    const product = session.find(l.barcode);
    return h('div', { class: `wh-line${l.barcode === flash ? ' flash' : ''}`, 'data-line': l.barcode, onclick: () => edit(l) },
      h('div', { class: 'n' }, h('strong', {}, l.name), pill(t(`whR_${l.why}`), 'warn')),
      h('div', { class: 'muted' }, `${qtyText(l.qtyMilli, product)} · ${rm(Math.round(l.qtyMilli * (l.costSen || 0) / UNIT))}`),
      h('div', { class: 'wh-step' },
        packButton(product, (q) => { l.qtyMilli += q; draw(); }),
        h('button', { type: 'button', 'aria-label': '+', onclick: (e) => { e.stopPropagation(); l.qtyMilli += UNIT; draw(); } }, icon('plus', 18))));
  }) : h('p', { class: 'muted' }, t('whScanToStart')));

  const edit = (l) => modal((close) => {
    const q = qtyFields(session.find(l.barcode), l.qtyMilli, t('quantity'));
    let why = l.why;
    const chips = h('div', { class: 'wh-chips' });
    const drawChips = () => mount(chips, WHY.map((w) => h('button', { class: why === w ? 'on' : '', onclick: () => { why = w; drawChips(); } }, t(`whR_${w}`))));
    drawChips();
    return [h('h2', {}, l.name), q.el, h('label', { class: 'field' }, t('whReturnWhy'), chips),
      h('div', { class: 'actions' },
        h('button', { class: 'danger', onclick: () => { lines.splice(lines.indexOf(l), 1); close(); draw(); } }, t('remove')),
        h('span', { class: 'grow' }),
        h('button', { class: 'primary', onclick: () => { const v = q.read(); if (v == null || v <= 0) return toast(t('errQty'), 'error'); l.qtyMilli = v; l.why = why; close(); draw(); } }, t('save')))];
  });

  const scan = productBox({ big: true, onPick: (p) => {
    const l = lines.find((x) => x.barcode === p.barcode);
    if (l) l.qtyMilli += UNIT;
    else lines.push({ barcode: p.barcode, name: p.name || p.barcode, qtyMilli: UNIT, why: 'DAMAGED', costSen: p.costSen ?? 0 });
    draw(p.barcode);
  } });

  const save = async () => {
    if (!lines.length) return toast(t('errNoLines'), 'error');
    const s = (session.suppliers || []).find((x) => x.id === supplier.value);
    const value = lines.reduce((sum, l) => sum + Math.round(l.qtyMilli * (l.costSen || 0) / UNIT), 0);
    if (!await confirmBox(`${t('whNewReturn')}: ${s?.name || t('whNoSupplier')}\n${lines.length} ${t('whLines')} · ${rm(value)}`, t('save'), t('cancel'), { tone: 'primary' })) return;
    const now = Date.now();
    const returnNo = refNo('RTN');
    const po = pos.find((x) => x.id === poPick.value);
    const batch = writeBatch(db);
    batch.set(doc(db, ws(`supplierReturns/${id}`)), {
      returnNo, branchId: branch || '', supplierId: s?.id || '', supplierName: s?.name || '', poId: po?.id || '', poNo: po?.poNo || '',
      lines: lines.map((l) => ({ barcode: l.barcode, name: l.name, qtyMilli: l.qtyMilli, why: l.why, costSen: l.costSen || 0 })),
      valueSen: value, note: note.value.trim(), status: 'OPEN', createdByUid: session.uid, createdByName: session.name, createdAt: now,
    });
    for (const l of lines) {
      batch.set(doc(collection(db, ws('movements'))), movement(l, 'WRITE_OFF', l.qtyMilli, branch, {
        reason: 'SUPPLIER_RETURN', kind: 'SUPPLIER_RETURN', reference: returnNo, note: [s?.name, t(`whR_${l.why}`)].filter(Boolean).join(' · '),
      }));
    }
    audit(batch, 'SupplierReturn', id, returnNo, 'CREATE', { field: s?.name || '', newValue: `${lines.length} lines, ${formatSen(value)}` });
    send(batch, t('whReturnDone'));
    go('returns');
  };

  mount(main,
    head(t('whNewReturn')),
    h('div', { class: 'card wh-head' },
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, t('supplier'), supplier),
        myPlaces().length > 1 ? h('label', { class: 'field' }, t('whAt'), h('select', { onchange: (e) => { branch = e.target.value; } },
          myPlaces().map((p) => h('option', { value: p.id, selected: p.id === branch }, p.name)))) : h('div', { class: 'muted' }, `${t('whAt')}: ${placeName(branch)}`)),
      h('label', { class: 'field' }, t('whPoRef'), poPick)),
    h('div', { class: 'wh-scan' }, scan),
    linesBox,
    note,
    h('div', { class: 'wh-bar' },
      h('button', { onclick: () => go('returns') }, t('cancel')),
      h('button', { class: 'primary grow', 'data-act': 'ret-save', onclick: save }, icon('check', 18), t('save'))));
  draw();
  scan.focus();
  return null;
}
