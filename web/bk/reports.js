/**
 * The reports, worked out from the journal and the documents each time:
 * profit and loss, balance sheet, trial balance, an account's ledger, who
 * owes us and whom we owe (by how late), a contact's statement, and the
 * SST figures for the return. Each one prints and downloads as CSV.
 *
 *   #/reports/<pl|bs|tb|gl|ar|ap|sst>[/code]   #/reports/statement/<contactId>
 */
import { download, h, mount } from '../js/dom.js';
import { getLang, t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { printView } from '../js/receipt.js';
import { accountName, AGING, aging, balanceSheet, DOC_TYPES, ledger, outstanding, profitAndLoss, sstSummary, trialBalance } from '../js/books.js';
import { account, accounts, books, company, dayEnd, dayMs, monthStart, today, ymd } from './data.js';
import { accountSelect, csv, empty, head, money, rmText, table, taxLabel, typeName } from './common.js';
import { go } from './main.js';

const TABS = ['pl', 'bs', 'tb', 'gl', 'ar', 'ap', 'sst'];
const range = { from: monthStart(), to: today() };

export function render(main, sub) {
  const [tab = 'pl', arg = ''] = sub.split('/');
  const from = dayMs(range.from);
  const to = dayEnd(range.to);
  const nav = h('div', { class: 'seg wh-tabs' }, TABS.map((x) => h('button', { class: x === tab ? 'on' : '', 'data-tab': x, onclick: () => go('reports', x) }, t(`bkR_${x}`))));
  const usesFrom = ['pl', 'gl', 'sst', 'statement'].includes(tab);
  const dates = h('div', { class: 'row bk-range' },
    usesFrom ? h('label', { class: 'field' }, t('bkFromDate'), h('input', { type: 'date', value: range.from, 'data-f': 'from', onchange: (e) => { range.from = e.target.value || range.from; go('reports', sub || tab); } })) : null,
    h('label', { class: 'field' }, t(usesFrom ? 'bkToDate' : 'bkAsAt'), h('input', { type: 'date', value: range.to, 'data-f': 'to', onchange: (e) => { range.to = e.target.value || range.to; go('reports', sub || tab); } })),
    usesFrom ? h('div', { class: 'row' },
      h('button', { class: 'ghost', onclick: () => { range.from = monthStart(); range.to = today(); go('reports', sub || tab); } }, t('bkThisMonth')),
      h('button', { class: 'ghost', onclick: () => { range.from = `${today().slice(0, 4)}-01-01`; range.to = today(); go('reports', sub || tab); } }, t('bkThisYear'))) : null);

  const built = build(tab, arg, { from, to });
  mount(main,
    head(t('bkReports'),
      h('button', { 'data-act': 'print', onclick: () => printView(h('div', { class: 'bk-print' },
        h('div', { class: 'co' }, company().name), h('h2', {}, built.title), h('div', { class: 'muted' }, built.period), built.body.cloneNode(true))) }, icon('printer', 17), t('bkPrint')),
      built.rows ? h('button', { 'data-act': 'csv', onclick: () => download(`${built.file}.csv`, csv(built.rows), 'text/csv') }, icon('download', 17), 'CSV') : null),
    nav, dates,
    h('section', { class: 'card bk-report', 'data-report': tab }, h('h2', {}, built.title), h('p', { class: 'muted' }, built.period), built.body));
  return null;
}

const name = (a) => `${a.code} ${accountName(a, getLang())}`;

function build(tab, arg, { from, to }) {
  const entries = books.journal;
  const all = accounts();
  const period = `${ymd(from)} – ${ymd(to)}`;
  const asAt = `${t('bkAsAt')} ${ymd(to)}`;
  if (tab === 'pl') {
    const r = profitAndLoss(entries, all, { from, to });
    const section = (title, list, total) => [h('tr', { class: 'sec' }, h('td', { colspan: 2 }, title)),
      list.map((x) => h('tr', {}, h('td', {}, h('a', { href: `#/reports/gl/${x.code}` }, name(x.account))), h('td', { class: 'num' }, money(x.amountSen)))),
      h('tr', { class: 'sum' }, h('td', {}, `${t('bkTotal')} ${title}`), h('td', { class: 'num' }, money(total)))];
    return {
      title: t('bkR_pl'), period, file: `profit-loss-${ymd(from)}-${ymd(to)}`,
      body: h('table', { class: 'list bk-fin' }, h('tbody', {},
        section(t('bkIncome'), r.income, r.incomeSen),
        section(t('bkCostOfSales'), r.cogs, r.cogsSen),
        h('tr', { class: 'big' }, h('td', {}, t('bkGrossProfit')), h('td', { class: 'num' }, money(r.grossSen))),
        section(t('bkExpenses'), r.expenses, r.expenseSen),
        h('tr', { class: `big ${r.profitSen < 0 ? 'bk-neg' : ''}` }, h('td', {}, t(r.profitSen < 0 ? 'bkNetLoss' : 'bkNetProfit')), h('td', { class: 'num', 'data-profit': r.profitSen }, money(r.profitSen))))),
      rows: [[t('bkAccount'), t('bkAmount')], ...r.income.map((x) => [name(x.account), money(x.amountSen)]), [t('bkIncome'), money(r.incomeSen)],
        ...r.cogs.map((x) => [name(x.account), money(x.amountSen)]), [t('bkGrossProfit'), money(r.grossSen)],
        ...r.expenses.map((x) => [name(x.account), money(x.amountSen)]), [t('bkNetProfit'), money(r.profitSen)]],
    };
  }
  if (tab === 'bs') {
    const r = balanceSheet(entries, all, { to });
    const section = (title, list, total, extra = []) => [h('tr', { class: 'sec' }, h('td', { colspan: 2 }, title)),
      list.map((x) => h('tr', {}, h('td', {}, h('a', { href: `#/reports/gl/${x.code}` }, name(x.account))), h('td', { class: 'num' }, money(x.amountSen)))),
      extra, h('tr', { class: 'sum' }, h('td', {}, `${t('bkTotal')} ${title}`), h('td', { class: 'num' }, money(total)))];
    return {
      title: t('bkR_bs'), period: asAt, file: `balance-sheet-${ymd(to)}`,
      body: h('div', {},
        h('table', { class: 'list bk-fin' }, h('tbody', {},
          section(t('bkTypeOf_ASSET'), r.assets, r.assetSen),
          section(t('bkTypeOf_LIABILITY'), r.liabilities, r.liabilitySen),
          section(t('bkTypeOf_EQUITY'), r.equity, r.equitySen, [h('tr', {}, h('td', {}, t('bkEarnings')), h('td', { class: 'num' }, money(r.earningsSen)))]),
          h('tr', { class: 'big' }, h('td', {}, t('bkLiabEquity')), h('td', { class: 'num' }, money(r.liabilitySen + r.equitySen))))),
        h('p', { class: r.balanced ? 'bk-ok' : 'bk-neg', 'data-balanced': String(r.balanced) }, t(r.balanced ? 'bkBalanced' : 'bkNotBalanced'))),
      rows: [[t('bkAccount'), t('bkAmount')], ...r.assets.map((x) => [name(x.account), money(x.amountSen)]), [t('bkTypeOf_ASSET'), money(r.assetSen)],
        ...r.liabilities.map((x) => [name(x.account), money(x.amountSen)]), [t('bkTypeOf_LIABILITY'), money(r.liabilitySen)],
        ...r.equity.map((x) => [name(x.account), money(x.amountSen)]), [t('bkEarnings'), money(r.earningsSen)], [t('bkTypeOf_EQUITY'), money(r.equitySen)]],
    };
  }
  if (tab === 'tb') {
    const r = trialBalance(entries, all, { to });
    return {
      title: t('bkR_tb'), period: asAt, file: `trial-balance-${ymd(to)}`,
      body: r.rows.length ? table([t('bkAccount'), t('bkDebit'), t('bkCredit')],
        r.rows.map((x) => [h('a', { href: `#/reports/gl/${x.code}` }, name(x.account)), x.debitSen ? money(x.debitSen) : '', x.creditSen ? money(x.creditSen) : '']),
        { num: [1, 2], foot: [t('bkTotal'), money(r.debitSen), money(r.creditSen)] }) : empty(t('bkNoEntries')),
      rows: [[t('bkCode'), t('bkAccount'), t('bkDebit'), t('bkCredit')], ...r.rows.map((x) => [x.code, accountName(x.account, getLang()), money(x.debitSen), money(x.creditSen)]),
        ['', t('bkTotal'), money(r.debitSen), money(r.creditSen)]],
    };
  }
  if (tab === 'gl') {
    const a = account(arg) || all[0];
    const r = ledger(entries, a, { from, to });
    const pick = accountSelect(a.code, null, { 'data-f': 'account', onchange: (e) => go('reports', `gl/${e.target.value}`) });
    return {
      title: `${t('bkR_gl')} · ${name(a)}`, period, file: `ledger-${a.code}-${ymd(from)}-${ymd(to)}`,
      body: h('div', {}, h('label', { class: 'field' }, t('bkAccount'), pick),
        table([t('date'), t('bkNo'), t('bkMemo'), t('bkDebit'), t('bkCredit'), t('bkBalance')], [
          ['', '', t('bkBroughtForward'), '', '', money(r.opening)],
          ...r.rows.map((x) => [ymd(x.date), x.no, x.memo, x.debitSen ? money(x.debitSen) : '', x.creditSen ? money(x.creditSen) : '', money(x.balanceSen)]),
        ], { num: [3, 4, 5], foot: ['', '', t('bkClosing'), '', '', money(r.closing)] })),
      rows: [[t('date'), t('bkNo'), t('bkMemo'), t('bkDebit'), t('bkCredit'), t('bkBalance')], ['', '', t('bkBroughtForward'), '', '', money(r.opening)],
        ...r.rows.map((x) => [ymd(x.date), x.no, x.memo, money(x.debitSen), money(x.creditSen), money(x.balanceSen)])],
    };
  }
  if (tab === 'ar' || tab === 'ap') {
    const sales = tab === 'ar';
    const rows = aging(books.docs.filter((d) => d.date <= to), books.payments, { now: to, sales });
    const total = Object.fromEntries([...AGING, 'totalSen'].map((k) => [k, rows.reduce((s, r) => s + r[k], 0)]));
    return {
      title: t(`bkR_${tab}`), period: asAt, file: `${sales ? 'receivables' : 'payables'}-${ymd(to)}`,
      body: rows.length ? table([t(sales ? 'bkCustomer' : 'bkSupplier'), ...AGING.map((k) => t(`bkAge_${k}`)), t('bkTotal')],
        rows.map((r) => [h('a', { href: `#/reports/statement/${r.contactId}` }, r.name), ...AGING.map((k) => (r[k] ? money(r[k]) : '')), h('strong', {}, money(r.totalSen))]),
        { num: [1, 2, 3, 4, 5, 6], foot: [t('bkTotal'), ...AGING.map((k) => money(total[k])), money(total.totalSen)] }) : empty(t(sales ? 'bkNobodyOwes' : 'bkWeOweNobody')),
      rows: [[t(sales ? 'bkCustomer' : 'bkSupplier'), ...AGING.map((k) => t(`bkAge_${k}`)), t('bkTotal')], ...rows.map((r) => [r.name, ...AGING.map((k) => money(r[k])), money(r.totalSen)])],
    };
  }
  if (tab === 'sst') {
    const r = sstSummary(books.docs, { from, to });
    return {
      title: t('bkR_sst'), period, file: `sst-${ymd(from)}-${ymd(to)}`,
      body: h('div', {},
        r.rows.length ? table([t('bkTaxCol'), t('bkTaxable'), t('bkTaxTotal')], r.rows.map((x) => [taxLabel([x.taxType, x.taxPct]), money(x.baseSen), money(x.taxSen)]),
          { num: [1, 2], foot: [t('bkTotal'), money(r.baseSen), money(r.taxSen)] }) : empty(t('bkNoSales')),
        h('p', { class: 'muted sm' }, t('bkSstHelp'))),
      rows: [[t('bkTaxCol'), t('bkTaxable'), t('bkTaxTotal')], ...r.rows.map((x) => [taxLabel([x.taxType, x.taxPct]), money(x.baseSen), money(x.taxSen)])],
    };
  }
  if (tab === 'statement') {
    const c = books.contacts.find((x) => x.id === arg);
    if (!c) return { title: t('bkStatement'), period, body: empty(t('bkNotFound')) };
    // Every document and payment with this contact, oldest first, and what is left.
    const items = [
      ...books.docs.filter((d) => d.contactId === c.id && d.status === 'ISSUED').map((d) => ({ date: d.date, no: d.no, what: typeName(d.type),
        amt: (DOC_TYPES[d.type].sales ? 1 : -1) * DOC_TYPES[d.type].sign * (d.totals?.totalSen || 0) })),
      ...books.payments.filter((p) => p.contactId === c.id && p.status === 'POSTED').map((p) => ({ date: p.date, no: p.no, what: t(p.direction === 'IN' ? 'bkReceipt' : 'bkPaymentOut'),
        amt: p.direction === 'IN' ? -p.amountSen : p.amountSen })),
    ].sort((a, b) => a.date - b.date);
    let bal = items.filter((x) => x.date < from).reduce((s, x) => s + x.amt, 0);
    const opening = bal;
    const rows = items.filter((x) => x.date >= from && x.date <= to).map((x) => { bal += x.amt; return [ymd(x.date), x.no, x.what, x.amt > 0 ? money(x.amt) : '', x.amt < 0 ? money(-x.amt) : '', money(bal)]; });
    const open = books.docs.filter((d) => d.contactId === c.id && d.status === 'ISSUED' && DOC_TYPES[d.type].sign > 0 && d.type !== 'DEBIT_NOTE')
      .map((d) => ({ d, owe: outstanding(d, books.payments, books.docs) })).filter((x) => x.owe > 0);
    return {
      title: `${t('bkStatement')} · ${c.name}`, period, file: `statement-${c.name.replace(/\W+/g, '-')}-${ymd(to)}`,
      body: h('div', {},
        table([t('date'), t('bkNo'), t('bkType'), t('bkCharged'), t('bkPaidCol'), t('bkBalance')],
          [['', '', t('bkBroughtForward'), '', '', money(opening)], ...rows], { num: [3, 4, 5], foot: ['', '', t('bkClosing'), '', '', money(bal)] }),
        open.length ? h('p', {}, `${t('bkStillOpen')}: `, open.map((x) => `${x.d.no} ${rmText(x.owe)}`).join(' · ')) : null),
      rows: [[t('date'), t('bkNo'), t('bkType'), t('bkCharged'), t('bkPaidCol'), t('bkBalance')], ['', '', t('bkBroughtForward'), '', '', money(opening)], ...rows],
    };
  }
  return { title: '', period: '', body: empty(t('bkNotFound')) };
}

