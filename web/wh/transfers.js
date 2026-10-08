/**
 * Moving stock between places: warehouse to shop, shop to shop, shop back to
 * the warehouse.
 *
 * DRAFT -> SENT (in transit) -> RECEIVED, or CANCELLED. When the company
 * asks for approval (Warehouses & branches), a worker's transfer goes
 * DRAFT -> PENDING -> APPROVED (by someone with the approve permission)
 * before it can be sent; the rules hold the same line.
 *
 * Dispatching takes the goods off the sending place at once (TRANSFER_OUT).
 * The receiving place gets nothing until somebody there checks the goods in
 * (TRANSFER_IN, for what actually arrived). Between the two the goods are in
 * transit -- in neither place -- and whatever never arrives is the
 * difference on the transfer, not a mystery at the next count.
 */
import { collection, db, doc, getDoc, writeBatch } from '../js/fb.js';
import { confirmBox, dateTime, h, modal, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty, parseQty, UNIT } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import {
  audit, canApprove, canMove, failed, head, isMine, loading, movement, myPlaces, newId, packButton, pill, placeName, places, productBox, qtyText, refNo, send, shelfTag, TR_TONE,
} from './common.js';
import { loadAll, loadTransfers, stockRows } from './data.js';
import { firstExpiry, lotsLeft } from '../js/wms.js';
import { go } from './main.js';

let tab = 'incoming';
/** Does a transfer need a manager's approval before it leaves? */
export const approvalOn = () => !!session.settings?.transferApproval;

export function render(main, sub) {
  if (!canMove() && !(canApprove() && approvalOn())) { mount(main, head(t('whTransfers')), h('p', { class: 'muted' }, t('noStockPermission'))); return null; }
  if (places().length < 2) {
    mount(main, head(t('whTransfers')), h('div', { class: 'card' }, h('p', { style: { marginTop: 0 } }, t('whTransfersNeedPlaces')),
      session.isAdmin ? h('button', { class: 'primary', onclick: () => go('places') }, t('whPlaces')) : null));
    return null;
  }
  if (sub) return open(main, sub);
  const box = h('div');
  const tabs = h('div', { class: 'seg wh-tabs' });
  mount(main,
    head(t('whTransfers'), h('button', { class: 'primary', onclick: () => go('transfers', 'new') }, icon('plus', 17), t('newTransfer'))),
    h('p', { class: 'muted' }, t('whTransfersHelp')),
    tabs, box);
  loading(box);
  loadTransfers().then((list) => {
    const groups = {
      incoming: list.filter((tr) => tr.status === 'SENT' && isMine(tr.toBranch)),
      transit: list.filter((tr) => tr.status === 'SENT'),
      ...(approvalOn() || list.some((tr) => ['PENDING', 'APPROVED'].includes(tr.status))
        ? { pending: list.filter((tr) => ['PENDING', 'APPROVED'].includes(tr.status)) } : {}),
      draft: list.filter((tr) => tr.status === 'DRAFT'),
      done: list.filter((tr) => ['RECEIVED', 'CANCELLED'].includes(tr.status)),
    };
    if (!groups[tab]) tab = 'incoming';
    if (canApprove() && groups.pending?.some((tr) => tr.status === 'PENDING') && !groups.incoming.length && tab === 'incoming') tab = 'pending';
    const draw = () => {
      mount(tabs, Object.keys(groups).map((k) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, `${t(`whTr_${k}`)} ${groups[k].length}`)));
      const rows = groups[tab];
      mount(box, rows.length ? h('div', { class: 'wh-list' }, rows.map((tr) => h('button', { class: 'wh-card', onclick: () => go('transfers', tr.id) },
        h('div', { class: 'row' }, h('strong', { class: 'grow' }, tr.transferNo), pill(t(`tr_${tr.status}`), TR_TONE[tr.status]),
          tr.hasVariance ? pill(t('whTransitDiff'), 'bad') : null),
        h('div', {}, `${placeName(tr.fromBranch)} → ${placeName(tr.toBranch)}`),
        h('div', { class: 'muted' }, `${(tr.lines || []).length} ${t('whLines')} · ${formatQty((tr.lines || []).reduce((s, l) => s + (l.qtyMilli || 0), 0))} · ${dateTime(tr.sentAt || tr.createdAt)}`))))
        : h('p', { class: 'muted' }, t('noTransfersYet')));
    };
    draw();
  }).catch((err) => failed(box, err));
  return null;
}

function open(main, sub) {
  const box = h('div');
  mount(main, head(t('whTransfers')), box);
  if (sub === 'new') {
    const from = myPlaces().some((p) => p.id === session.branchId) ? session.branchId : (myPlaces()[0]?.id ?? '');
    edit(box, { id: newId('transfers'), transferNo: refNo('TR'), fromBranch: from, toBranch: '', status: 'DRAFT', lines: [], note: '', createdByUid: session.uid, createdByName: session.name, createdAt: Date.now() }, true);
    return null;
  }
  loading(box);
  getDoc(doc(db, ws(`transfers/${sub}`))).then((snap) => {
    if (!snap.exists()) { mount(box, h('p', { class: 'muted' }, t('notFound'))); return; }
    const tr = { ...snap.data(), id: snap.id };
    if (tr.status === 'DRAFT' && canMove()) edit(box, tr, false);
    else if (tr.status === 'SENT' && isMine(tr.toBranch) && canMove()) receive(box, tr);
    else view(box, tr);
  }).catch((err) => failed(box, err));
  return null;
}

/** Lines with − / + and a typed quantity; [field] is which number they edit; [at] is where they are picked from. */
function lineList(lines, field, { onChange, extra, at = null } = {}) {
  const box = h('div', { class: 'wh-lines' });
  const draw = (flash = '') => {
    mount(box, lines.length ? lines.map((l, i) => {
      const step = (d) => (e) => { e.stopPropagation(); l[field] = Math.max(0, (l[field] || 0) + d * UNIT); draw(); onChange?.(); };
      const product = session.find(l.barcode);
      return h('div', { class: `wh-line${l.barcode === flash ? ' flash' : ''}`, 'data-line': l.barcode },
        h('div', { class: 'n' }, h('strong', {}, l.name || l.barcode), at != null ? shelfTag(product, at()) : null, extra?.(l)),
        h('div', { class: 'muted' }, l.barcode, (l[field] || 0) ? ` · ${qtyText(l[field], product)}` : ''),
        h('div', { class: 'wh-step' },
          packButton(product, (q) => { l[field] = (l[field] || 0) + q; draw(); onChange?.(); }),
          h('button', { type: 'button', onclick: step(-1), 'aria-label': '−' }, icon('minus', 18)),
          h('input', { class: 'q', inputmode: 'decimal', value: formatQty(l[field] || 0), onclick: (e) => e.stopPropagation(),
            onchange: (e) => { const q = parseQty(e.target.value); if (q != null && q >= 0) l[field] = q; draw(); onChange?.(); } }),
          h('button', { type: 'button', onclick: step(1), 'aria-label': '+' }, icon('plus', 18)),
          field === 'qtyMilli' ? h('button', { type: 'button', class: 'ghost icon-btn', 'aria-label': t('remove'), onclick: () => { lines.splice(i, 1); draw(); onChange?.(); } }, icon('trash', 17)) : null));
    }) : h('p', { class: 'muted' }, t('whScanToStart')));
    if (flash) box.querySelector('.flash')?.scrollIntoView({ block: 'nearest' });
  };
  box.redraw = draw;
  draw();
  return box;
}

function edit(box, tr, isNew) {
  const from = h('select', {}, myPlaces().map((p) => h('option', { value: p.id, selected: p.id === tr.fromBranch }, p.name)));
  // '-' is "not chosen yet": '' is a real place, the main shop.
  const to = h('select', {}, h('option', { value: '-' }, t('whPickDestination')), places().map((p) => h('option', { value: p.id }, p.name)));
  to.value = tr.toBranch == null || isNew ? '-' : tr.toBranch;
  const note = h('input', { value: tr.note || '', placeholder: t('note') });
  // What is free to send at each place, read in the background: on hand
  // less what is promised to customers.
  let data = null;
  loadAll().then((d) => { data = d; list.redraw(); }).catch(() => {});
  const freeAt = (branch) => new Map(stockRows(data, branch).map((r) => [r.key, r.available]));
  const extra = (l) => {
    if (!data) return null;
    const free = freeAt(from.value).get(l.barcode) ?? 0;
    return l.qtyMilli > free ? pill(`${t('whOverAvailable')} (${formatQty(free)})`, 'bad') : null;
  };
  const list = lineList(tr.lines, 'qtyMilli', { extra, at: () => from.value });
  from.onchange = () => list.redraw();
  const scan = productBox({
    big: true,
    onPick: (p) => {
      const l = tr.lines.find((x) => x.barcode === p.barcode);
      if (l) l.qtyMilli += UNIT;
      else tr.lines.push({ barcode: p.barcode, name: p.name || p.barcode, qtyMilli: UNIT });
      list.redraw(p.barcode);
    },
  });
  const collect = () => ({ ...tr, fromBranch: from.value, toBranch: to.value === '-' ? null : to.value, note: note.value.trim(), lines: tr.lines.filter((l) => l.qtyMilli > 0), updatedAt: Date.now() });
  const check = (x) => {
    if (x.toBranch == null) return t('whPickDestination');
    if (x.fromBranch === x.toBranch) return t('errSameBranch');
    if (!x.lines.length) return t('errNoLines');
    return '';
  };
  const ref = doc(db, ws(`transfers/${tr.id}`));
  mount(box,
    h('div', { class: 'card wh-head' },
      h('div', { class: 'row' }, h('strong', { class: 'grow', style: { fontSize: '18px' } }, tr.transferNo), pill(t('tr_DRAFT'))),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('fromBranch'), from), h('label', { class: 'field' }, t('toBranch'), to))),
    h('div', { class: 'wh-scan' }, scan),
    list,
    note,
    h('div', { class: 'wh-bar' },
      !isNew ? h('button', { class: 'danger', onclick: async () => {
        if (!await confirmBox(t('whDeleteDraftQ'), t('delete'), t('cancel'))) return;
        const batch = writeBatch(db);
        batch.delete(ref);
        audit(batch, 'Transfer', tr.id, tr.transferNo, 'DELETE');
        send(batch, t('deleted'));
        go('transfers');
      } }, icon('trash', 17)) : null,
      h('button', { onclick: () => {
        const x = collect();
        if (!x.lines.length) return toast(t('errNoLines'), 'error');
        const batch = writeBatch(db);
        batch.set(ref, x);
        if (isNew) audit(batch, 'Transfer', tr.id, tr.transferNo, 'CREATE');
        send(batch, t('saved'));
        go('transfers');
      } }, t('saveDraft')),
      approvalOn() && !canApprove()
        ? h('button', { class: 'primary grow', 'data-act': 'tr-submit', onclick: () => {
          const x = collect();
          const problem = check(x);
          if (problem) return toast(problem, 'error');
          const batch = writeBatch(db);
          batch.set(ref, { ...x, status: 'PENDING', submittedAt: Date.now(), submittedByName: session.name });
          audit(batch, 'Transfer', tr.id, tr.transferNo, 'STATUS_CHANGE', { field: 'status', oldValue: 'DRAFT', newValue: 'PENDING' });
          send(batch, t('whSubmitted'));
          go('transfers');
        } }, icon('check', 18), t('whSubmitTransfer'))
        : h('button', { class: 'primary grow', 'data-act': 'tr-dispatch', onclick: async () => {
          const x = collect();
          const problem = check(x);
          if (problem) return toast(problem, 'error');
          if (await dispatch(x, 'DRAFT', data)) go('transfers');
        } }, icon('box', 18), t('whDispatch'))));
  scan.focus();
}

/**
 * Sends [x] on its way: SENT, and the goods off the sending place. Each
 * line carries the earliest expiry date still on the sender's shelf (the
 * oldest goes first), so the receiving place knows it too.
 */
async function dispatch(x, from, data) {
  if (!await confirmBox(`${t('whDispatchQ')}\n${placeName(x.fromBranch)} → ${placeName(x.toBranch)} · ${x.lines.length} ${t('whLines')}`, t('whDispatch'), t('cancel'), { tone: 'primary' })) return false;
  if (!data) data = await loadAll().catch(() => null);
  const now = Date.now();
  const batch = writeBatch(db);
  // Kept beside the lines, not in them: an approved transfer's lines are
  // exactly what was approved.
  const expiries = {};
  for (const l of data ? x.lines : []) {
    const onHand = stockRows(data, x.fromBranch).find((r) => r.key === l.barcode)?.onHand ?? 0;
    const moves = data.stock.moves.filter((m) => m.barcode === l.barcode && (m.branchId || '') === (x.fromBranch || ''));
    const expiry = firstExpiry(lotsLeft(moves, onHand));
    if (expiry) expiries[l.barcode] = expiry;
  }
  batch.set(doc(db, ws(`transfers/${x.id}`)), { ...x, expiries, status: 'SENT', sentAt: now, sentByUid: session.uid, sentByName: session.name, updatedAt: now });
  for (const l of x.lines) {
    batch.set(doc(collection(db, ws('movements'))), movement(l, 'TRANSFER_OUT', l.qtyMilli, x.fromBranch, { reference: x.transferNo, note: `→ ${placeName(x.toBranch)}` }));
  }
  audit(batch, 'Transfer', x.id, x.transferNo, 'STATUS_CHANGE', { field: 'status', oldValue: from, newValue: 'SENT' });
  send(batch, t('sent'));
  return true;
}

function receive(box, tr) {
  const lines = (tr.lines || []).map((l) => ({ ...l, gotMilli: 0 }));
  const extra = (l) => (l.gotMilli === l.qtyMilli ? pill(t('whExact'), 'good')
    : l.gotMilli < l.qtyMilli ? pill(`${t('whShort')} ${formatQty(l.qtyMilli - l.gotMilli)}`, 'warn') : pill(`${t('whOver')} ${formatQty(l.gotMilli - l.qtyMilli)}`, 'bad'));
  const list = lineList(lines, 'gotMilli', { extra, at: () => tr.toBranch });
  const scan = productBox({
    big: true,
    onPick: (p) => {
      const l = lines.find((x) => x.barcode === p.barcode);
      if (!l) return toast(`${p.name}: ${t('whNotOnTransfer')}`, 'error');
      l.gotMilli += UNIT;
      list.redraw(p.barcode);
    },
  });
  mount(box,
    h('div', { class: 'card wh-head' },
      h('div', { class: 'row' }, h('strong', { class: 'grow', style: { fontSize: '18px' } }, tr.transferNo), pill(t('tr_SENT'), 'warn')),
      h('div', {}, `${placeName(tr.fromBranch)} → ${placeName(tr.toBranch)}`),
      h('div', { class: 'muted' }, `${t('whSentBy')} ${tr.sentByName || ''} · ${dateTime(tr.sentAt || tr.createdAt)}`, tr.note ? ` · ${tr.note}` : '')),
    h('p', { class: 'muted' }, t('whReceiveTransferHelp')),
    h('div', { class: 'wh-scan' }, scan),
    h('div', { class: 'row' }, h('button', { onclick: () => { lines.forEach((l) => { l.gotMilli = l.qtyMilli; }); list.redraw(); } }, icon('check', 17), t('whAllArrived'))),
    list,
    h('div', { class: 'wh-bar' },
      h('button', { onclick: () => go('transfers') }, t('cancel')),
      h('button', { class: 'primary grow', onclick: async () => {
        const short = lines.filter((l) => l.gotMilli !== l.qtyMilli);
        if (!await confirmBox(short.length ? `${t('whTransitDiffQ')}\n${short.map((l) => `${l.name}: ${formatQty(l.gotMilli)} / ${formatQty(l.qtyMilli)}`).join('\n')}` : t('whConfirmArrived'), t('receiveTransfer'), t('cancel'), { tone: 'primary' })) return;
        const now = Date.now();
        const batch = writeBatch(db);
        const out = lines.map(({ gotMilli, ...l }) => ({ ...l, receivedMilli: gotMilli, diffMilli: gotMilli - l.qtyMilli }));
        batch.update(doc(db, ws(`transfers/${tr.id}`)), {
          status: 'RECEIVED', lines: out, hasVariance: short.length > 0, receivedAt: now, receivedByUid: session.uid, receivedByName: session.name, updatedAt: now,
        });
        for (const l of out.filter((x) => x.receivedMilli > 0)) {
          batch.set(doc(collection(db, ws('movements'))), movement(l, 'TRANSFER_IN', l.receivedMilli, tr.toBranch, { reference: tr.transferNo, note: `← ${placeName(tr.fromBranch)}`, expiry: tr.expiries?.[l.barcode] || '' }));
        }
        audit(batch, 'Transfer', tr.id, tr.transferNo, 'STATUS_CHANGE', { field: 'status', oldValue: 'SENT', newValue: short.length ? `RECEIVED (${short.length} lines differ)` : 'RECEIVED' });
        send(batch, t('received'));
        go('transfers');
      } }, icon('check', 18), t('receiveTransfer'))));
  scan.focus();
}

function view(box, tr) {
  const mineFrom = isMine(tr.fromBranch);
  const now = () => Date.now();
  // Approving, sending back, and sending an approved one on its way.
  const decide = (status, msg) => {
    const batch = writeBatch(db);
    batch.update(doc(db, ws(`transfers/${tr.id}`)), status === 'APPROVED'
      ? { status, approvedByUid: session.uid, approvedByName: session.name, approvedAt: now(), updatedAt: now() }
      : { status, updatedAt: now() });
    audit(batch, 'Transfer', tr.id, tr.transferNo, 'STATUS_CHANGE', { field: 'status', oldValue: tr.status, newValue: status });
    send(batch, msg);
    go('transfers');
  };
  mount(box,
    h('div', { class: 'card wh-head' },
      h('div', { class: 'row' }, h('strong', { class: 'grow', style: { fontSize: '18px' } }, tr.transferNo), pill(t(`tr_${tr.status}`), TR_TONE[tr.status])),
      h('div', {}, `${placeName(tr.fromBranch)} → ${placeName(tr.toBranch)}`),
      h('div', { class: 'muted' }, [tr.submittedByName && `${t('whSubmitted')}: ${tr.submittedByName}`, tr.approvedByName && `${t('whApproved')}: ${tr.approvedByName} ${dateTime(tr.approvedAt)}`,
        tr.sentByName && `${t('whSentBy')} ${tr.sentByName} ${dateTime(tr.sentAt)}`, tr.receivedByName && `${t('whReceivedBy')} ${tr.receivedByName} ${dateTime(tr.receivedAt)}`].filter(Boolean).join(' · ')),
      tr.status === 'PENDING' && !canApprove() ? h('p', { class: 'muted', style: { margin: 0 } }, t('whNeedsApproval')) : null),
    h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, [t('name'), t('whSent'), t('whArrived'), t('whDiff')].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
      h('tbody', {}, (tr.lines || []).map((l) => h('tr', {}, h('td', {}, l.name || l.barcode, tr.expiries?.[l.barcode] ? h('div', { class: 'muted', style: { fontSize: '12px' } }, `${t('whExpiry')} ${tr.expiries[l.barcode]}`) : null),
        h('td', { class: 'num' }, qtyText(l.qtyMilli, session.find(l.barcode))),
        h('td', { class: 'num' }, l.receivedMilli != null ? formatQty(l.receivedMilli) : '—'),
        h('td', { class: 'num', style: { color: l.diffMilli ? 'var(--danger)' : '' } }, l.diffMilli ? formatQty(l.diffMilli) : '')))))),
    h('div', { class: 'wh-bar' },
      h('button', { onclick: () => go('transfers') }, t('back')),
      tr.status === 'PENDING' && canApprove() ? h('button', { 'data-act': 'tr-sendback', onclick: () => decide('DRAFT', t('whSentBack')) }, t('whRejectTransfer')) : null,
      tr.status === 'PENDING' && canApprove() ? h('button', { class: 'primary grow', 'data-act': 'tr-approve', onclick: () => decide('APPROVED', t('whApproved')) }, icon('check', 18), t('whApproveTransfer')) : null,
      tr.status === 'APPROVED' && mineFrom && canMove() ? h('button', { class: 'primary grow', 'data-act': 'tr-dispatch', onclick: async () => {
        if (await dispatch(tr, 'APPROVED', null)) go('transfers');
      } }, icon('box', 18), t('whDispatch')) : null,
      tr.status === 'SENT' && mineFrom ? h('button', { class: 'danger', onclick: async () => {
        if (!await confirmBox(t('whCancelSentQ'), t('whCancelTransfer'), t('cancel'))) return;
        const now = Date.now();
        const batch = writeBatch(db);
        batch.update(doc(db, ws(`transfers/${tr.id}`)), { status: 'CANCELLED', cancelledAt: now, cancelledByName: session.name, updatedAt: now });
        for (const l of tr.lines || []) {
          batch.set(doc(collection(db, ws('movements'))), movement(l, 'TRANSFER_IN', l.qtyMilli, tr.fromBranch, { reference: tr.transferNo, note: t('whReturnedToSender') }));
        }
        audit(batch, 'Transfer', tr.id, tr.transferNo, 'STATUS_CHANGE', { field: 'status', oldValue: 'SENT', newValue: 'CANCELLED' });
        send(batch, t('saved'));
        go('transfers');
      } }, t('whCancelTransfer')) : null));
}
