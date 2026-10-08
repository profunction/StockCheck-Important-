/**
 * Receiving goods. A worker picks the purchase order the lorry brought (or
 * receives without one), scans what comes off it, notes what is damaged or
 * sent back, and completes it.
 *
 * What is written, all in one batch:
 * - a receiving record (what was ordered, received, damaged, rejected),
 *   never edited afterwards;
 * - a RECEIVE movement for what was received, so stock goes up for the
 *   SuXin Count app and the till at once;
 * - the purchase order's received and damaged figures, and its status;
 * - an audit entry.
 *
 * Damaged goods arrived, so they count against the order but not as stock.
 * Rejected goods went back on the lorry, so the order still waits for them.
 */
import { collection, db, doc, getDoc, getDocs, query, where, writeBatch } from '../js/fb.js';
import { confirmBox, dateTime, h, modal, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty, parseQty, UNIT } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import {
  audit, canBuy, canMove, failed, head, isMine, loading, movement, newId, outstanding, pill, placeName, productBox, refNo, send,
} from './common.js';
import { loadPurchaseOrders } from './data.js';
import { go } from './main.js';

const WEIGHED = ['kg', 'g', 'l', 'ml', 'm'];

export function render(main, sub) {
  if (!canMove()) { mount(main, head(t('whReceive')), h('p', { class: 'muted' }, t('noStockPermission'))); return null; }
  if (sub) return receiving(main, sub);
  const list = h('div', { class: 'wh-list' });
  const history = h('div');
  let open = [];
  // A parcel from an online order: scanning its tracking label finds the order.
  const parcel = h('input', { class: 'scan', placeholder: t('whScanParcel'), 'aria-label': t('whScanParcel'), autocomplete: 'off', onkeydown: (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = parcel.value.trim().toUpperCase();
    parcel.value = '';
    const po = code && open.find((p) => [p.trackingNo, p.onlineOrderNo, p.poNo].some((x) => x && String(x).toUpperCase() === code));
    if (po) go('receive', po.id); else if (code) toast(`${t('notFound')}: ${code}`, 'error');
  } });
  mount(main,
    head(t('whReceive'), h('button', { onclick: () => go('receive', 'free') }, icon('plus', 17), t('whReceiveNoPo'))),
    h('p', { class: 'muted' }, t('whReceiveHelp')),
    h('div', { class: 'wh-scan', style: { marginBottom: '12px' } }, h('div', { class: 'search-box' }, icon('barcode', 18), parcel)),
    list,
    h('h2', { style: { marginTop: '24px' } }, t('whRecentReceiving')),
    history);
  loading(list);
  loadPurchaseOrders().then((pos) => {
    open = pos.filter((p) => ['ORDERED', 'PARTIAL'].includes(p.status) && isMine(p.branchId))
      .sort((a, b) => ((a.branchId || '') === session.branchId ? -1 : 0) - ((b.branchId || '') === session.branchId ? -1 : 0) || (a.expectedAt || a.createdAt) - (b.expectedAt || b.createdAt));
    mount(list, open.length ? open.map((po) => {
      const left = (po.lines || []).reduce((s, l) => s + outstanding(l), 0);
      return h('button', { class: 'wh-card', onclick: () => go('receive', po.id) },
        h('div', { class: 'row' }, h('strong', { class: 'grow' }, po.poNo), pill(t(`po_${po.status}`), po.status === 'PARTIAL' ? 'warn' : 'good')),
        h('div', {}, po.supplierName || t('whNoSupplier'), po.trackingNo ? h('span', { class: 'muted' }, ` · ${t('whOnlineTracking')} ${po.trackingNo}`) : null),
        h('div', { class: 'muted' }, `${placeName(po.branchId)} · ${(po.lines || []).length} ${t('whLines')} · ${t('whStillToCome')} ${formatQty(left)}`,
          po.expectedAt ? ` · ${t('whExpected')} ${new Date(po.expectedAt).toLocaleDateString()}` : ''));
    }) : h('p', { class: 'muted' }, t('whNoOpenPos')));
  }).catch((err) => failed(list, err));
  loadHistory(history);
  return null;
}

async function loadHistory(box) {
  loading(box);
  try {
    const col = collection(db, ws('receivings'));
    const snap = await getDocs(session.branchIds.length ? query(col, where('branchId', 'in', [...session.branchIds, ''].slice(0, 30))) : col);
    const rows = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
    mount(box, rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, [t('whGrnNo'), t('poNo'), t('supplier'), t('whAt'), t('whReceivedQty'), t('whDamaged'), t('employee'), t('date')].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((r) => h('tr', { class: 'click', onclick: () => showReceiving(r) },
        h('td', {}, r.receivingNo), h('td', {}, r.poNo || '—'), h('td', {}, r.supplierName || ''), h('td', {}, placeName(r.branchId)),
        h('td', { class: 'num' }, formatQty((r.lines || []).reduce((s, l) => s + (l.receivedMilli || 0), 0))),
        h('td', { class: 'num' }, formatQty((r.lines || []).reduce((s, l) => s + (l.damagedMilli || 0), 0))),
        h('td', {}, r.createdByName || ''), h('td', { class: 'muted' }, dateTime(r.createdAt)))))))
      : h('p', { class: 'muted' }, t('whNoReceivingYet')));
  } catch (err) {
    failed(box, err);
  }
}

export function showReceiving(r) {
  modal((close) => [
    h('h2', {}, `${r.receivingNo}${r.poNo ? ` · ${r.poNo}` : ''}`),
    h('p', { class: 'muted', style: { margin: 0 } }, [r.supplierName, placeName(r.branchId), r.deliveryNo ? `${t('whDeliveryNo')} ${r.deliveryNo}` : '', r.createdByName, dateTime(r.createdAt)].filter(Boolean).join(' · ')),
    h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, [t('name'), t('whOrdered'), t('whReceivedQty'), t('whDamaged'), t('whRejected')].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
      h('tbody', {}, (r.lines || []).map((l) => h('tr', {}, h('td', {}, l.name || l.barcode),
        h('td', { class: 'num' }, l.orderedMilli != null ? formatQty(l.orderedMilli) : '—'),
        h('td', { class: 'num' }, formatQty(l.receivedMilli || 0)), h('td', { class: 'num' }, formatQty(l.damagedMilli || 0)), h('td', { class: 'num' }, formatQty(l.rejectedMilli || 0)))))),
    r.note ? h('p', { style: { margin: 0 } }, r.note) : null,
    h('div', { class: 'actions' }, h('button', { onclick: close }, t('close'))),
  ], { wide: true });
}

// ------------------------------------------------------------- one delivery

function receiving(main, sub) {
  const free = sub === 'free';
  const rid = newId('receivings');
  const state = { po: null, lines: [], supplierId: '', supplierName: '', branchId: session.branchId };
  const box = h('div');
  mount(main, head(t('whReceive')), box);
  loading(box);

  const start = async () => {
    if (!free) {
      const snap = await getDoc(doc(db, ws(`purchaseOrders/${sub}`)));
      if (!snap.exists()) { mount(box, h('p', { class: 'muted' }, t('notFound'))); return; }
      const po = { ...snap.data(), id: snap.id };
      if (!['ORDERED', 'PARTIAL'].includes(po.status)) {
        mount(box, h('p', { class: 'muted' }, `${po.poNo}: ${t(`po_${po.status}`)} — ${t('whNotReceivable')}`), h('button', { onclick: () => go('receive') }, t('back')));
        return;
      }
      Object.assign(state, { po, supplierId: po.supplierId || '', supplierName: po.supplierName || '', branchId: po.branchId || '' });
      state.lines = (po.lines || []).map((l) => ({
        barcode: l.barcode, name: l.name, unit: session.find(l.barcode)?.unit || '', orderedMilli: l.qtyMilli || 0,
        before: (l.receivedMilli || 0) + (l.damagedMilli || 0), received: 0, damaged: 0, rejected: 0,
      }));
    }
    draw();
  };

  const deliveryNo = h('input', { placeholder: t('whDeliveryNoHint') });
  const note = h('input', { placeholder: t('note') });
  const linesBox = h('div', { class: 'wh-lines' });
  const supplierPick = free ? h('select', { onchange: (e) => {
    const s = (session.suppliers || []).find((x) => x.id === e.target.value);
    state.supplierId = s?.id || ''; state.supplierName = s?.name || '';
  } }, h('option', { value: '' }, t('whNoSupplier')), (session.suppliers || []).map((s) => h('option', { value: s.id }, s.name))) : null;
  let flashed = '';

  const addOne = async (p) => {
    let line = state.lines.find((l) => l.barcode === p.barcode);
    if (!line) {
      if (!free && !await confirmBox(`${p.name || p.barcode}: ${t('whNotOnPo')}`, t('add'), t('cancel'), { tone: 'primary' })) return;
      line = { barcode: p.barcode, name: p.name || p.barcode, unit: p.unit || '', orderedMilli: free ? null : 0, before: 0, received: 0, damaged: 0, rejected: 0, extra: !free };
      state.lines.push(line);
    }
    flashed = line.barcode;
    // Weighed goods have no "one more": the worker types the weight.
    if (WEIGHED.includes((line.unit || '').toLowerCase())) {
      drawLines();
      editLine(line);
      return;
    }
    line.received += UNIT;
    drawLines();
  };
  const scan = productBox({ onPick: addOne, big: true });

  function status(l) {
    if (l.orderedMilli == null) return null;
    const after = l.before + l.received + l.damaged;
    if (after === l.orderedMilli) return pill(t('whExact'), 'good');
    if (after < l.orderedMilli) return pill(`${t('whShort')} ${formatQty(l.orderedMilli - after)}`, 'warn');
    return pill(`${t('whOver')} ${formatQty(after - l.orderedMilli)}`, 'bad');
  }

  function editLine(l) {
    const f = (v) => h('input', { inputmode: 'decimal', value: formatQty(v) });
    const rec = f(l.received); const dam = f(l.damaged); const rej = f(l.rejected);
    modal((close) => [
      h('h2', {}, l.name),
      l.orderedMilli != null ? h('p', { class: 'muted', style: { margin: 0 } }, `${t('whOrdered')} ${formatQty(l.orderedMilli)} · ${t('whAlready')} ${formatQty(l.before)}`) : null,
      h('label', { class: 'field' }, t('whReceivedQty'), rec),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('whDamaged'), dam), h('label', { class: 'field' }, t('whRejected'), rej)),
      h('p', { class: 'muted', style: { margin: 0 } }, t('whDamagedHelp')),
      h('div', { class: 'actions' },
        h('button', { class: 'danger', onclick: () => { state.lines.splice(state.lines.indexOf(l), 1); close(); drawLines(); } }, t('remove')),
        h('span', { class: 'grow' }),
        h('button', { onclick: close }, t('cancel')),
        h('button', { class: 'primary', onclick: () => {
          const r = parseQty(rec.value || '0'); const d = parseQty(dam.value || '0'); const j = parseQty(rej.value || '0');
          if ([r, d, j].some((x) => x == null || x < 0)) return toast(t('errQty'), 'error');
          Object.assign(l, { received: r, damaged: d, rejected: j });
          close(); drawLines();
        } }, t('save'))),
    ], { onClose: () => scan.focus() });
  }

  function drawLines() {
    const flash = flashed;
    flashed = '';
    mount(linesBox, state.lines.length ? state.lines.map((l) => {
      const step = (d) => (e) => { e.stopPropagation(); l.received = Math.max(0, l.received + d * UNIT); drawLines(); };
      return h('div', { class: `wh-line${l.barcode === flash ? ' flash' : ''}`, onclick: () => editLine(l) },
        h('div', { class: 'n' }, h('strong', {}, l.name), l.extra ? pill(t('whExtra'), 'warn') : null, status(l)),
        h('div', { class: 'muted' }, l.orderedMilli != null
          ? `${t('whOrdered')} ${formatQty(l.orderedMilli)} · ${t('whAlready')} ${formatQty(l.before)} · ${t('whNow')} ${formatQty(l.received)}`
          : `${l.barcode}`,
        l.damaged ? ` · ${t('whDamaged')} ${formatQty(l.damaged)}` : '', l.rejected ? ` · ${t('whRejected')} ${formatQty(l.rejected)}` : ''),
        h('div', { class: 'wh-step' },
          h('button', { type: 'button', onclick: step(-1), 'aria-label': '−' }, icon('minus', 18)),
          h('span', { class: 'q' }, formatQty(l.received)),
          h('button', { type: 'button', onclick: step(1), 'aria-label': '+' }, icon('plus', 18))));
    }) : h('p', { class: 'muted' }, t('whScanToStart')));
    if (flash) linesBox.querySelector('.flash')?.scrollIntoView({ block: 'nearest' });
  }

  function draw() {
    mount(box,
      h('div', { class: 'card wh-head' },
        h('div', { class: 'row' }, h('strong', { class: 'grow', style: { fontSize: '18px' } }, state.po ? state.po.poNo : t('whReceiveNoPo')),
          state.po ? pill(t(`po_${state.po.status}`), 'good') : null),
        state.po ? h('div', {}, `${state.supplierName || t('whNoSupplier')} · ${placeName(state.branchId)}`) : h('label', { class: 'field' }, t('supplier'), supplierPick),
        !state.po ? h('div', { class: 'muted' }, `${t('whAt')}: ${placeName(state.branchId)}`) : null,
        h('label', { class: 'field' }, t('whDeliveryNo'), deliveryNo)),
      h('div', { class: 'wh-scan' }, scan),
      state.po ? h('div', { class: 'row' }, h('button', { onclick: () => { state.lines.forEach((l) => { if (l.orderedMilli != null) l.received = Math.max(0, l.orderedMilli - l.before - l.damaged); }); drawLines(); } }, icon('check', 17), t('whReceiveAll'))) : null,
      linesBox,
      h('label', { class: 'field' }, t('note'), note),
      h('div', { class: 'wh-bar' },
        h('button', { onclick: () => go('receive') }, t('cancel')),
        h('button', { class: 'primary grow', onclick: complete }, icon('check', 18), t('whCompleteReceiving'))));
    drawLines();
    scan.focus();
  }

  async function complete() {
    const used = state.lines.filter((l) => l.received || l.damaged || l.rejected);
    if (!used.length) return toast(t('whNothingReceived'), 'error');
    const sum = (k) => used.reduce((s, l) => s + l[k], 0);
    const shortLines = state.po ? state.lines.filter((l) => l.orderedMilli != null && l.before + l.received + l.damaged < l.orderedMilli) : [];
    const ok = await confirmBox([
      `${t('whReceivedQty')}: ${formatQty(sum('received'))}`,
      sum('damaged') ? `${t('whDamaged')}: ${formatQty(sum('damaged'))}` : '',
      sum('rejected') ? `${t('whRejected')}: ${formatQty(sum('rejected'))}` : '',
      shortLines.length ? `${t('whStillShort')}: ${shortLines.length} ${t('whLines')}` : '',
    ].filter(Boolean).join('\n'), t('whCompleteReceiving'), t('cancel'), { tone: 'primary' });
    if (!ok) return;

    // Another worker may have received part of this order since it opened:
    // build on the order as it is now, not as it was.
    let po = state.po;
    if (po) {
      try { const fresh = await getDoc(doc(db, ws(`purchaseOrders/${po.id}`))); if (fresh.exists()) po = { ...fresh.data(), id: po.id }; } catch { /* offline: use what we have */ }
      if (!['ORDERED', 'PARTIAL'].includes(po.status)) return toast(`${po.poNo}: ${t(`po_${po.status}`)}`, 'error');
    }
    const now = Date.now();
    const receivingNo = refNo('GRN');
    const batch = writeBatch(db);
    batch.set(doc(db, ws(`receivings/${rid}`)), {
      receivingNo, poId: po?.id || '', poNo: po?.poNo || '', supplierId: state.supplierId, supplierName: state.supplierName,
      branchId: state.branchId, deliveryNo: deliveryNo.value.trim(), note: note.value.trim(),
      lines: used.map((l) => ({ barcode: l.barcode, name: l.name, orderedMilli: l.orderedMilli, receivedMilli: l.received, damagedMilli: l.damaged, rejectedMilli: l.rejected })),
      createdByUid: session.uid, createdByName: session.name, createdAt: now,
    });
    for (const l of used) {
      if (l.received > 0) {
        batch.set(doc(collection(db, ws('movements'))), movement({ barcode: l.barcode, name: l.name }, 'RECEIVE', l.received, state.branchId,
          { reference: receivingNo, note: [po?.poNo, state.supplierName].filter(Boolean).join(' · ') }));
      }
    }
    if (po) {
      const lines = (po.lines || []).map((pl) => {
        const got = used.find((l) => l.barcode === pl.barcode);
        return got ? { ...pl, receivedMilli: (pl.receivedMilli || 0) + got.received, damagedMilli: (pl.damagedMilli || 0) + got.damaged, rejectedMilli: (pl.rejectedMilli || 0) + got.rejected } : pl;
      });
      for (const l of used.filter((x) => x.extra && !lines.some((pl) => pl.barcode === x.barcode))) {
        lines.push({ barcode: l.barcode, name: l.name, qtyMilli: 0, costSen: session.find(l.barcode)?.costSen ?? 0, receivedMilli: l.received, damagedMilli: l.damaged, rejectedMilli: l.rejected });
      }
      const done = lines.every((l) => outstanding(l) === 0);
      batch.update(doc(db, ws(`purchaseOrders/${po.id}`)), { lines, status: done ? 'RECEIVED' : 'PARTIAL', receivedAt: now, updatedAt: now });
      // The buyer's price on the order becomes the product's cost.
      if (canBuy()) {
        for (const l of used) {
          const pl = lines.find((x) => x.barcode === l.barcode);
          const p = session.find(l.barcode);
          if (p && pl?.costSen && pl.costSen !== p.costSen && l.received > 0) batch.update(doc(db, ws(`products/${p.barcode}`)), { costSen: pl.costSen, updatedAt: now });
        }
      }
    }
    audit(batch, 'Receiving', rid, receivingNo, 'CREATE', {
      field: po ? po.poNo : 'no PO', newValue: `${formatQty(sum('received'))} received, ${formatQty(sum('damaged'))} damaged, ${formatQty(sum('rejected'))} rejected`,
    });
    send(batch, `${t('received')} · ${receivingNo}`);
    go('receive');
  }

  start().catch((err) => failed(box, err));
  return null;
}
