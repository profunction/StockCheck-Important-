/**
 * Purchase orders.
 *
 * DRAFT -> SUBMITTED -> APPROVED -> ORDERED -> PARTIAL -> RECEIVED -> CLOSED
 *                                       (or CANCELLED before anything arrives)
 *
 * A buyer raises and submits; someone with approval rights approves (an
 * owner who is both does it in one step); the order is sent to the supplier;
 * receiving fills it in. The rules enforce who may approve, not just this
 * screen. "Reorder" suggests orders from reorder points -- nothing is ordered
 * until somebody raises and approves one.
 */
import { collection, db, doc, getDoc, getDocs, query, where, writeBatch } from '../js/fb.js';
import { confirmBox, dateTime, h, modal, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty, formatSen, parseQty, parseSen, rm, UNIT } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import {
  audit, canApprove, canBuy, canMove, failed, head, isMine, loading, myPlaces, newId, outstanding, pill, placeName, PO_TONE, productBox, refNo, send,
} from './common.js';
import { loadAll, loadPurchaseOrders, reorderSuggestions, stockRows } from './data.js';
import { showReceiving } from './receive.js';
import { go } from './main.js';

const TABS = ['open', 'DRAFT', 'SUBMITTED', 'ORDERED', 'RECEIVED', 'all'];
let tab = 'open';

export const poTotal = (po) => (po.lines || []).reduce((s, l) => s + Math.round(((l.qtyMilli || 0) * (l.costSen || 0)) / 1000), 0);

export function render(main, sub) {
  if (sub === 'reorder') return reorder(main);
  if (sub) return openPo(main, sub);
  const box = h('div');
  const tabs = h('div', { class: 'seg wh-tabs' });
  mount(main,
    head(t('whPurchase'),
      canBuy() ? h('button', { onclick: () => go('online') }, icon('download', 17), t('whOnline')) : null,
      canBuy() ? h('button', { onclick: () => go('purchase', 'reorder') }, icon('percent', 17), t('whReorderTitle')) : null,
      canBuy() ? h('button', { class: 'primary', onclick: () => go('purchase', 'new') }, icon('plus', 17), t('newPo')) : null),
    h('p', { class: 'muted' }, t('whPurchaseHelp')),
    tabs, box);
  loading(box);
  loadPurchaseOrders().then((pos) => {
    const inTab = (po, k) => k === 'all' || (k === 'open' ? ['SUBMITTED', 'APPROVED', 'ORDERED', 'PARTIAL'].includes(po.status)
      : k === 'ORDERED' ? ['APPROVED', 'ORDERED', 'PARTIAL'].includes(po.status)
        : k === 'RECEIVED' ? ['RECEIVED', 'CLOSED', 'CANCELLED'].includes(po.status) : po.status === k);
    const draw = () => {
      mount(tabs, TABS.map((k) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } },
        `${t(`whPoTab_${k}`)} ${pos.filter((p) => inTab(p, k)).length}`)));
      const rows = pos.filter((p) => inTab(p, tab));
      mount(box, rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, [t('poNo'), t('supplier'), t('whDeliverTo'), t('date'), t('status'), t('total')].map((x, i) => h('th', { class: i === 5 ? 'num' : '' }, x)))),
        h('tbody', {}, rows.map((po) => h('tr', { class: 'click', onclick: () => go('purchase', po.id) },
          h('td', {}, h('strong', {}, po.poNo)), h('td', {}, po.supplierName || '—'), h('td', {}, placeName(po.branchId)),
          h('td', { class: 'muted' }, dateTime(po.createdAt)), h('td', {}, pill(t(`po_${po.status}`), PO_TONE[po.status])),
          h('td', { class: 'num' }, formatSen(poTotal(po))))))))
        : h('p', { class: 'muted' }, t('noPosYet')));
    };
    draw();
  }).catch((err) => failed(box, err));
  return null;
}

// ------------------------------------------------------------------- one PO

function openPo(main, sub) {
  const box = h('div');
  mount(main, head(t('whPurchase')), box);
  if (sub === 'new') {
    if (!canBuy()) { mount(box, h('p', { class: 'muted' }, t('whNoBuyPermission'))); return null; }
    const branchId = myPlaces().some((p) => p.id === session.branchId) ? session.branchId : (myPlaces()[0]?.id ?? '');
    edit(box, blankPo(branchId), true);
    return null;
  }
  loading(box);
  getDoc(doc(db, ws(`purchaseOrders/${sub}`))).then((snap) => {
    if (!snap.exists()) { mount(box, h('p', { class: 'muted' }, t('notFound'))); return; }
    const po = { ...snap.data(), id: snap.id };
    if (po.status === 'DRAFT' && canBuy()) edit(box, po, false);
    else view(box, po);
  }).catch((err) => failed(box, err));
  return null;
}

export function blankPo(branchId, extra = {}) {
  return {
    id: newId('purchaseOrders'), poNo: refNo('PO'), supplierId: '', supplierName: '', branchId, status: 'DRAFT', lines: [], note: '', expectedAt: null,
    createdByUid: session.uid, createdByName: session.name, createdAt: Date.now(), ...extra,
  };
}

function edit(box, po, isNew) {
  const supplier = h('select', {}, h('option', { value: '' }, '—'), (session.suppliers || []).map((s) => h('option', { value: s.id, selected: s.id === po.supplierId }, s.name)));
  const branch = h('select', {}, myPlaces().map((p) => h('option', { value: p.id, selected: p.id === (po.branchId || '') }, p.name)));
  const expected = h('input', { type: 'date', value: po.expectedAt ? new Date(po.expectedAt).toISOString().slice(0, 10) : '' });
  const note = h('input', { value: po.note || '' });
  const totalEl = h('strong');
  const linesBox = h('div', { class: 'wh-lines' });
  const drawLines = (flash = '') => {
    mount(linesBox, po.lines.length ? po.lines.map((l, i) => h('div', { class: `wh-line po${l.barcode === flash ? ' flash' : ''}` },
      h('div', { class: 'n' }, h('strong', {}, l.name || l.barcode)),
      h('div', { class: 'muted' }, l.barcode),
      h('div', { class: 'wh-po-fields' },
        h('label', { class: 'field' }, t('quantity'), h('input', { inputmode: 'decimal', value: formatQty(l.qtyMilli), onchange: (e) => { const q = parseQty(e.target.value); if (q > 0) l.qtyMilli = q; drawLines(); } })),
        h('label', { class: 'field' }, t('whUnitCost'), h('input', { inputmode: 'decimal', value: formatSen(l.costSen || 0), onchange: (e) => { const c = parseSen(e.target.value); if (c != null && c >= 0) l.costSen = c; drawLines(); } })),
        h('div', { class: 'field' }, t('total'), h('strong', { style: { paddingTop: '9px' } }, formatSen(Math.round(l.qtyMilli * (l.costSen || 0) / 1000)))),
        h('button', { type: 'button', class: 'ghost icon-btn', 'aria-label': t('remove'), onclick: () => { po.lines.splice(i, 1); drawLines(); } }, icon('trash', 17)))))
      : h('p', { class: 'muted' }, t('whScanToStart')));
    totalEl.textContent = rm(poTotal(po));
    if (flash) linesBox.querySelector('.flash')?.scrollIntoView({ block: 'nearest' });
  };
  const scan = productBox({
    onPick: (p) => {
      const l = po.lines.find((x) => x.barcode === p.barcode);
      if (l) l.qtyMilli += UNIT;
      else po.lines.push({ barcode: p.barcode, name: p.name || p.barcode, qtyMilli: UNIT, costSen: lastCost(p) });
      drawLines(p.barcode);
    },
  });
  const collect = () => {
    const s = (session.suppliers || []).find((x) => x.id === supplier.value);
    return { ...po, supplierId: supplier.value, supplierName: s?.name || '', branchId: branch.value, note: note.value.trim(),
      expectedAt: expected.value ? new Date(`${expected.value}T12:00:00`).getTime() : null, updatedAt: Date.now() };
  };
  const ref = doc(db, ws(`purchaseOrders/${po.id}`));
  const save = (status, message) => {
    const x = collect();
    if (!x.lines.length) return toast(t('errNoLines'), 'error');
    if (status !== 'DRAFT' && !x.supplierId) return toast(t('whPickSupplier'), 'error');
    const batch = writeBatch(db);
    batch.set(ref, { ...x, status, ...(status !== 'DRAFT' ? { submittedAt: Date.now(), submittedByName: session.name } : {}),
      ...(status === 'APPROVED' ? { approvedAt: Date.now(), approvedByUid: session.uid, approvedByName: session.name } : {}) });
    audit(batch, 'PurchaseOrder', po.id, po.poNo, isNew && status === 'DRAFT' ? 'CREATE' : 'STATUS_CHANGE', { field: 'status', oldValue: po.status, newValue: status });
    send(batch, message);
    go('purchase', status === 'DRAFT' ? '' : po.id);
  };
  mount(box,
    h('div', { class: 'card wh-head' },
      h('div', { class: 'row' }, h('strong', { class: 'grow', style: { fontSize: '18px' } }, po.poNo), pill(t('po_DRAFT'))),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('supplier'), supplier), h('label', { class: 'field' }, t('whDeliverTo'), branch)),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('whExpectedDate'), expected), h('label', { class: 'field' }, t('note'), note))),
    h('div', { class: 'wh-scan' }, scan),
    linesBox,
    h('div', { class: 'row', style: { justifyContent: 'flex-end', margin: '8px 0' } }, h('span', { class: 'muted' }, t('total')), totalEl),
    h('div', { class: 'wh-bar' },
      !isNew ? h('button', { class: 'danger', onclick: async () => {
        if (!await confirmBox(t('deletePoQ'), t('delete'), t('cancel'))) return;
        const batch = writeBatch(db);
        batch.delete(ref);
        audit(batch, 'PurchaseOrder', po.id, po.poNo, 'DELETE');
        send(batch, t('deleted'));
        go('purchase');
      } }, icon('trash', 17)) : null,
      h('button', { onclick: () => save('DRAFT', t('saved')) }, t('saveDraft')),
      canApprove()
        ? h('button', { class: 'primary grow', onclick: () => save('APPROVED', t('whApproved')) }, icon('check', 18), t('whSubmitApprove'))
        : h('button', { class: 'primary grow', onclick: () => save('SUBMITTED', t('whSubmitted')) }, icon('check', 18), t('whSubmit'))));
  drawLines();
}

/** The last price paid for [p], else its cost. */
function lastCost(p) {
  return p.costSen ?? 0;
}

function view(box, po) {
  const ref = doc(db, ws(`purchaseOrders/${po.id}`));
  const move = (status, extra = {}, message = t('saved')) => {
    const now = Date.now();
    const batch = writeBatch(db);
    batch.update(ref, { status, updatedAt: now, ...extra });
    audit(batch, 'PurchaseOrder', po.id, po.poNo, 'STATUS_CHANGE', { field: 'status', oldValue: po.status, newValue: status });
    send(batch, message);
    go('purchase', po.id);
  };
  const receivingsBox = h('div');
  const nothingArrived = (po.lines || []).every((l) => !(l.receivedMilli || 0) && !(l.damagedMilli || 0));
  const s = po.status;
  mount(box,
    h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { onclick: () => go('purchase') }, t('back')), h('span', { class: 'grow' }),
      (po.lines || []).length ? h('button', { 'data-act': 'po-cost', onclick: () => go('cost', po.id) }, icon('calc', 17), t('ccFromThisPo')) : null),
    h('div', { class: 'card wh-head' },
      h('div', { class: 'row' }, h('strong', { class: 'grow', style: { fontSize: '18px' } }, po.poNo), pill(t(`po_${s}`), PO_TONE[s])),
      h('div', {}, `${po.supplierName || '—'} → ${placeName(po.branchId)}`),
      h('div', { class: 'muted' }, [
        `${t('whRaisedBy')} ${po.createdByName || ''} ${dateTime(po.createdAt)}`,
        po.approvedByName ? `${t('whApprovedBy')} ${po.approvedByName} ${dateTime(po.approvedAt)}` : '',
        po.expectedAt ? `${t('whExpected')} ${new Date(po.expectedAt).toLocaleDateString()}` : '',
      ].filter(Boolean).join(' · ')),
      po.note ? h('div', {}, po.note) : null,
      po.source === 'ONLINE' && po.currency && po.currency !== 'MYR' ? h('div', { class: 'muted' }, `¥1 = RM ${(po.fxRateMicro / 1e6).toFixed(4)} · ${t('whOnlineShipping')} ${rm(po.shippingSen || 0)}`) : null),
    h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, [t('name'), t('whOrdered'), t('whReceivedQty'), t('whDamaged'), t('whStillToCome'), t('whUnitCost'), t('total')].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
      h('tbody', {}, (po.lines || []).map((l) => h('tr', {},
        h('td', {}, l.name || l.barcode, h('div', { class: 'muted', style: { fontSize: '12px' } }, l.barcode)),
        h('td', { class: 'num' }, formatQty(l.qtyMilli || 0)), h('td', { class: 'num' }, formatQty(l.receivedMilli || 0)),
        h('td', { class: 'num' }, l.damagedMilli ? formatQty(l.damagedMilli) : ''), h('td', { class: 'num', style: { fontWeight: 700 } }, formatQty(outstanding(l))),
        h('td', { class: 'num' }, formatSen(l.costSen || 0)), h('td', { class: 'num' }, formatSen(Math.round((l.qtyMilli || 0) * (l.costSen || 0) / 1000)))))),
      h('tfoot', {}, h('tr', {}, h('td', { colspan: 6 }, h('strong', {}, t('total'))), h('td', { class: 'num' }, h('strong', {}, rm(poTotal(po)))))))),
    h('div', { class: 'wh-bar' },
      h('button', { onclick: () => copyText(po) }, icon('receipt', 17), t('whCopyForSupplier')),
      h('button', { onclick: () => printPo(po) }, icon('printer', 17), t('print')),
      h('span', { class: 'grow' }),
      s === 'SUBMITTED' && (canBuy() || canApprove()) ? h('button', { onclick: () => move('DRAFT', {}, t('whSentBack')) }, t('whSendBack')) : null,
      s === 'SUBMITTED' && canApprove() ? h('button', { class: 'primary', onclick: () => move('APPROVED', { approvedAt: Date.now(), approvedByUid: session.uid, approvedByName: session.name }, t('whApproved')) }, icon('check', 18), t('whApprove')) : null,
      s === 'APPROVED' && canBuy() ? h('button', { class: 'primary', onclick: () => move('ORDERED', { orderedAt: Date.now() }, t('saved')) }, t('markOrdered')) : null,
      ['ORDERED', 'PARTIAL'].includes(s) && canMove() && isMine(po.branchId) ? h('button', { class: 'primary', onclick: () => go('receive', po.id) }, icon('download', 18), t('receiveGoods')) : null,
      ['SUBMITTED', 'APPROVED', 'ORDERED'].includes(s) && nothingArrived && (canBuy() || canApprove()) ? h('button', { class: 'danger', onclick: async () => {
        if (await confirmBox(t('whCancelPoQ'), t('cancelPo'), t('cancel'))) move('CANCELLED', { cancelledAt: Date.now() });
      } }, t('cancelPo')) : null,
      ['PARTIAL', 'RECEIVED'].includes(s) && (canBuy() || canApprove()) ? h('button', { onclick: async () => {
        if (await confirmBox(s === 'PARTIAL' ? t('whClosePartialQ') : t('whCloseQ'), t('whClosePo'), t('cancel'), { tone: 'primary' })) move('CLOSED', { closedAt: Date.now() });
      } }, t('whClosePo')) : null),
    h('h2', { style: { marginTop: '20px' } }, t('whDeliveries')),
    receivingsBox);
  loading(receivingsBox);
  getDocs(query(collection(db, ws('receivings')), where('poId', '==', po.id), ...(session.branchIds.length ? [where('branchId', '==', po.branchId || '')] : [])))
    .then((snap) => {
      const rows = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => a.createdAt - b.createdAt);
      mount(receivingsBox, rows.length ? h('div', { class: 'wh-list' }, rows.map((r) => h('button', { class: 'wh-card', onclick: () => showReceiving(r) },
        h('div', { class: 'row' }, h('strong', { class: 'grow' }, r.receivingNo), h('span', { class: 'muted' }, dateTime(r.createdAt))),
        h('div', { class: 'muted' }, `${r.createdByName || ''}${r.deliveryNo ? ` · ${t('whDeliveryNo')} ${r.deliveryNo}` : ''} · ${t('whReceivedQty')} ${formatQty((r.lines || []).reduce((x, l) => x + (l.receivedMilli || 0), 0))}`))))
        : h('p', { class: 'muted' }, t('whNoReceivingYet')));
    }).catch((err) => failed(receivingsBox, err));
}

/** The order as plain text, to paste into WhatsApp or an email to the supplier. */
function poText(po) {
  return [
    `${t('purchaseOrder')} ${po.poNo}`,
    session.settings.shopName || session.companyName,
    `${t('whDeliverTo')}: ${placeName(po.branchId)}`,
    po.expectedAt ? `${t('whExpectedDate')}: ${new Date(po.expectedAt).toLocaleDateString()}` : '',
    '',
    ...(po.lines || []).map((l, i) => `${i + 1}. ${l.name} (${l.barcode}) × ${formatQty(l.qtyMilli)} @ ${formatSen(l.costSen || 0)}`),
    '',
    `${t('total')}: ${rm(poTotal(po))}`,
    po.note || '',
  ].filter((x) => x !== null).join('\n').trim();
}

async function copyText(po) {
  const text = poText(po);
  try { await navigator.clipboard.writeText(text); toast(t('whCopied'), 'ok'); } catch {
    modal((close) => [h('h2', {}, po.poNo), h('textarea', { rows: 12, readonly: true }, text), h('div', { class: 'actions' }, h('button', { onclick: close }, t('close')))]);
  }
}

function printPo(po) {
  const w = window.open('', '_blank');
  if (!w) return;
  const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = (po.lines || []).map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.barcode)}</td><td style="text-align:right">${formatQty(l.qtyMilli)}</td><td style="text-align:right">${formatSen(l.costSen || 0)}</td><td style="text-align:right">${formatSen(Math.round(l.qtyMilli * (l.costSen || 0) / 1000))}</td></tr>`).join('');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(po.poNo)}</title>
<body style="font:14px system-ui;margin:24px"><h2>${esc(session.settings.shopName || session.companyName)}</h2>
<h1>${esc(t('purchaseOrder'))} ${esc(po.poNo)}</h1><p>${esc(t('supplier'))}: ${esc(po.supplierName)}<br>${esc(t('date'))}: ${new Date(po.createdAt).toLocaleDateString()}<br>${esc(t('whDeliverTo'))}: ${esc(placeName(po.branchId))}${po.expectedAt ? `<br>${esc(t('whExpectedDate'))}: ${new Date(po.expectedAt).toLocaleDateString()}` : ''}</p>
<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>${esc(t('name'))}</th><th>Barcode</th><th>${esc(t('quantity'))}</th><th>${esc(t('whUnitCost'))}</th><th>${esc(t('total'))}</th></tr>${rows}</table>
<p><b>${esc(t('total'))}: RM ${formatSen(poTotal(po))}</b></p><p>${esc(po.note || '')}</p>${po.approvedByName ? `<p>${esc(t('whApprovedBy'))}: ${esc(po.approvedByName)}</p>` : ''}<script>print()</script>`);
  w.document.close();
}

// ------------------------------------------------------------------ reorder

function reorder(main) {
  const box = h('div');
  let branch = myPlaces().some((p) => p.id === session.branchId) ? session.branchId : (myPlaces()[0]?.id ?? '');
  mount(main,
    head(t('whReorderTitle'),
      myPlaces().length > 1 ? h('select', { style: { width: 'auto' }, onchange: (e) => { branch = e.target.value; draw(); } },
        myPlaces().map((p) => h('option', { value: p.id, selected: p.id === branch }, p.name))) : null),
    h('p', { class: 'muted' }, t('whReorderPageHelp')),
    box);
  let data = null;
  const draw = () => {
    if (!data) return;
    const rows = reorderSuggestions(stockRows(data, branch));
    const picked = new Map(rows.map((r) => [r.key, r.suggestMilli]));
    if (!rows.length) { mount(box, h('div', { class: 'card' }, t('whNothingLow'))); return; }
    const groups = new Map();
    for (const r of rows) {
      const sid = r.product?.preferredSupplierId || '';
      if (!groups.has(sid)) groups.set(sid, []);
      groups.get(sid).push(r);
    }
    mount(box,
      [...groups].map(([sid, list]) => h('section', { class: 'card', style: { marginBottom: '14px' } },
        h('h2', {}, (session.suppliers || []).find((s) => s.id === sid)?.name || t('whNoSupplier')),
        h('table', { class: 'list' },
          h('thead', {}, h('tr', {}, [t('name'), t('onHand'), t('whOnOrder'), t('whReorderAt'), t('whMaxStock'), t('whToOrder')].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
          h('tbody', {}, list.map((r) => h('tr', {},
            h('td', {}, r.name || r.key), h('td', { class: 'num' }, formatQty(r.onHand)), h('td', { class: 'num' }, r.onOrder ? formatQty(r.onOrder) : ''),
            h('td', { class: 'num' }, formatQty(r.reorderLevel)), h('td', { class: 'num muted' }, r.product?.maxStockMilli != null ? formatQty(r.product.maxStockMilli) : `(${formatQty(r.reorderLevel * 2)})`),
            h('td', { class: 'num' }, h('input', { inputmode: 'decimal', style: { width: '90px', textAlign: 'right' }, value: formatQty(r.suggestMilli),
              onchange: (e) => { const q = parseQty(e.target.value); picked.set(r.key, q > 0 ? q : 0); } })))))))),
      h('div', { class: 'wh-bar' }, h('button', { class: 'primary grow', onclick: () => {
        const batch = writeBatch(db);
        let n = 0;
        for (const [sid, list] of groups) {
          const lines = list.filter((r) => picked.get(r.key) > 0).map((r) => ({ barcode: r.key, name: r.name || r.key, qtyMilli: picked.get(r.key), costSen: r.product?.costSen ?? 0 }));
          if (!lines.length) continue;
          const s = (session.suppliers || []).find((x) => x.id === sid);
          const po = blankPo(branch, { supplierId: s?.id || '', supplierName: s?.name || '', lines, note: t('whFromReorder') });
          batch.set(doc(db, ws(`purchaseOrders/${po.id}`)), po);
          audit(batch, 'PurchaseOrder', po.id, po.poNo, 'CREATE', { field: 'from', newValue: 'reorder suggestion' });
          n++;
        }
        if (!n) return toast(t('errNoLines'), 'error');
        send(batch, `${n} ${t('whDraftsMade')}`);
        tab = 'DRAFT';
        go('purchase');
      } }, icon('receipt', 18), t('whMakeDrafts'))));
  };
  loading(box);
  loadAll().then((d) => { data = d; draw(); }).catch((err) => failed(box, err));
  return null;
}
