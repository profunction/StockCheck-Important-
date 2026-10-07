/**
 * Reports -> e-Invoice: the month's consolidated e-invoice for LHDN
 * MyInvois, from the receipts themselves (sst.js), as the JSON the portal
 * takes and a CSV for the accountant.
 */
import { collection, db, getDocs, query, where } from './fb.js';
import { download, h, mount } from './dom.js';
import { t } from './i18n.js';
import { rm, taxList } from './money.js';
import { session, ws } from './session.js';
import { buildConsolidatedEInvoice } from './sst.js';
import { menuButton } from './main.js';

const monthNow = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

/** The sales of [month] ('2026-09'), as the rules let this account read them. */
async function salesIn(month) {
  const [y, m] = month.split('-').map(Number);
  const from = new Date(y, m - 1, 1).getTime();
  const to = new Date(y, m, 1).getTime() - 1;
  const cs = [where('createdAt', '>=', from), where('createdAt', '<=', to)];
  const col = collection(db, ws('sales'));
  const q = session.branchIds.length ? query(col, where('branchId', 'in', [...session.branchIds, ''].slice(0, 30)), ...cs) : query(col, ...cs);
  return { from, to, sales: (await getDocs(q)).docs.map((d) => d.data()) };
}

/** Builds and downloads the consolidated e-invoice for [startDate]..[endDate] (ms). */
export function exportConsolidatedEInvoice(startDate, endDate, sales, format = 'json') {
  const s = session.settings;
  const result = buildConsolidatedEInvoice(sales, {
    from: startDate, to: endDate, taxes: taxList(s),
    seller: { name: s.shopName || session.companyName, tin: s.tin, brn: s.regNo, sstNo: s.sstNo, msic: s.msic, msicName: s.msicName,
      address: s.address, city: s.city, state: s.stateCode, postcode: s.postcode, phone: s.phone, email: s.email },
  });
  const name = `${result.invoiceNo}`;
  if (format === 'json') download(`${name}.json`, JSON.stringify(result.json, null, 2), 'application/json');
  else if (format === 'csv') download(`${name}.csv`, ['﻿', result.csv], 'text/csv;charset=utf-8');
  return result;
}

export function render(main) {
  let month = monthNow();
  const box = h('div');
  const picker = h('input', { type: 'month', value: month, style: { width: 'auto' }, onchange: (e) => { month = e.target.value; load(); } });
  const s = session.settings;
  let data = null;
  const load = async () => {
    mount(box, h('p', { class: 'muted' }, t('loading')));
    try {
      data = await salesIn(month);
      const r = exportConsolidatedEInvoice(data.from, data.to, data.sales, 'none');
      const row = (k, v) => h('tr', {}, h('td', {}, k), h('td', { class: 'num' }, v));
      mount(box, r.receipts ? [
        h('div', { class: 'table-wrap' }, h('table', { class: 'list' }, h('tbody', {},
          row(r.invoiceNo, `${r.receipts} ${t('receiptsIncluded')}`),
          row(t('subtotal'), rm(r.totals.exclusiveSen)),
          row(t('tax'), rm(r.totals.taxSen)),
          row(t('taxFreeSales'), rm(r.totals.exemptSen)),
          row(t('total'), rm(r.totals.totalSen + r.totals.roundingSen))))),
        h('div', { class: 'row', style: { marginTop: '12px' } },
          h('button', { class: 'primary', onclick: () => exportConsolidatedEInvoice(data.from, data.to, data.sales, 'json') }, `⬇ ${t('downloadJson')}`),
          h('button', { onclick: () => exportConsolidatedEInvoice(data.from, data.to, data.sales, 'csv') }, `⬇ ${t('downloadCsv')}`)),
      ] : h('p', { class: 'muted' }, t('einvoiceNone')));
    } catch (err) {
      mount(box, h('div', { class: 'card' }, `${t('errLoad')}: ${err.message || err}`));
    }
  };
  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('einvoiceTitle'))),
    h('p', { class: 'muted' }, t('einvoiceHelp')),
    !s.tin || !s.msic ? h('p', { class: 'card', style: { borderColor: 'var(--warn, #b54708)' } }, t('einvoiceMissing'), ' ', h('a', { href: '#/settings/receipt' }, t('setReceipt'))) : null,
    h('div', { class: 'row', style: { marginBottom: '16px' } }, h('label', {}, `${t('einvoiceMonth')} `, picker)),
    box);
  load();
  return null;
}
