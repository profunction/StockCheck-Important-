/**
 * Orders customers send by QR code, at the till (the customer's side is
 * web/order/, the sending is api/selforder.mjs).
 *
 * A bell in the till's bar counts what is waiting. Each order is accepted
 * -- into its table's bill (made if the table is free), or as a takeaway
 * ticket with its pickup number -- or turned down with a reason the
 * customer sees. Accepting prints the kitchen ticket when the shop uses
 * them. A takeaway order is marked ready when it can be collected; it is
 * done when its bill is paid.
 */
import { collection, db, doc, getDoc, onSnapshot, query, setDoc, updateDoc, where } from './fb.js';
import { dateTime, h, modal, mount, toast } from './dom.js';
import { addStrings, t } from './i18n.js';
import { icon } from './icons.js';
import { formatQty, rm } from './money.js';
import { session, ws } from './session.js';
import { kitchenView, printView } from './receipt.js';

addStrings({
  en: {
    qrBell: 'QR orders', qrNone: 'No QR orders waiting.', qrAccept: 'Accept', qrReject: 'Turn down', qrReady: 'Ready to collect', qrPickup: 'Pickup',
    qrRejectWhy: 'Why? The customer sees this.', qrRejectDefault: 'Sorry, we cannot take this order now.', qrAccepted: 'Accepted',
    qrRejected: 'Turned down', qrReadyDone: 'Customer told it is ready', qrWaiting: 'Waiting', qrInKitchen: 'Accepted, not yet collected',
    qrNew: 'New QR order',
  },
  zh: {
    qrBell: '扫码订单', qrNone: '没有等着的扫码订单。', qrAccept: '接单', qrReject: '不接', qrReady: '好了，叫取餐', qrPickup: '取餐号',
    qrRejectWhy: '原因（顾客会看到）', qrRejectDefault: '对不起，现在没办法接这张单。', qrAccepted: '已接单',
    qrRejected: '已拒绝', qrReadyDone: '已通知顾客取餐', qrWaiting: '等着接', qrInKitchen: '已接单，还没取',
    qrNew: '新的扫码订单',
  },
  ms: {
    qrBell: 'Pesanan QR', qrNone: 'Tiada pesanan QR menunggu.', qrAccept: 'Terima', qrReject: 'Tolak', qrReady: 'Siap untuk diambil', qrPickup: 'No. ambil',
    qrRejectWhy: 'Sebab? Pelanggan akan nampak.', qrRejectDefault: 'Maaf, kami tidak dapat terima pesanan ini sekarang.', qrAccepted: 'Diterima',
    qrRejected: 'Ditolak', qrReadyDone: 'Pelanggan dimaklumkan sudah siap', qrWaiting: 'Menunggu', qrInKitchen: 'Diterima, belum diambil',
    qrNew: 'Pesanan QR baharu',
  },
});

export const qrOn = () => !!session.settings?.selfOrder?.enabled;

/** A short two-note chime for a new order; silent where the browser will not play. */
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.25);
      o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.3);
    });
  } catch { /* no sound here */ }
}

/**
 * Follows this branch's QR orders. [ctx] is the till's: openOrders() (the
 * open tickets), currentOrderId() and addToCurrent(lines, extra) for the
 * ticket on screen, and kitchenOn().
 * Returns { button, stop }.
 */
export function watchQrOrders(ctx) {
  let waiting = [];
  let accepted = [];
  let seen = null;
  const count = h('span', { class: 'count' }, '0');
  const button = h('button', { class: 'qr-bell', 'data-act': 'qr-orders', 'data-help': 'qr', onclick: () => openList(ctx, () => ({ waiting, accepted })) },
    icon('receipt', 18), t('qrBell'), count);
  // open: still needs the till -- new, or a takeaway not yet called.
  const q = query(collection(db, ws('selfOrders')), where('branchId', '==', session.branchId || ''), where('open', '==', true));
  const stop = onSnapshot(q, (snap) => {
    const all = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => a.createdAt - b.createdAt);
    waiting = all.filter((o) => o.status === 'NEW');
    accepted = all.filter((o) => o.status === 'ACCEPTED');
    // A takeaway paid before anyone pressed Ready: nothing more to do. (Given
    // a minute, so a ticket just made has surely reached this till.)
    const tickets = new Set(ctx.openOrders().map((x) => x.id));
    accepted.filter((o) => o.mergedInto && !tickets.has(o.mergedInto) && ctx.ordersLoaded() && Date.now() - (o.updatedAt || 0) > 60_000)
      .forEach((o) => handled(o, { open: false }).catch(() => {}));
    count.textContent = String(waiting.length);
    button.classList.toggle('ringing', waiting.length > 0);
    const ids = new Set(waiting.map((o) => o.id));
    if (seen && [...ids].some((id) => !seen.has(id))) { chime(); toast(t('qrNew'), 'ok'); }
    seen = ids;
    window.dispatchEvent(new CustomEvent('qr-orders'));
  }, (err) => console.warn('selfOrders', err));
  return { button, stop };
}

const linesText = (o) => (o.lines || []).map((l) => h('div', {}, `${formatQty(l.qtyMilli)} × ${l.name}`,
  (l.modifiers || []).length ? h('span', { class: 'muted' }, ` (${l.modifiers.map((m) => m.name).join(', ')})`) : null,
  l.note ? h('div', { class: 'muted' }, `* ${l.note}`) : null));

const label = (o) => (o.orderType === 'DINE_IN' ? `${t('table')} ${o.table}` : `${t('qrPickup')} ${o.pickupNo}${o.customerName ? ` · ${o.customerName}` : ''}`);

function openList(ctx, lists) {
  modal((close) => {
    const body = h('div', { style: { display: 'grid', gap: '12px' } });
    const draw = () => {
      const { waiting, accepted } = lists();
      mount(body,
        waiting.length ? waiting.map((o) => h('div', { class: 'card qr-card', 'data-qr': o.id },
          h('div', { class: 'row' }, h('strong', { class: 'grow', style: { fontSize: '18px' } }, label(o)), h('span', { class: 'muted' }, dateTime(o.createdAt))),
          h('div', {}, linesText(o)),
          o.note ? h('div', { class: 'muted' }, `* ${o.note}`) : null,
          h('div', { class: 'row' }, h('strong', { class: 'grow' }, rm(o.totalSen || 0)),
            h('button', { class: 'danger', 'data-act': 'qr-reject', onclick: () => reject(o) }, t('qrReject')),
            h('button', { class: 'primary', 'data-act': 'qr-accept', onclick: () => accept(ctx, o).then(draw) }, t('qrAccept')))))
          : h('p', { class: 'muted' }, t('qrNone')),
        accepted.length ? h('h3', { style: { margin: '8px 0 0' } }, t('qrInKitchen')) : null,
        accepted.map((o) => h('div', { class: 'row qr-ready-row', 'data-qr': o.id },
          h('strong', { class: 'grow' }, label(o)),
          h('button', { 'data-act': 'qr-ready', onclick: () => ready(o) }, icon('check', 17), t('qrReady')))));
    };
    const redraw = () => draw();
    window.addEventListener('qr-orders', redraw);
    draw();
    return [h('h2', {}, t('qrBell')), body, h('div', { class: 'actions' }, h('button', { onclick: () => { window.removeEventListener('qr-orders', redraw); close(); } }, t('close')))];
  }, { wide: true });
}

const handled = (o, patch) => updateDoc(doc(db, ws(`selfOrders/${o.id}`)), { ...patch, handledByName: session.name, updatedAt: Date.now() });

/** Into the table's bill, or a new takeaway ticket; the kitchen gets its ticket. */
async function accept(ctx, o) {
  const now = Date.now();
  const lines = (o.lines || []).map((l) => ({ ...l, sent: false }));
  if (ctx.kitchenOn()) {
    printView(kitchenView({ table: o.orderType === 'DINE_IN' ? o.table : `${t('qrPickup')} ${o.pickupNo}`, orderType: o.orderType }, lines));
    lines.forEach((l) => { l.sent = true; });
  }
  const tableOrder = o.orderType === 'DINE_IN' ? ctx.openOrders().find((x) => x.table === o.table) : null;
  let orderId;
  try {
    if (tableOrder && tableOrder.id === ctx.currentOrderId()) {
      // The table is open on this screen: add to it here, so saving it keeps them.
      ctx.addToCurrent(lines, o.note);
      orderId = tableOrder.id;
    } else if (tableOrder) {
      const ref = doc(db, ws(`orders/${tableOrder.id}`));
      const fresh = (await getDoc(ref)).data() || tableOrder;
      await setDoc(ref, { ...fresh, lines: [...(fresh.lines || []), ...lines], note: [fresh.note, o.note].filter(Boolean).join(' · '), updatedAt: now });
      orderId = tableOrder.id;
    } else {
      const ref = doc(collection(db, ws('orders')));
      await setDoc(ref, {
        branchId: session.branchId || '', table: o.orderType === 'DINE_IN' ? o.table : '', pickupNo: o.orderType === 'TAKEAWAY' ? o.pickupNo : '',
        orderType: o.orderType, lines, discountIds: [], note: [o.customerName, o.note].filter(Boolean).join(' · '), customer: null,
        openedByUid: session.uid, openedByName: session.name, source: 'QR', updatedAt: now,
      });
      orderId = ref.id;
    }
    await handled(o, { status: 'ACCEPTED', mergedInto: orderId, open: o.orderType === 'TAKEAWAY' });
    toast(`${t('qrAccepted')} · ${label(o)}`, 'ok');
  } catch (err) {
    toast(err.message || String(err), 'error');
  }
}

function reject(o) {
  modal((close) => {
    const why = h('input', { value: t('qrRejectDefault'), maxlength: 120, 'aria-label': t('qrRejectWhy') });
    return [
      h('h2', {}, `${t('qrReject')} · ${label(o)}`),
      h('label', { class: 'field' }, t('qrRejectWhy'), why),
      h('div', { class: 'actions' },
        h('button', { onclick: close }, t('cancel')),
        h('button', { class: 'danger', 'data-act': 'qr-reject-go', onclick: () => {
          handled(o, { status: 'REJECTED', rejectReason: why.value.trim().slice(0, 120), open: false })
            .then(() => toast(t('qrRejected'), 'ok')).catch((e) => toast(e.message, 'error'));
          close();
        } }, t('qrReject'))),
    ];
  });
}

function ready(o) {
  handled(o, { status: 'READY', open: false }).then(() => toast(`${t('qrReadyDone')} · ${label(o)}`, 'ok')).catch((e) => toast(e.message, 'error'));
}
