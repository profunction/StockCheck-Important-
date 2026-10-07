/**
 * Receipts and kitchen tickets, printed through the browser.
 *
 * A thermal receipt printer (58 or 80 mm) installed on the computer is just
 * a printer to the browser. Set it as the default printer; Chrome started
 * with --kiosk-printing prints without asking, which is how a till should
 * behave. See the help on the Device settings page.
 */
import { h, mount, dateTime } from './dom.js';
import { formatQty, formatSen } from './money.js';
import { t, paymentLabel } from './i18n.js';
import { session } from './session.js';

function row(left, right, cls = '') {
  return h('div', { class: `r ${cls}` }, h('span', {}, left), h('span', {}, right));
}

/** The receipt for a sale document, as stored. */
export function receiptView(sale) {
  const s = session.settings;
  const narrow = Number(s.paperWidth) === 58;
  // Tax-free items are marked only on a bill that also has taxed ones.
  const mixed = (sale.taxSen || 0) > 0 && (sale.untaxedSen || 0) > 0;
  return h('div', { class: `receipt${narrow ? ' w58' : ''}` },
    s.shopName ? h('div', { class: 'c b big' }, s.shopName) : null,
    s.regNo ? h('div', { class: 'c' }, s.regNo) : null,
    s.address ? h('div', { class: 'c' }, s.address) : null,
    s.phone ? h('div', { class: 'c' }, s.phone) : null,
    s.sstNo ? h('div', { class: 'c' }, `SST: ${s.sstNo}`) : null,
    sale.status === 'VOIDED' ? h('div', { class: 'c b big' }, `*** ${t('voided')} ***`) : null,
    h('div', { class: 'hr' }),
    row(t('receiptNo'), sale.receiptNo),
    row(t('date'), dateTime(sale.createdAt)),
    row(t('cashier'), sale.cashierName || ''),
    sale.tillName ? row(t('tillN'), sale.tillName) : null,
    sale.table ? row(t('table'), sale.table) : null,
    sale.orderType && sale.orderType !== 'RETAIL' ? row(t('orderType'), t(`order_${sale.orderType}`)) : null,
    sale.customerName ? row(t('customer'), sale.customerName) : null,
    h('div', { class: 'hr' }),
    sale.lines.map((l) => [
      h('div', {}, mixed && Array.isArray(l.taxIds) && !l.taxIds.length ? `${l.name} *` : l.name),
      row(`  ${formatQty(l.qtyMilli)} x ${formatSen(l.unitPriceSen)}`, formatSen(l.lineTotalSen + (l.discountSen || 0))),
      (l.modifiers || []).map((m) => row(`  + ${m.name}`, m.priceSen ? formatSen(m.priceSen) : '', 'sub')),
      l.discountSen ? row(`  ${t('discount')}`, `-${formatSen(l.discountSen)}`, 'sub') : null,
      l.note ? h('div', { class: 'sub' }, `* ${l.note}`) : null,
    ]),
    h('div', { class: 'hr' }),
    row(t('subtotal'), formatSen(sale.subtotalSen)),
    (sale.discounts || []).map((d) => row(d.name, `-${formatSen(d.amountSen)}`)),
    sale.serviceChargeSen ? row(t('serviceCharge'), formatSen(sale.serviceChargeSen)) : null,
    Array.isArray(sale.taxes)
      ? sale.taxes.map((x) => row(`${x.name} ${x.pct}%${sale.taxIncluded ? ` (${t('included')})` : ''}`, formatSen(x.taxSen)))
      : sale.taxSen ? row(`${s.taxName || t('tax')}${sale.taxIncluded ? ` (${t('included')})` : ''}`, formatSen(sale.taxSen)) : null,
    mixed ? row(`* ${t('taxFreeItems')}`, formatSen(sale.untaxedSen), 'sub') : null,
    sale.roundingSen ? row(t('rounding'), formatSen(sale.roundingSen)) : null,
    row(t('total'), `RM ${formatSen(sale.totalSen + (sale.roundingSen || 0))}`, 'b big'),
    (sale.payments || []).map((p) => row(paymentLabel(p.method), formatSen(p.amountSen))),
    sale.changeSen ? row(t('change'), formatSen(sale.changeSen)) : null,
    h('div', { class: 'hr' }),
    sale.customerId && (sale.pointsEarned || sale.pointsRedeemed) ? [
      sale.pointsEarned ? row(t('pointsEarned'), String(sale.pointsEarned)) : null,
      sale.pointsRedeemed ? row(t('pointsUsed'), String(sale.pointsRedeemed)) : null,
      row(t('pointsBalance'), String(sale.pointsBalance ?? '')),
      h('div', { class: 'hr' }),
    ] : null,
    s.footer ? h('div', { class: 'c' }, s.footer) : null,
    h('div', { class: 'c', style: { marginTop: '6px' } }, sale.receiptNo));
}

/** What the kitchen needs: table, items, notes. No prices. */
export function kitchenView(order, lines) {
  return h('div', { class: 'receipt' },
    h('div', { class: 'c b big' }, t('kitchenTicket')),
    order.table ? h('div', { class: 'c b big' }, `${t('table')} ${order.table}`) : null,
    order.orderType ? h('div', { class: 'c' }, t(`order_${order.orderType}`)) : null,
    h('div', { class: 'c' }, dateTime(Date.now())),
    h('div', { class: 'hr' }),
    lines.map((l) => [
      h('div', { class: 'b big' }, `${formatQty(l.qtyMilli)} x ${l.name}`),
      (l.modifiers || []).map((m) => h('div', { class: 'sub' }, `+ ${m.name}`)),
      l.note ? h('div', { class: 'sub b' }, `* ${l.note}`) : null,
    ]),
    h('div', { class: 'hr' }));
}

/** Prints [view] on its own and puts the page back. */
export function printView(view) {
  const area = document.getElementById('print-area');
  mount(area, view);
  // Let the browser lay it out before the print dialog snapshots it.
  requestAnimationFrame(() => {
    window.print();
    setTimeout(() => mount(area), 500);
  });
}
