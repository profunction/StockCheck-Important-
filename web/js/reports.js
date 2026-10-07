/**
 * Reports, worked out from the sale documents in the chosen period.
 *
 * Everything is computed here from the receipts themselves, so no report can
 * disagree with the receipts it came from. Voided sales are left out of every
 * figure and counted on their own.
 */
import { collection, db, doc, getDocs, orderBy, query, where, writeBatch } from './fb.js';
import { confirmBox, dateTime, h, isoDay, modal, mount, toast } from './dom.js';
import { paymentLabel, t } from './i18n.js';
import { formatQty, formatSen, lineAmount, rm } from './money.js';
import { session, ws } from './session.js';
import { printView, receiptView } from './receipt.js';
import { menuButton } from './main.js';

let range = { from: isoDay(), to: isoDay() };
let branchFilter = 'ALL';
let employeeFilter = 'ALL';
let sales = [];
let loadedKey = '';

export function render(main, sub) {
  const box = h('div');
  const controls = h('div', { class: 'row', style: { marginBottom: '16px' } });
  const titleKey = {
    summary: 'repSummary', items: 'repItems', categories: 'repCategories', employees: 'repEmployees', payments: 'repPayments',
    receipts: 'repReceipts', modifiers: 'repModifiers', discounts: 'repDiscounts', taxes: 'repTaxes',
  }[sub] || 'repSummary';
  let exportRows = null;

  const draw = () => {
    const list = filtered();
    const out = (REPORTS[sub] || REPORTS.summary)(list);
    exportRows = out.csv;
    mount(box, out.view);
  };

  const load = async () => {
    const key = `${range.from}|${range.to}`;
    if (key === loadedKey) return draw();
    mount(box, h('p', { class: 'muted' }, t('loading')));
    try {
      sales = await fetchSales(range);
      loadedKey = key;
      draw();
    } catch (err) {
      mount(box, h('div', { class: 'card' }, `${t('errLoad')}: ${err.message || err}`));
    }
  };

  const from = h('input', { type: 'date', value: range.from, style: { width: 'auto' }, onchange: (e) => { range.from = e.target.value; load(); } });
  const to = h('input', { type: 'date', value: range.to, style: { width: 'auto' }, onchange: (e) => { range.to = e.target.value; load(); } });
  const preset = (label, days, offset = 0) => h('button', {
    onclick: () => {
      const end = new Date();
      end.setDate(end.getDate() - offset);
      const start = new Date(end);
      start.setDate(start.getDate() - (days - 1));
      range = { from: isoDay(start), to: isoDay(end) };
      from.value = range.from;
      to.value = range.to;
      load();
    },
  }, label);
  const branchSel = session.branches.length && !session.branchIds.length ? h('select', {
    style: { width: 'auto' }, onchange: (e) => { branchFilter = e.target.value; draw(); },
  }, h('option', { value: 'ALL' }, t('allBranches')),
  [{ id: '', name: t('mainShop') }, ...session.branches].map((b) => h('option', { value: b.id, selected: branchFilter === b.id }, b.name))) : null;
  const empSel = h('select', {
    style: { width: 'auto' }, onchange: (e) => { employeeFilter = e.target.value; draw(); },
    onfocus: (e) => {
      const names = [...new Map(sales.map((s) => [s.cashierUid, s.cashierName])).entries()];
      mount(e.target, h('option', { value: 'ALL' }, t('allEmployees')), names.map(([uid, name]) => h('option', { value: uid, selected: employeeFilter === uid }, name || uid)));
    },
  }, h('option', { value: 'ALL' }, t('allEmployees')));

  mount(controls,
    preset(t('today'), 1), preset(t('yesterday'), 1, 1), preset(t('last7'), 7), preset(t('last30'), 30),
    from, '–', to, branchSel, empSel,
    h('span', { class: 'grow' }),
    h('button', { onclick: () => exportRows && downloadCsv(`${sub}-${range.from}_${range.to}.csv`, exportRows()) }, `⬇ ${t('exportCsv')}`));

  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t(titleKey))),
    !session.can('POS_REPORTS') ? h('p', { class: 'muted' }, t('ownSalesOnly')) : null,
    controls, box);
  load();
  return null;
}

function filtered() {
  return sales
    .filter((s) => branchFilter === 'ALL' || (s.branchId || '') === branchFilter)
    .filter((s) => employeeFilter === 'ALL' || s.cashierUid === employeeFilter);
}

async function fetchSales({ from, to }) {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime() + 24 * 3600 * 1000;
  const col = collection(db, ws('sales'));
  const range = [where('createdAt', '>=', start), where('createdAt', '<', end), orderBy('createdAt', 'desc')];
  let queries;
  if (!session.can('POS_REPORTS')) {
    queries = [query(col, where('cashierUid', '==', session.uid), ...range)];
  } else if (session.branchIds.length) {
    queries = [query(col, where('branchId', 'in', [...session.branchIds, ''].slice(0, 30)), ...range)];
  } else {
    queries = [query(col, ...range)];
  }
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  return snaps.flatMap((s) => s.docs.map((d) => ({ ...d.data(), id: d.id })));
}

// ------------------------------------------------------------------ helpers

const done = (list) => list.filter((s) => s.status !== 'VOIDED');
const grossOf = (l) => lineAmount(l.qtyMilli, l.unitPriceSen);
const costOf = (l) => (l.costSen == null ? null : lineAmount(l.qtyMilli, l.costSen));

function table(headers, rows, onRow) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
    h('thead', {}, h('tr', {}, headers.map(([label, num]) => h('th', { class: num ? 'num' : '' }, label)))),
    h('tbody', {}, rows.length
      ? rows.map((r, i) => h('tr', { class: onRow ? 'click' : '', onclick: onRow ? () => onRow(i) : null },
        r.map((cell, j) => h('td', { class: headers[j][1] ? 'num' : '' }, cell))))
      : h('tr', {}, h('td', { colspan: headers.length, class: 'muted' }, t('noSalesInPeriod'))))));
}

function stat(label, value) {
  return h('div', { class: 'card stat' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value));
}

function group(list, keyOf, init, add) {
  const map = new Map();
  for (const item of list) {
    for (const [key, extra] of keyOf(item)) {
      if (!map.has(key)) map.set(key, init(key, extra));
      add(map.get(key), item, extra);
    }
  }
  return [...map.values()];
}

/** The figures every summary-style report starts from. */
function totals(list) {
  const ok = done(list);
  const lines = ok.flatMap((s) => s.lines || []);
  const gross = lines.reduce((a, l) => a + grossOf(l), 0);
  const lineDisc = lines.reduce((a, l) => a + (l.discountSen || 0), 0);
  const billDisc = ok.reduce((a, s) => a + (s.discountSen || 0), 0);
  const costLines = lines.filter((l) => l.costSen != null);
  const cogs = costLines.reduce((a, l) => a + costOf(l), 0);
  const net = gross - lineDisc - billDisc;
  return {
    receipts: ok.length,
    gross,
    discounts: lineDisc + billDisc,
    net,
    service: ok.reduce((a, s) => a + (s.serviceChargeSen || 0), 0),
    tax: ok.reduce((a, s) => a + (s.taxSen || 0), 0),
    collected: ok.reduce((a, s) => a + s.totalSen + (s.roundingSen || 0), 0),
    cogs,
    profit: net - cogs,
    costKnown: costLines.length === lines.length,
    voided: list.filter((s) => s.status === 'VOIDED'),
  };
}

// ------------------------------------------------------------------ reports

const REPORTS = {
  summary(list) {
    const x = totals(list);
    const oneDay = range.from === range.to;
    const buckets = group(done(list),
      (s) => [[oneDay ? `${String(new Date(s.createdAt).getHours()).padStart(2, '0')}:00` : isoDay(new Date(s.createdAt)), null]],
      (key) => ({ key, net: 0, n: 0 }),
      (b, s) => { b.n++; b.net += (s.lines || []).reduce((a, l) => a + l.lineTotalSen, 0) - (s.discountSen || 0); })
      .sort((a, b) => a.key.localeCompare(b.key));
    const max = Math.max(1, ...buckets.map((b) => b.net));
    return {
      view: [
        h('div', { class: 'cards' },
          stat(t('grossSales'), rm(x.gross)),
          stat(t('discounts'), rm(x.discounts)),
          stat(t('netSales'), rm(x.net)),
          stat(t('grossProfit'), x.costKnown ? rm(x.profit) : `${rm(x.profit)}*`),
          stat(t('receiptsCount'), String(x.receipts)),
          stat(t('averageSale'), rm(x.receipts ? Math.round(x.net / x.receipts) : 0)),
          stat(t('serviceCharge'), rm(x.service)),
          stat(session.settings.taxName || t('tax'), rm(x.tax)),
          stat(t('voidedSales'), `${x.voided.length} · ${rm(x.voided.reduce((a, s) => a + s.totalSen, 0))}`)),
        !x.costKnown ? h('p', { class: 'muted' }, t('profitNote')) : null,
        table([[oneDay ? t('hour') : t('date')], [t('receiptsCount'), true], [t('netSales'), true], ['']],
          buckets.map((b) => [b.key, String(b.n), formatSen(b.net),
            h('div', { style: { background: 'var(--brand)', height: '10px', borderRadius: '4px', width: `${Math.round((b.net / max) * 200)}px` } })])),
      ],
      csv: () => [[t('date'), t('receiptsCount'), t('netSales')], ...buckets.map((b) => [b.key, b.n, formatSen(b.net)])],
    };
  },

  items(list) {
    const rows = group(done(list), (s) => (s.lines || []).map((l) => [l.barcode || l.name, l]),
      (key, l) => ({ name: l.name, barcode: l.barcode, cat: l.categoryId, qty: 0, gross: 0, disc: 0, net: 0, cost: 0, costKnown: true }),
      (r, s, l) => {
        r.qty += l.qtyMilli; r.gross += grossOf(l); r.disc += l.discountSen || 0; r.net += l.lineTotalSen;
        if (l.costSen == null) r.costKnown = false; else r.cost += costOf(l);
      }).sort((a, b) => b.net - a.net);
    const catName = (id) => session.categories.find((c) => c.id === id)?.name || '';
    return {
      view: table([[t('name')], [t('category')], [t('qtySold'), true], [t('grossSales'), true], [t('discounts'), true], [t('netSales'), true], [t('cost'), true], [t('grossProfit'), true]],
        rows.map((r) => [r.name, catName(r.cat), formatQty(r.qty), formatSen(r.gross), formatSen(r.disc), formatSen(r.net),
          r.costKnown ? formatSen(r.cost) : '—', r.costKnown ? formatSen(r.net - r.cost) : '—'])),
      csv: () => [['Barcode', t('name'), t('category'), t('qtySold'), t('grossSales'), t('discounts'), t('netSales'), t('cost'), t('grossProfit')],
        ...rows.map((r) => [r.barcode, r.name, catName(r.cat), formatQty(r.qty), formatSen(r.gross), formatSen(r.disc), formatSen(r.net),
          r.costKnown ? formatSen(r.cost) : '', r.costKnown ? formatSen(r.net - r.cost) : ''])],
    };
  },

  categories(list) {
    const rows = group(done(list), (s) => (s.lines || []).map((l) => [l.categoryId || '', l]),
      (id) => ({ name: session.categories.find((c) => c.id === id)?.name || t('noCategory'), qty: 0, net: 0, cost: 0 }),
      (r, s, l) => { r.qty += l.qtyMilli; r.net += l.lineTotalSen; r.cost += costOf(l) || 0; }).sort((a, b) => b.net - a.net);
    return {
      view: table([[t('category')], [t('qtySold'), true], [t('netSales'), true], [t('cost'), true]],
        rows.map((r) => [r.name, formatQty(r.qty), formatSen(r.net), formatSen(r.cost)])),
      csv: () => [[t('category'), t('qtySold'), t('netSales'), t('cost')], ...rows.map((r) => [r.name, formatQty(r.qty), formatSen(r.net), formatSen(r.cost)])],
    };
  },

  employees(list) {
    const rows = group(list, (s) => [[s.cashierUid, s]], (uid, s) => ({ name: s.cashierName || uid, n: 0, net: 0, disc: 0, voided: 0 }),
      (r, s) => {
        if (s.status === 'VOIDED') { r.voided++; return; }
        r.n++; r.disc += (s.discountSen || 0) + (s.lines || []).reduce((a, l) => a + (l.discountSen || 0), 0);
        r.net += (s.lines || []).reduce((a, l) => a + l.lineTotalSen, 0) - (s.discountSen || 0);
      }).sort((a, b) => b.net - a.net);
    return {
      view: table([[t('employee')], [t('receiptsCount'), true], [t('discounts'), true], [t('netSales'), true], [t('averageSale'), true], [t('voidedSales'), true]],
        rows.map((r) => [r.name, String(r.n), formatSen(r.disc), formatSen(r.net), formatSen(r.n ? Math.round(r.net / r.n) : 0), String(r.voided)])),
      csv: () => [[t('employee'), t('receiptsCount'), t('discounts'), t('netSales'), t('voidedSales')], ...rows.map((r) => [r.name, r.n, formatSen(r.disc), formatSen(r.net), r.voided])],
    };
  },

  payments(list) {
    const rows = group(done(list), (s) => (s.payments || []).map((p) => [p.method, { p, s }]),
      (m) => ({ method: m, n: 0, amount: 0 }),
      (r, s, { p }) => { r.n++; r.amount += p.amountSen; });
    // Change comes out of the cash drawer: what cash really took is cash paid minus change.
    const cash = rows.find((r) => r.method === 'CASH');
    if (cash) cash.amount -= done(list).reduce((a, s) => a + (s.changeSen || 0), 0);
    rows.sort((a, b) => b.amount - a.amount);
    return {
      view: table([[t('paymentType')], [t('transactions'), true], [t('amount'), true]],
        rows.map((r) => [paymentLabel(r.method), String(r.n), formatSen(r.amount)])),
      csv: () => [[t('paymentType'), t('transactions'), t('amount')], ...rows.map((r) => [paymentLabel(r.method), r.n, formatSen(r.amount)])],
    };
  },

  receipts(list) {
    const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
    return {
      view: table([[t('date')], [t('receiptNo')], [t('employee')], [t('orderType')], [t('total'), true], ['']],
        sorted.map((s) => [dateTime(s.createdAt), s.receiptNo, s.cashierName || '', s.table ? `${t('table')} ${s.table}` : t(`order_${s.orderType || 'RETAIL'}`),
          formatSen(s.totalSen + (s.roundingSen || 0)), s.status === 'VOIDED' ? h('span', { class: 'pill bad' }, t('voided')) : '']),
        (i) => openReceipt(sorted[i])),
      csv: () => [[t('date'), t('receiptNo'), t('employee'), t('total'), t('status')],
        ...sorted.map((s) => [new Date(s.createdAt).toISOString(), s.receiptNo, s.cashierName, formatSen(s.totalSen + (s.roundingSen || 0)), s.status])],
    };
  },

  modifiers(list) {
    const rows = group(done(list), (s) => (s.lines || []).flatMap((l) => (l.modifiers || []).map((m) => [`${m.group}|${m.name}`, { m, l }])),
      (k, { m }) => ({ group: m.group || '', name: m.name, qty: 0, amount: 0 }),
      (r, s, { m, l }) => { r.qty += l.qtyMilli; r.amount += lineAmount(l.qtyMilli, m.priceSen || 0); }).sort((a, b) => b.qty - a.qty);
    return {
      view: table([[t('modifier')], [t('option')], [t('qtySold'), true], [t('amount'), true]],
        rows.map((r) => [r.group, r.name, formatQty(r.qty), formatSen(r.amount)])),
      csv: () => [[t('modifier'), t('option'), t('qtySold'), t('amount')], ...rows.map((r) => [r.group, r.name, formatQty(r.qty), formatSen(r.amount)])],
    };
  },

  discounts(list) {
    const rows = group(done(list), (s) => [
      ...(s.discounts || []).map((d) => [d.name, d.amountSen]),
      ...(s.lines || []).filter((l) => l.discountSen).map((l) => [t('lineDiscount'), l.discountSen]),
    ], (name) => ({ name, n: 0, amount: 0 }), (r, s, amount) => { r.n++; r.amount += amount; }).sort((a, b) => b.amount - a.amount);
    return {
      view: table([[t('discount')], [t('timesUsed'), true], [t('amount'), true]], rows.map((r) => [r.name, String(r.n), formatSen(r.amount)])),
      csv: () => [[t('discount'), t('timesUsed'), t('amount')], ...rows.map((r) => [r.name, r.n, formatSen(r.amount)])],
    };
  },

  taxes(list) {
    const x = totals(list);
    const rows = [
      [session.settings.taxName || t('tax'), formatSen(x.net + x.service), formatSen(x.tax)],
      [t('serviceCharge'), formatSen(x.net), formatSen(x.service)],
    ];
    return {
      view: table([[t('tax')], [t('taxableSales'), true], [t('amount'), true]], rows),
      csv: () => [[t('tax'), t('taxableSales'), t('amount')], ...rows],
    };
  },
};

// --------------------------------------------------------- receipt & void

function openReceipt(sale) {
  const canVoid = session.can('POS_VOID') && sale.status !== 'VOIDED';
  modal((close) => [
    h('div', { style: { background: '#fff', padding: '12px', borderRadius: '8px' } }, receiptView(sale)),
    sale.status === 'VOIDED' ? h('p', { class: 'muted' }, `${t('voidedBy')} ${sale.voidedByName || ''} · ${sale.voidReason || ''}`) : null,
    h('div', { class: 'actions' },
      canVoid ? h('button', { class: 'danger', onclick: () => { close(); voidSale(sale); } }, t('voidSale')) : null,
      h('span', { class: 'grow' }),
      h('button', { onclick: () => printView(receiptView(sale)) }, `🖨 ${t('printReceipt')}`),
      h('button', { class: 'primary', onclick: close }, t('close'))),
  ]);
}

async function voidSale(sale) {
  const reason = h('input', { autofocus: true, placeholder: t('voidReasonHint') });
  modal((close) => [
    h('h2', {}, `${t('voidSale')} ${sale.receiptNo}`),
    h('p', { class: 'muted', style: { margin: 0 } }, t('voidExplain')),
    h('label', { class: 'field' }, t('reason'), reason),
    h('div', { class: 'actions' },
      h('button', { onclick: close }, t('cancel')),
      h('button', {
        class: 'danger',
        onclick: async () => {
          if (!reason.value.trim()) return toast(t('errReason'), 'error');
          if (!await confirmBox(t('voidConfirm'), t('voidSale'), t('cancel'))) return;
          const now = Date.now();
          const batch = writeBatch(db);
          batch.update(doc(db, ws(`sales/${sale.id}`)), {
            status: 'VOIDED', voidedAt: now, voidedByUid: session.uid, voidedByName: session.name, voidReason: reason.value.trim(),
          });
          (sale.lines || []).forEach((l, i) => {
            const product = session.find(l.barcode);
            if (!product || product.trackStock === false) return;
            batch.set(doc(db, ws(`movements/void-${sale.id}-${i}`)), {
              barcode: product.barcode, productName: l.name, branchId: sale.branchId || '', type: 'REFUND',
              quantityMilli: l.qtyMilli, at: now, source: 'POS', reference: sale.receiptNo, note: reason.value.trim(),
              createdByUid: session.uid, createdByName: session.name, createdAt: now,
            });
          });
          try {
            await batch.commit();
            toast(t('saleVoided'), 'ok');
            loadedKey = '';
            close();
            location.hash = location.hash; // Redraw the report.
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          } catch (err) {
            toast(err.message || String(err), 'error');
          }
        },
      }, t('voidSale'))),
  ]);
}

// ------------------------------------------------------------------ export

function downloadCsv(name, rows) {
  const text = rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
  // A byte-order mark so Excel opens Chinese names as Chinese.
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}
