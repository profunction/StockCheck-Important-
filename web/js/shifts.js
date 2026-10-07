/**
 * Cashier shifts at the till: open with the float counted into the drawer,
 * pay in and out during the shift, close with the cash counted again -- and
 * the slip says what should have been there and what was short or over.
 *
 * The sums are shift.js (pure, tested); this file reads and writes the
 * shifts and draws their screens. Every sale made while a shift is open
 * carries its shiftId (pay.js).
 */
import { collection, db, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from './fb.js';
import { confirmBox, dateTime, h, modal, mount, toast } from './dom.js';
import { paymentLabel, t } from './i18n.js';
import { formatSen, parseSen, rm } from './money.js';
import { session, ws } from './session.js';
import { cashMove, closeFigures, newShift, summarizeShift } from './shift.js';
import { printView } from './receipt.js';
import { directReady, openDrawer, printDirect } from './rawprint.js';

/** Tells every shift button on the page that the shift opened or closed. */
const announce = () => window.dispatchEvent(new Event('shift-change'));

/** Reads this cashier's open shift, if there is one, into session.shift. */
export async function loadOpenShift() {
  try {
    const snap = await getDocs(query(collection(db, ws('shifts')), where('operatorId', '==', session.uid), where('status', '==', 'OPEN'), limit(1)));
    const d = snap.docs[0];
    session.shift = d ? { ...d.data(), id: d.id } : null;
  } catch (err) {
    console.warn('shift', err);
    session.shift = session.shift || null;
  }
  return session.shift;
}

/** Opens a shift for [operatorId] with [initialFloatSen] in the drawer. */
export async function startShift(operatorId, initialFloatSen) {
  const ref = doc(collection(db, ws('shifts')));
  const shift = newShift({ operatorId, operatorName: session.name, branchId: session.branchId, branchName: session.branchName(), initialFloatSen });
  // Not awaited past the local write: a shift opens with the internet down too.
  const saved = setDoc(ref, shift);
  session.shift = { ...shift, id: ref.id };
  saved.catch((err) => toast(err.message || String(err), 'error'));
  announce();
  return session.shift;
}

async function loadShift(shiftId) {
  if (session.shift?.id === shiftId) return session.shift;
  const snap = await getDoc(doc(db, ws(`shifts/${shiftId}`)));
  if (!snap.exists()) throw new Error(t('notFound'));
  return { ...snap.data(), id: snap.id };
}

/** The sales of a shift: the cashier's own, as the rules let a cashier read them. */
async function salesOf(shift) {
  const cs = [where('shiftId', '==', shift.id), where('cashierUid', '==', shift.operatorId)];
  if (session.branchIds.length) cs.push(where('branchId', '==', shift.branchId || ''));
  const snap = await getDocs(query(collection(db, ws('sales')), ...cs));
  return snap.docs.map((d) => d.data());
}

/** Everything the shift slip prints, worked out from the shift's sales. */
export async function calculateShiftSummary(shiftId) {
  const shift = await loadShift(shiftId);
  return summarizeShift(shift, await salesOf(shift));
}

/** Closes [shiftId] with [actualCashSen] counted; prints the slip; returns the closed shift. */
export async function closeShift(shiftId, actualCashSen) {
  const shift = await loadShift(shiftId);
  const figures = closeFigures(shift, await salesOf(shift), actualCashSen, { closedByUid: session.uid, closedByName: session.name });
  await updateDoc(doc(db, ws(`shifts/${shiftId}`)), figures);
  const closed = { ...shift, ...figures };
  if (session.shift?.id === shiftId) session.shift = null;
  announce();
  printSlip(closed);
  return closed;
}

export async function addCashMove(type, amountSen, reason) {
  const shift = session.shift;
  if (!shift) throw new Error(t('shiftNeeded'));
  const moves = [...(shift.cashMoves || []), cashMove(type, amountSen, reason)];
  await updateDoc(doc(db, ws(`shifts/${shift.id}`)), { cashMoves: moves, updatedAt: Date.now() });
  shift.cashMoves = moves;
  if (directReady()) openDrawer().catch(() => {});
}

// ----------------------------------------------------------------- slips

export function slipView(shift) {
  const s = shift.summary || {};
  const row = (k, sen, bold) => h('div', { class: 'r', style: bold ? { fontWeight: 700 } : {} }, h('span', {}, k), h('span', {}, formatSen(sen || 0)));
  return h('div', { class: `receipt w${session.settings.paperWidth || 80}` },
    h('div', { class: 'c' }, h('strong', {}, session.settings.shopName || session.companyName)),
    h('div', { class: 'c' }, h('strong', {}, t('shiftSlip'))),
    h('hr'),
    h('div', {}, `${t('operator')}: ${shift.operatorName || ''}`),
    h('div', {}, `${t('opened')}: ${dateTime(shift.openedAt)}`),
    shift.closedAt ? h('div', {}, `${t('closedAtLabel')}: ${dateTime(shift.closedAt)}`) : null,
    h('hr'),
    h('div', { class: 'r' }, h('span', {}, t('receiptsCount')), h('span', {}, String(s.salesCount || 0))),
    row(t('grossSales'), s.grossSen),
    row(t('discounts'), -(s.discountsSen || 0)),
    row(`${t('voids')} (${s.voidCount || 0})`, s.voidsSen),
    h('hr'),
    Object.entries(s.byMethod || {}).filter(([, v]) => v).map(([m, v]) => row(paymentLabel(m), v)),
    h('hr'),
    row(t('floatLabel'), s.floatSen),
    row(`+ ${t('cashSales')}`, s.cashSalesSen),
    s.cashInSen ? row(`+ ${t('cashIn')}`, s.cashInSen) : null,
    s.cashOutSen ? row(`- ${t('cashOut')}`, -s.cashOutSen) : null,
    row(t('expectedCash'), s.expectedCashSen, true),
    shift.actualCashSen != null ? row(t('countedCash'), shift.actualCashSen) : null,
    shift.actualCashSen != null ? row(shift.shortOverSen < 0 ? t('short') : shift.shortOverSen > 0 ? t('over') : t('exact'), shift.shortOverSen, true) : null,
    h('br'),
    h('div', {}, `${t('signature')}: ____________________`));
}

export function printSlip(shift) {
  if (directReady()) {
    printDirect(shift, { kind: 'shift', openDrawer: false }).catch((err) => { toast(err.message || String(err), 'error'); printView(slipView(shift)); });
  } else {
    printView(slipView(shift));
  }
}

// ---------------------------------------------------------------- screens

const moneyInput = (value = '') => h('input', { inputmode: 'decimal', class: 'bigsum', style: { fontSize: '26px' }, value, autofocus: true });

/** Asks for the float and opens a shift; resolves the shift or null. */
export function openShiftDialog() {
  return new Promise((resolve) => {
    const amount = moneyInput('0.00');
    let opened = null;
    modal((close) => [
      h('h2', {}, t('openShift')),
      h('label', { class: 'field' }, t('openingFloat'), amount),
      h('div', { class: 'actions' },
        h('button', { onclick: close }, t('cancel')),
        h('button', {
          class: 'primary', onclick: async () => {
            const sen = parseSen(amount.value);
            if (sen == null || sen < 0) return toast(t('errAmount'), 'error');
            opened = await startShift(session.uid, sen);
            toast(t('shiftOpened'), 'ok');
            if (directReady()) openDrawer().catch(() => {});
            close();
          },
        }, t('openShift'))),
    ], { onClose: () => resolve(opened) });
    amount.select();
  });
}

/** The shift button's dialog: open one, or see this one and close it. */
export async function shiftDialog(onChange = () => {}) {
  if (!session.shift) {
    const s = await openShiftDialog();
    if (s) onChange();
    return;
  }
  const shift = session.shift;
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  const counted = moneyInput();
  const diff = h('div', { class: 'bigsum', style: { fontSize: '22px' } });
  let summary = null;
  const drawDiff = () => {
    const sen = parseSen(counted.value);
    if (!summary || sen == null) { diff.textContent = ''; return; }
    const d = sen - summary.expectedCashSen;
    diff.textContent = `${d < 0 ? t('short') : d > 0 ? t('over') : t('exact')} ${rm(Math.abs(d))}`;
    diff.style.color = d < 0 ? 'var(--bad, #b42318)' : d > 0 ? 'var(--warn, #b54708)' : 'var(--good, #1f6b45)';
  };
  counted.addEventListener('input', drawDiff);

  modal((close) => [
    h('h2', {}, `${t('shift')} · ${shift.operatorName || ''}`),
    h('p', { class: 'muted', style: { margin: 0 } }, `${t('shiftOpenSince')} ${dateTime(shift.openedAt)}`),
    box,
    h('div', { class: 'row' },
      h('button', { onclick: () => moveDialog('IN', () => close()) }, `+ ${t('cashIn')}`),
      h('button', { onclick: () => moveDialog('OUT', () => close()) }, `− ${t('cashOut')}`),
      directReady() ? h('button', { onclick: () => openDrawer().catch((e) => toast(e.message, 'error')) }, t('openDrawer')) : null),
    h('hr'),
    h('label', { class: 'field' }, t('countedCash'), counted),
    diff,
    h('div', { class: 'actions' },
      h('button', { onclick: close }, t('cancel')),
      h('button', {
        class: 'primary', onclick: async () => {
          const sen = parseSen(counted.value);
          if (sen == null || sen < 0) return toast(t('errAmount'), 'error');
          if (!await confirmBox(t('closeShiftQ'), t('closeShift'), t('cancel'), { tone: 'primary' })) return;
          try {
            await closeShift(shift.id, sen);
            toast(t('shiftClosed'), 'ok');
            close();
            onChange();
          } catch (err) { toast(err.message || String(err), 'error'); }
        },
      }, t('closeShift'))),
  ], { wide: true });

  try {
    summary = await calculateShiftSummary(shift.id);
    const row = (k, v) => h('div', { class: 'r' }, h('span', {}, k), h('strong', {}, v));
    mount(box, h('div', { class: 'shift-sum' },
      h('h3', { style: { margin: '10px 0 4px' } }, t('shiftSummary')),
      row(t('receiptsCount'), String(summary.salesCount)),
      row(t('grossSales'), rm(summary.grossSen)),
      Object.entries(summary.byMethod).filter(([, v]) => v).map(([m, v]) => row(paymentLabel(m), rm(v))),
      row(t('floatLabel'), rm(summary.floatSen)),
      summary.cashInSen ? row(t('cashIn'), rm(summary.cashInSen)) : null,
      summary.cashOutSen ? row(t('cashOut'), rm(summary.cashOutSen)) : null,
      row(t('expectedCash'), rm(summary.expectedCashSen))));
    drawDiff();
  } catch (err) {
    mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message}`));
  }
}

function moveDialog(type, done) {
  const amount = moneyInput();
  const reason = h('input', { placeholder: t('reason') });
  modal((close) => [
    h('h2', {}, type === 'IN' ? t('cashIn') : t('cashOut')),
    h('label', { class: 'field' }, t('amount'), amount),
    h('label', { class: 'field' }, t('reason'), reason),
    h('div', { class: 'actions' },
      h('button', { onclick: close }, t('cancel')),
      h('button', {
        class: 'primary', onclick: async () => {
          const sen = parseSen(amount.value);
          if (sen == null || sen <= 0) return toast(t('errAmount'), 'error');
          try { await addCashMove(type, sen, reason.value.trim()); toast(t('saved'), 'ok'); close(); done(); } catch (err) { toast(err.message || String(err), 'error'); }
        },
      }, t('save'))),
  ]);
}

/** A button for the register's bar: the shift's state; tap to open or close it. */
export function shiftButton(onChange) {
  const btn = h('button', { class: 'shift-btn', onclick: () => shiftDialog(() => { draw(); onChange?.(); }) });
  const draw = () => {
    btn.classList.toggle('open', !!session.shift);
    mount(btn, h('span', { class: 'dot' }), session.shift ? `${t('shift')} · ${new Date(session.shift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : t('shiftNone'));
  };
  draw();
  // Redrawn whenever a shift opens or closes anywhere on the page; the
  // listener goes when the button leaves the page.
  const onShift = () => { if (!btn.isConnected) window.removeEventListener('shift-change', onShift); else draw(); };
  window.addEventListener('shift-change', onShift);
  return btn;
}

/** Before taking a payment: true when selling may go ahead. */
export async function shiftReady() {
  if (!session.settings.requireShift || session.shift) return true;
  toast(t('shiftNeeded'), 'error');
  return Boolean(await openShiftDialog());
}

// ----------------------------------------------------------- the report

/** Reports -> Shifts: every shift in the range, with short or over. */
export async function renderShiftsReport(box, { from, to }) {
  // One equality filter or one range, never both: no extra index to deploy.
  const mine = !session.can('POS_REPORTS') && !session.can('POS_MANAGE');
  const q = mine ? query(collection(db, ws('shifts')), where('operatorId', '==', session.uid))
    : session.branchIds.length ? query(collection(db, ws('shifts')), where('branchId', '==', session.branchId))
      : query(collection(db, ws('shifts')), where('openedAt', '>=', from), where('openedAt', '<=', to));
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((s) => s.openedAt >= from && s.openedAt <= to).sort((a, b) => b.openedAt - a.openedAt);
  mount(box, rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
    h('thead', {}, h('tr', {}, [t('operator'), t('opened'), t('closedAtLabel'), t('grossSales'), t('expectedCash'), t('countedCash'), t('shortOver')]
      .map((x, i) => h('th', { class: i > 2 ? 'num' : '' }, x)))),
    h('tbody', {}, rows.map((s) => h('tr', { class: 'click', onclick: () => s.status === 'CLOSED' && printSlip(s) },
      h('td', {}, s.operatorName || ''), h('td', {}, dateTime(s.openedAt)),
      h('td', {}, s.closedAt ? dateTime(s.closedAt) : h('span', { class: 'pill good' }, t('stillOpen'))),
      h('td', { class: 'num' }, s.summary ? formatSen(s.summary.grossSen) : ''),
      h('td', { class: 'num' }, s.expectedCashSen != null ? formatSen(s.expectedCashSen) : ''),
      h('td', { class: 'num' }, s.actualCashSen != null ? formatSen(s.actualCashSen) : ''),
      h('td', { class: 'num', style: { color: s.shortOverSen < 0 ? 'var(--bad, #b42318)' : '' } }, s.shortOverSen != null ? formatSen(s.shortOverSen) : ''))))))
    : h('p', { class: 'muted' }, t('noData')));
  return rows.map((s) => [s.operatorName || '', new Date(s.openedAt).toISOString(), s.closedAt ? new Date(s.closedAt).toISOString() : '',
    formatSen(s.summary?.grossSen || 0), formatSen(s.expectedCashSen || 0), formatSen(s.actualCashSen || 0), formatSen(s.shortOverSen || 0)]);
}
