/**
 * Taking payment and recording the sale.
 *
 * The till records how the customer paid -- cash, DuitNow QR, card,
 * e-wallet -- it does not move the money itself. Cash is rounded to 5 sen;
 * the rest is charged to the sen. A bill can be split across methods.
 *
 * The sale, the stock it takes off the shelves and the closing of a table's
 * open order are one batch: all of it is written or none of it, and with the
 * internet down it is kept on this computer and sent when it is back.
 */
import { collection, db, doc, increment, writeBatch } from './fb.js';
import { pointsEarned, pointsValueSen } from './customers.js';
import { h, modal, mount, toast } from './dom.js';
import { paymentLabel, t } from './i18n.js';
import { formatSen, parseSen, receiptNo, rm, settle, lineTotal } from './money.js';
import { session, ws } from './session.js';
import { printView, receiptView } from './receipt.js';
import { directReady, printDirect } from './rawprint.js';

export function openPayment(cart, totals, { onPaid }) {
  const payments = [];
  const methods = [...(session.settings.paymentMethods?.length ? session.settings.paymentMethods : ['CASH'])];
  // Points pay for part of a bill when the shop runs a loyalty scheme and
  // the customer has enough to use.
  const loyalty = session.settings.loyaltyEnabled && cart.customer;
  const pointsCap = () => (loyalty && cart.customer.points >= (Number(session.settings.minRedeemPoints) || 0)
    ? pointsValueSen(cart.customer.points) - payments.filter((p) => p.method === 'POINTS').reduce((s, p) => s + p.amountSen, 0)
    : 0);
  if (pointsCap() > 0) methods.push('POINTS');
  let method = methods[0];

  const amount = h('input', { inputmode: 'decimal', autofocus: true, class: 'bigsum', style: { fontSize: '26px' } });
  const status = h('div', {});
  const list = h('div', {});
  const methodBox = h('div', { class: 'paymethods' });
  const quick = h('div', { class: 'quick' });
  const done = h('button', { class: 'primary', style: { minHeight: '52px', fontSize: '17px' } }, t('completeSale'));

  const current = () => settle(totals.totalSen, payments);
  // What the amount box should start at: what is still owed, rounded if cash.
  const suggested = () => {
    const s = settle(totals.totalSen, [...payments, { method, amountSen: 0 }]);
    return method === 'POINTS' ? Math.min(s.dueSen, pointsCap()) : s.dueSen;
  };

  function draw() {
    mount(methodBox, methods.map((m) => h('button', {
      type: 'button',
      class: m === method ? 'on' : '',
      onclick: () => { method = m; amount.value = formatSen(suggested()); draw(); amount.focus(); amount.select(); },
    }, paymentLabel(m))));

    const due = suggested();
    mount(quick, method === 'CASH'
      ? [due, ...[5, 10, 20, 50, 100].map((r) => r * 100).filter((v) => v > due)].slice(0, 5)
        .map((v) => h('button', { type: 'button', onclick: () => { amount.value = formatSen(v); addPayment(); } }, v === due ? t('exact') : `RM ${v / 100}`))
      : []);

    mount(list, payments.map((p, i) => h('div', { class: 'row' },
      h('span', { class: 'grow' }, paymentLabel(p.method)),
      h('span', { class: 'num' }, formatSen(p.amountSen)),
      h('button', { class: 'ghost', type: 'button', onclick: () => { payments.splice(i, 1); amount.value = formatSen(suggested()); draw(); } }, '✕'))));

    const s = current();
    if (loyalty) {
      list.append(h('p', { class: 'muted', style: { margin: 0 } },
        `👤 ${cart.customer.name} · ${cart.customer.points} ${t('points')} (${rm(pointsValueSen(cart.customer.points))})`));
    }
    mount(status,
      h('div', { class: 'bigsum' }, s.dueSen > 0 ? `${t('due')} ${rm(s.dueSen)}` : `${t('change')} ${rm(s.changeSen)}`),
      s.roundingSen ? h('div', { class: 'muted', style: { textAlign: 'center' } }, `${t('rounding')} ${formatSen(s.roundingSen)}`) : null);
    done.disabled = s.dueSen > 0 || payments.length === 0;
  }

  function addPayment() {
    const sen = parseSen(amount.value);
    if (sen == null || sen <= 0) return toast(t('errAmount'), 'error');
    // Only cash can be more than is owed -- that is what change is.
    const owed = suggested();
    if (method !== 'CASH' && sen > owed) return toast(t('errOverpay'), 'error');
    if (method === 'POINTS' && sen > pointsCap()) return toast(t('errNotEnoughPoints'), 'error');
    payments.push({ method, amountSen: sen });
    amount.value = formatSen(suggested());
    draw();
    if (current().dueSen === 0) done.focus();
  }

  amount.value = formatSen(totals.totalSen);
  amount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (current().dueSen === 0 && payments.length) done.click();
      else addPayment();
    }
  });

  const close = modal((closeFn) => {
    done.onclick = async () => {
      done.disabled = true;
      try {
        const sale = await recordSale(cart, totals, payments);
        closeFn();
        onPaid();
        afterSale(sale);
      } catch (err) {
        done.disabled = false;
        toast(err.message || String(err), 'error');
      }
    };
    return [
      h('h2', {}, `${t('charge')} ${rm(totals.totalSen)}`),
      methodBox,
      h('div', { class: 'row' }, h('div', { class: 'grow' }, amount), h('button', { type: 'button', onclick: addPayment }, t('addPayment'))),
      quick,
      list,
      status,
      h('div', { class: 'actions' }, h('button', { type: 'button', onclick: closeFn }, t('cancel')), done),
    ];
  }, { wide: true });
  draw();
  amount.select();
  return close;
}

async function recordSale(cart, totals, payments) {
  const s = settle(totals.totalSen, payments);
  const saleRef = doc(collection(db, ws('sales')));
  const now = Date.now();
  const lines = cart.lines.map((l, i) => ({
    barcode: l.barcode,
    name: l.name,
    categoryId: l.categoryId || '',
    qtyMilli: l.qtyMilli,
    unitPriceSen: l.unitPriceSen,
    discountSen: l.discountSen || 0,
    lineTotalSen: lineTotal(l),
    costSen: l.costSen ?? null,
    modifiers: l.modifiers || [],
    note: l.note || '',
    taxIds: totals.lineTaxIds?.[i] ?? [],
  }));
  const sale = {
    receiptNo: receiptNo(new Date(now)),
    branchId: session.branchId,
    branchName: session.branchName(),
    cashierUid: session.uid,
    cashierName: session.name,
    shiftId: session.shift?.id || '',
    createdAt: now,
    status: 'COMPLETED',
    orderType: cart.orderType || 'RETAIL',
    table: cart.table || '',
    lines,
    subtotalSen: totals.subtotalSen,
    discounts: totals.discounts,
    discountSen: totals.discountSen,
    serviceChargeSen: totals.serviceChargeSen,
    taxSen: totals.taxSen,
    taxes: totals.taxes || [],
    untaxedSen: totals.untaxedSen || 0,
    taxIncluded: totals.taxIncluded,
    totalSen: totals.totalSen,
    roundingSen: s.roundingSen,
    payments,
    paidSen: s.paidSen,
    changeSen: s.changeSen,
  };
  if (cart.customer) {
    const pointsPaid = payments.filter((p) => p.method === 'POINTS').reduce((sum, p) => sum + p.amountSen, 0);
    const value = Number(session.settings.pointValueSen) || 1;
    const redeemed = Math.ceil(pointsPaid / value);
    const earned = session.settings.loyaltyEnabled ? pointsEarned(totals.totalSen - pointsPaid) : 0;
    Object.assign(sale, {
      customerId: cart.customer.id,
      customerName: cart.customer.name,
      customerPhone: cart.customer.phone || '',
      pointsEarned: earned,
      pointsRedeemed: redeemed,
      pointsBalance: Math.max(0, cart.customer.points - redeemed + earned),
    });
  }

  const batch = writeBatch(db);
  batch.set(saleRef, sale);
  cart.lines.forEach((l, i) => {
    // Made-to-order dishes and prices typed for a barcode nobody listed have
    // no shelf to take stock off.
    if (l.trackStock === false || !session.find(l.barcode)) return;
    batch.set(doc(db, ws(`movements/pos-${saleRef.id}-${i}`)), {
      barcode: session.find(l.barcode).barcode,
      productName: l.name,
      branchId: session.branchId,
      type: 'SALE',
      quantityMilli: l.qtyMilli,
      at: now,
      source: 'POS',
      reference: sale.receiptNo,
      note: '',
      createdByUid: session.uid,
      createdByName: session.name,
      createdAt: now,
    });
  });
  if (cart.orderId) batch.delete(doc(db, ws(`orders/${cart.orderId}`)));
  if (cart.customer) {
    // A merge, not an update: an update of a customer someone has just
    // deleted fails, and a batch that fails loses the sale with it.
    batch.set(doc(db, ws(`customers/${cart.customer.id}`)), {
      points: increment((sale.pointsEarned || 0) - (sale.pointsRedeemed || 0)),
      visits: increment(1),
      totalSpentSen: increment(sale.totalSen),
      lastVisitAt: now,
      updatedAt: now,
    }, { merge: true });
  }

  // Not awaited: offline, commit() only settles once the server has it, and
  // the next customer should not wait for the internet. The local copy is
  // already written; a refusal from the server is shown when it comes.
  batch.commit().catch((err) => toast(`${t('errSaleNotSaved')} ${sale.receiptNo}: ${err.message}`, 'error'));
  return sale;
}

/**
 * The receipt: straight to the printer when one is connected (the cash
 * drawer opens for cash), through the browser's print box otherwise.
 */
function printReceipt(sale, { first = false } = {}) {
  const cash = sale.payments.some((p) => p.method === 'CASH');
  const drawer = first && cash && session.settings.drawerOnCash !== false;
  if (directReady()) {
    return printDirect(sale, { openDrawer: drawer }).catch((err) => { toast(err.message || String(err), 'error'); printView(receiptView(sale)); });
  }
  return printView(receiptView(sale));
}

function afterSale(sale) {
  if (session.settings.autoPrint !== false) printReceipt(sale, { first: true });
  else if (directReady() && sale.payments.some((p) => p.method === 'CASH') && session.settings.drawerOnCash !== false) {
    import('./rawprint.js').then((m) => m.openDrawer()).catch(() => {});
  }
  // data-after-sale: the register closes this box when the next scan
  // starts, so the next customer's first item is not lost behind it.
  modal((close) => [
    h('span', { 'data-after-sale': true, hidden: true, onclick: close }),
    h('div', { class: 'bigsum' }, sale.changeSen ? `${t('change')} ${rm(sale.changeSen)}` : t('paid')),
    h('p', { class: 'muted', style: { textAlign: 'center', margin: 0 } }, sale.receiptNo),
    h('div', { class: 'actions' },
      h('button', { onclick: () => printReceipt(sale) }, `🖨 ${t('printReceipt')}`),
      h('button', { class: 'primary', autofocus: true, onclick: close }, t('newSale'))),
  ]);
}
