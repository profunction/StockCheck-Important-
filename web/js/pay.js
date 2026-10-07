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
import { collection, db, doc, writeBatch } from './fb.js';
import { h, modal, mount, toast } from './dom.js';
import { paymentLabel, t } from './i18n.js';
import { formatSen, parseSen, receiptNo, rm, settle, lineTotal } from './money.js';
import { session, ws } from './session.js';
import { printView, receiptView } from './receipt.js';

export function openPayment(cart, totals, { onPaid }) {
  const payments = [];
  const methods = session.settings.paymentMethods?.length ? session.settings.paymentMethods : ['CASH'];
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
    return s.dueSen;
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
  const lines = cart.lines.map((l) => ({
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
  }));
  const sale = {
    receiptNo: receiptNo(new Date(now)),
    branchId: session.branchId,
    branchName: session.branchName(),
    cashierUid: session.uid,
    cashierName: session.name,
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
    taxIncluded: totals.taxIncluded,
    totalSen: totals.totalSen,
    roundingSen: s.roundingSen,
    payments,
    paidSen: s.paidSen,
    changeSen: s.changeSen,
  };

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

  // Not awaited: offline, commit() only settles once the server has it, and
  // the next customer should not wait for the internet. The local copy is
  // already written; a refusal from the server is shown when it comes.
  batch.commit().catch((err) => toast(`${t('errSaleNotSaved')} ${sale.receiptNo}: ${err.message}`, 'error'));
  return sale;
}

function afterSale(sale) {
  if (session.settings.autoPrint !== false) printView(receiptView(sale));
  modal((close) => [
    h('div', { class: 'bigsum' }, sale.changeSen ? `${t('change')} ${rm(sale.changeSen)}` : t('paid')),
    h('p', { class: 'muted', style: { textAlign: 'center', margin: 0 } }, sale.receiptNo),
    h('div', { class: 'actions' },
      h('button', { onclick: () => printView(receiptView(sale)) }, `🖨 ${t('printReceipt')}`),
      h('button', { class: 'primary', autofocus: true, onclick: close }, t('newSale'))),
  ]);
}
