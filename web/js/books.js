/**
 * SuXin Books: the sums of a company's accounts -- double entry, in sen,
 * never a floating-point ringgit. Pure: tested in books.test.mjs. The
 * screens are web/books/; the e-invoice files are einvoice-doc.js.
 *
 * - Every entry in the journal balances: debits = credits, each line one
 *   side only, whole sen. An entry is never edited or deleted; a mistake
 *   is put right by a reversing entry.
 * - Invoices, credit and debit notes, supplier bills, payments and
 *   expenses each make their journal entry here (entryFor*), so the books
 *   and the documents can never disagree.
 * - Reports (trial balance, profit and loss, balance sheet, ledger, aging)
 *   are worked out from the journal and the documents, never stored.
 */

export const TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
/** Assets and expenses grow with a debit; the rest with a credit. */
export const debitNormal = (type) => type === 'ASSET' || type === 'EXPENSE';

/**
 * The chart of accounts a Malaysian SME starts with. code -> [type, en, zh, ms, role]
 * role: the job an account does in the postings below (one account per role).
 */
const CHART = [
  ['1000', 'ASSET', 'Cash on hand', '现金', 'Tunai di tangan', 'cash'],
  ['1010', 'ASSET', 'Bank', '银行', 'Bank', 'bank'],
  ['1020', 'ASSET', 'E-wallet & card settlements', '电子钱包和刷卡待入账', 'Penyelesaian e-dompet & kad', 'clearing'],
  ['1100', 'ASSET', 'Trade receivables', '应收账款', 'Penghutang dagangan', 'receivable'],
  ['1200', 'ASSET', 'Inventory', '存货', 'Inventori', 'inventory'],
  ['1300', 'ASSET', 'Deposits & prepayments', '订金和预付款', 'Deposit & prabayar', ''],
  ['1500', 'ASSET', 'Property, plant & equipment', '固定资产', 'Hartanah, loji & peralatan', ''],
  ['1510', 'ASSET', 'Accumulated depreciation', '累计折旧', 'Susut nilai terkumpul', ''],
  ['2000', 'LIABILITY', 'Trade payables', '应付账款', 'Pemiutang dagangan', 'payable'],
  ['2100', 'LIABILITY', 'SST payable', '应缴 SST', 'SST perlu dibayar', 'sst'],
  ['2200', 'LIABILITY', 'Accruals & other payables', '应计及其他应付', 'Akruan & pemiutang lain', ''],
  ['2300', 'LIABILITY', 'Customer deposits', '客户订金', 'Deposit pelanggan', ''],
  ['2500', 'LIABILITY', 'Loans & borrowings', '贷款', 'Pinjaman', ''],
  ['3000', 'EQUITY', 'Capital', '资本', 'Modal', 'capital'],
  ['3100', 'EQUITY', 'Retained earnings', '保留盈余', 'Pendapatan tertahan', 'retained'],
  ['3200', 'EQUITY', 'Drawings / dividends', '提款／股息', 'Pengeluaran / dividen', ''],
  ['4000', 'INCOME', 'Sales', '销售收入', 'Jualan', 'sales'],
  ['4010', 'INCOME', 'Sales returns & discounts', '销售退货及折扣', 'Pulangan & diskaun jualan', 'returns'],
  ['4100', 'INCOME', 'Other income', '其他收入', 'Pendapatan lain', ''],
  ['5000', 'EXPENSE', 'Cost of goods sold', '销售成本', 'Kos barang dijual', 'cogs'],
  ['5100', 'EXPENSE', 'Purchases', '进货', 'Belian', 'purchases'],
  ['5200', 'EXPENSE', 'Stock written off', '存货报损', 'Stok dihapus kira', 'writeoff'],
  ['6000', 'EXPENSE', 'Salaries & wages', '薪水', 'Gaji & upah', ''],
  ['6010', 'EXPENSE', 'EPF, SOCSO & EIS', '公积金、社险、就业保险', 'KWSP, PERKESO & SIP', ''],
  ['6100', 'EXPENSE', 'Rent', '租金', 'Sewa', ''],
  ['6200', 'EXPENSE', 'Utilities', '水电', 'Utiliti', ''],
  ['6300', 'EXPENSE', 'Telephone & internet', '电话和网络', 'Telefon & internet', ''],
  ['6400', 'EXPENSE', 'Transport & delivery', '交通和运送', 'Pengangkutan & penghantaran', ''],
  ['6500', 'EXPENSE', 'Marketing & advertising', '营销和广告', 'Pemasaran & iklan', ''],
  ['6600', 'EXPENSE', 'Bank & payment charges', '银行和付款手续费', 'Caj bank & pembayaran', ''],
  ['6700', 'EXPENSE', 'Repairs & maintenance', '维修保养', 'Pembaikan & penyelenggaraan', ''],
  ['6800', 'EXPENSE', 'Depreciation', '折旧', 'Susut nilai', ''],
  ['6900', 'EXPENSE', 'General expenses', '一般开销', 'Perbelanjaan am', 'expense'],
  ['7000', 'EXPENSE', 'Income tax', '所得税', 'Cukai pendapatan', ''],
];

/** The starting chart, as account documents keyed by code. */
export const DEFAULT_ACCOUNTS = CHART.map(([code, type, en, zh, ms, role]) => ({
  code, type, name: en, names: { en, zh, ms }, role: role || '', system: Boolean(role), active: true,
}));

/** code of the account doing [role], from [accounts] (the defaults when none). */
export function roleAccount(accounts, role) {
  const list = accounts?.length ? accounts : DEFAULT_ACCOUNTS;
  const a = list.find((x) => x.role === role && x.active !== false) || DEFAULT_ACCOUNTS.find((x) => x.role === role);
  return a?.code || '';
}

export const accountName = (a, lang = 'en') => a?.names?.[lang] || a?.name || a?.code || '';

// ----------------------------------------------------------- the journal

/** Why [lines] cannot be an entry, or '' when they can. */
export function entryProblem(lines, accounts = DEFAULT_ACCOUNTS) {
  if (!Array.isArray(lines) || lines.length < 2) return 'TOO_FEW_LINES';
  const codes = new Set(accounts.map((a) => a.code));
  let dr = 0;
  let cr = 0;
  for (const l of lines) {
    const d = l.debitSen || 0;
    const c = l.creditSen || 0;
    if (!Number.isInteger(d) || !Number.isInteger(c) || d < 0 || c < 0) return 'BAD_AMOUNT';
    if ((d > 0) === (c > 0)) return 'ONE_SIDE';
    if (!codes.has(l.account)) return 'NO_ACCOUNT';
    dr += d; cr += c;
  }
  return dr === cr ? '' : 'UNBALANCED';
}

/** Lines with the same account and side merged, zero lines dropped, debits first. */
export function tidy(lines) {
  const by = new Map();
  for (const l of lines) {
    const amt = (l.debitSen || 0) - (l.creditSen || 0);
    if (!amt) continue;
    const k = `${l.account}\u0000${amt > 0 ? 'D' : 'C'}\u0000${l.memo || ''}`;
    by.set(k, (by.get(k) || 0) + amt);
  }
  return [...by].map(([k, amt]) => {
    const [account, , memo] = k.split('\u0000');
    return { account, debitSen: amt > 0 ? amt : 0, creditSen: amt < 0 ? -amt : 0, ...(memo ? { memo } : {}) };
  }).sort((a, b) => (b.debitSen > 0) - (a.debitSen > 0));
}

/** The entry that undoes [entry]: every line on the other side. */
export const reversal = (entry) => entry.lines.map((l) => ({ ...l, debitSen: l.creditSen || 0, creditSen: l.debitSen || 0 }));

// ------------------------------------------------------------- documents

/** Sales documents and their MyInvois type codes. */
export const DOC_TYPES = {
  INVOICE: { code: '01', prefix: 'INV', sales: true, sign: 1 },
  CREDIT_NOTE: { code: '02', prefix: 'CN', sales: true, sign: -1 },
  DEBIT_NOTE: { code: '03', prefix: 'DN', sales: true, sign: 1 },
  REFUND_NOTE: { code: '04', prefix: 'RN', sales: true, sign: -1 },
  BILL: { code: null, prefix: 'BILL', sales: false, sign: 1 },
  SELF_BILLED: { code: '11', prefix: 'SB', sales: false, sign: 1 },
};

/**
 * One line's sums: qty in thousandths, unit price and discount in sen,
 * taxPct a number (6, 8, 10). Tax is on the amount after discount.
 */
export function lineTotals(l) {
  const gross = Math.round(((l.qtyMilli ?? 1000) * (l.unitPriceSen || 0)) / 1000);
  const netSen = Math.max(0, gross - (l.discountSen || 0));
  const taxSen = l.taxPct ? Math.round((netSen * Number(l.taxPct)) / 100) : 0;
  return { grossSen: gross, netSen, taxSen, totalSen: netSen + taxSen };
}

/** A document's totals, and per tax rate for the e-invoice. */
export function docTotals(lines) {
  const out = { netSen: 0, taxSen: 0, totalSen: 0, discountSen: 0, byTax: [] };
  const byTax = new Map();
  for (const l of lines || []) {
    const t = lineTotals(l);
    out.netSen += t.netSen; out.taxSen += t.taxSen; out.totalSen += t.totalSen; out.discountSen += l.discountSen || 0;
    const key = `${l.taxType || (l.taxPct ? '01' : '06')}|${Number(l.taxPct) || 0}`;
    const x = byTax.get(key) || { taxType: key.split('|')[0], taxPct: Number(l.taxPct) || 0, baseSen: 0, taxSen: 0 };
    x.baseSen += t.netSen; x.taxSen += t.taxSen;
    byTax.set(key, x);
  }
  out.byTax = [...byTax.values()];
  return out;
}

/**
 * The journal lines a document makes. Sales: receivable against income
 * (each line's own account, sales by default) and SST payable. A credit or
 * refund note is the same the other way round (to sales returns). A bill
 * (or self-billed invoice): each line's expense or stock account against
 * payable; SST paid to a supplier is part of the cost (not claimable).
 */
export function entryForDoc(d, accounts = DEFAULT_ACCOUNTS) {
  const kind = DOC_TYPES[d.type];
  if (!kind) throw new Error(`Unknown document ${d.type}`);
  const lines = [];
  if (kind.sales) {
    const ar = roleAccount(accounts, 'receivable');
    const sst = roleAccount(accounts, 'sst');
    const back = kind.sign < 0;
    const incomeOf = (l) => (back ? roleAccount(accounts, 'returns') : l.account || roleAccount(accounts, 'sales'));
    let total = 0;
    for (const l of d.lines || []) {
      const t = lineTotals(l);
      total += t.totalSen;
      lines.push(back ? { account: incomeOf(l), debitSen: t.netSen, creditSen: 0 } : { account: incomeOf(l), debitSen: 0, creditSen: t.netSen });
      if (t.taxSen) lines.push(back ? { account: sst, debitSen: t.taxSen, creditSen: 0 } : { account: sst, debitSen: 0, creditSen: t.taxSen });
    }
    lines.push(back ? { account: ar, debitSen: 0, creditSen: total } : { account: ar, debitSen: total, creditSen: 0 });
  } else {
    const ap = roleAccount(accounts, 'payable');
    let total = 0;
    for (const l of d.lines || []) {
      const t = lineTotals(l);
      total += t.totalSen;
      lines.push({ account: l.account || roleAccount(accounts, 'purchases'), debitSen: t.totalSen, creditSen: 0 });
    }
    lines.push({ account: ap, debitSen: 0, creditSen: total });
  }
  return tidy(lines);
}

/**
 * One day's takings as one entry (Books, 每日销售入账): the cash into the
 * till's cash, the rest (cards, QR, e-wallets, whatever another system
 * did not say) into settlements, against sales and the SST in them.
 * [day]: { cashSen, otherSen, totalSen, taxSen } (api/server.mjs sales-days).
 */
export function entryForDay(day, accounts = DEFAULT_ACCOUNTS) {
  const tax = Math.max(0, Math.min(day.taxSen || 0, day.totalSen || 0));
  return tidy([
    { account: roleAccount(accounts, 'cash'), debitSen: day.cashSen || 0, creditSen: 0 },
    { account: roleAccount(accounts, 'clearing'), debitSen: (day.totalSen || 0) - (day.cashSen || 0), creditSen: 0 },
    { account: roleAccount(accounts, 'sales'), debitSen: 0, creditSen: (day.totalSen || 0) - tax },
    { account: roleAccount(accounts, 'sst'), debitSen: 0, creditSen: tax },
  ]);
}

/** Money in from a customer (IN) or out to a supplier (OUT), through [via] (cash, bank...). */
export function entryForPayment(p, accounts = DEFAULT_ACCOUNTS) {
  const party = p.direction === 'IN' ? roleAccount(accounts, 'receivable') : roleAccount(accounts, 'payable');
  const via = p.account || roleAccount(accounts, 'bank');
  const amt = p.amountSen;
  return p.direction === 'IN'
    ? [{ account: via, debitSen: amt, creditSen: 0 }, { account: party, debitSen: 0, creditSen: amt }]
    : [{ account: party, debitSen: amt, creditSen: 0 }, { account: via, debitSen: 0, creditSen: amt }];
}

/** An expense paid straight away: each line's account against cash or bank. */
export function entryForExpense(e, accounts = DEFAULT_ACCOUNTS) {
  const via = e.account || roleAccount(accounts, 'cash');
  let total = 0;
  const lines = (e.lines || []).map((l) => {
    const t = lineTotals(l);
    total += t.totalSen;
    return { account: l.account || roleAccount(accounts, 'expense'), debitSen: t.totalSen, creditSen: 0 };
  });
  return tidy([...lines, { account: via, debitSen: 0, creditSen: total }]);
}

/** What is still owed on [doc] after [payments] (allocations) and [notes] against it. */
export function outstanding(doc, payments = [], notes = []) {
  const total = doc.totals?.totalSen ?? docTotals(doc.lines).totalSen;
  const paid = payments.flatMap((p) => p.allocations || []).filter((a) => a.docId === doc.id).reduce((s, a) => s + a.amountSen, 0);
  // Only issued notes count: a draft is not in the accounts yet.
  const credited = notes.filter((n) => n.refId === doc.id && n.status === 'ISSUED' && DOC_TYPES[n.type]?.sign < 0)
    .reduce((s, n) => s + (n.totals?.totalSen ?? docTotals(n.lines).totalSen), 0);
  const debited = notes.filter((n) => n.refId === doc.id && n.status === 'ISSUED' && n.type === 'DEBIT_NOTE')
    .reduce((s, n) => s + (n.totals?.totalSen ?? docTotals(n.lines).totalSen), 0);
  return Math.max(0, total + debited - credited - paid);
}

const DAY = 86_400_000;
export const AGING = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90'];

/** Who owes (or is owed) what, by how late: per contact, per bucket. */
export function aging(docs, payments, { now = Date.now(), sales = true } = {}) {
  const live = docs.filter((d) => d.status === 'ISSUED' && Boolean(DOC_TYPES[d.type]?.sales) === sales);
  const mains = live.filter((d) => DOC_TYPES[d.type].sign > 0 && d.type !== 'DEBIT_NOTE');
  const rows = new Map();
  for (const d of mains) {
    const owe = outstanding(d, payments, live);
    if (!owe) continue;
    const late = Math.floor((now - (d.dueDate || d.date)) / DAY);
    const bucket = late <= 0 ? 'current' : late <= 30 ? 'd1_30' : late <= 60 ? 'd31_60' : late <= 90 ? 'd61_90' : 'd90';
    const r = rows.get(d.contactId) || { contactId: d.contactId, name: d.contact?.name || '', current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0, totalSen: 0, docs: [] };
    r[bucket] += owe; r.totalSen += owe; r.docs.push({ id: d.id, no: d.no, owe, late });
    rows.set(d.contactId, r);
  }
  return [...rows.values()].sort((a, b) => b.totalSen - a.totalSen);
}

// --------------------------------------------------------------- reports

/** account code -> { debitSen, creditSen } over entries dated in [from, to]. */
export function sums(entries, { from = -Infinity, to = Infinity } = {}) {
  const out = new Map();
  for (const e of entries) {
    if (e.void || e.date < from || e.date > to) continue;
    for (const l of e.lines) {
      const s = out.get(l.account) || { debitSen: 0, creditSen: 0 };
      s.debitSen += l.debitSen || 0; s.creditSen += l.creditSen || 0;
      out.set(l.account, s);
    }
  }
  return out;
}

/** An account's balance on its normal side (positive is normal). */
export const balanceOf = (account, s) => (s ? (debitNormal(account.type) ? s.debitSen - s.creditSen : s.creditSen - s.debitSen) : 0);

/** Every account with movement up to [to]: debit and credit columns that add up. */
export function trialBalance(entries, accounts, { to = Infinity } = {}) {
  const s = sums(entries, { to });
  const rows = accounts.filter((a) => s.has(a.code)).map((a) => {
    const net = (s.get(a.code).debitSen) - (s.get(a.code).creditSen);
    return { code: a.code, account: a, debitSen: net > 0 ? net : 0, creditSen: net < 0 ? -net : 0 };
  }).filter((r) => r.debitSen || r.creditSen).sort((a, b) => a.code.localeCompare(b.code));
  return { rows, debitSen: rows.reduce((t, r) => t + r.debitSen, 0), creditSen: rows.reduce((t, r) => t + r.creditSen, 0) };
}

/** Income and expenses in [from, to], and what is left. */
export function profitAndLoss(entries, accounts, { from, to }) {
  const s = sums(entries, { from, to });
  const pick = (type) => accounts.filter((a) => a.type === type && s.has(a.code))
    .map((a) => ({ code: a.code, account: a, amountSen: balanceOf(a, s.get(a.code)) })).filter((r) => r.amountSen);
  const income = pick('INCOME');
  const expenses = pick('EXPENSE');
  const cogs = expenses.filter((r) => r.account.role === 'cogs' || r.account.role === 'purchases' || r.account.role === 'writeoff');
  const others = expenses.filter((r) => !cogs.includes(r));
  const incomeSen = income.reduce((t, r) => t + r.amountSen, 0);
  const cogsSen = cogs.reduce((t, r) => t + r.amountSen, 0);
  const otherSen = others.reduce((t, r) => t + r.amountSen, 0);
  return { income, cogs, expenses: others, incomeSen, cogsSen, grossSen: incomeSen - cogsSen, expenseSen: otherSen, profitSen: incomeSen - cogsSen - otherSen };
}

/**
 * What the company holds, owes and is worth at [to]. Profit not yet moved
 * to retained earnings is shown as this period's profit, so it balances.
 */
export function balanceSheet(entries, accounts, { to }) {
  const s = sums(entries, { to });
  const pick = (type) => accounts.filter((a) => a.type === type && s.has(a.code))
    .map((a) => ({ code: a.code, account: a, amountSen: balanceOf(a, s.get(a.code)) })).filter((r) => r.amountSen);
  const assets = pick('ASSET');
  const liabilities = pick('LIABILITY');
  const equity = pick('EQUITY');
  const pl = profitAndLoss(entries, accounts, { from: -Infinity, to });
  const assetSen = assets.reduce((t, r) => t + r.amountSen, 0);
  const liabilitySen = liabilities.reduce((t, r) => t + r.amountSen, 0);
  const equitySen = equity.reduce((t, r) => t + r.amountSen, 0) + pl.profitSen;
  return { assets, liabilities, equity, earningsSen: pl.profitSen, assetSen, liabilitySen, equitySen, balanced: assetSen === liabilitySen + equitySen };
}

/** One account's lines in [from, to], each with the running balance, and the balance brought forward. */
export function ledger(entries, account, { from = -Infinity, to = Infinity } = {}) {
  const before = sums(entries, { to: from - 1 }).get(account.code);
  let running = balanceOf(account, before);
  const opening = running;
  const rows = [];
  for (const e of [...entries].filter((x) => !x.void && x.date >= from && x.date <= to).sort((a, b) => a.date - b.date || (a.createdAt || 0) - (b.createdAt || 0))) {
    for (const l of e.lines.filter((x) => x.account === account.code)) {
      running += debitNormal(account.type) ? (l.debitSen || 0) - (l.creditSen || 0) : (l.creditSen || 0) - (l.debitSen || 0);
      rows.push({ date: e.date, no: e.no, memo: l.memo || e.memo || '', source: e.source, debitSen: l.debitSen || 0, creditSen: l.creditSen || 0, balanceSen: running });
    }
  }
  return { opening, rows, closing: running };
}

/**
 * SST for a taxable period from the sales documents: taxable sales and tax
 * per rate and type, less credit and refund notes -- the figures that go
 * on the SST-02 return.
 */
export function sstSummary(docs, { from, to }) {
  const out = new Map();
  for (const d of docs) {
    const kind = DOC_TYPES[d.type];
    if (!kind?.sales || d.status !== 'ISSUED' || d.date < from || d.date > to) continue;
    for (const x of docTotals(d.lines).byTax) {
      const k = `${x.taxType}|${x.taxPct}`;
      const r = out.get(k) || { taxType: x.taxType, taxPct: x.taxPct, baseSen: 0, taxSen: 0 };
      r.baseSen += kind.sign * x.baseSen; r.taxSen += kind.sign * x.taxSen;
      out.set(k, r);
    }
  }
  const rows = [...out.values()].sort((a, b) => a.taxType.localeCompare(b.taxType) || a.taxPct - b.taxPct);
  return { rows, taxSen: rows.reduce((t, r) => t + r.taxSen, 0), baseSen: rows.reduce((t, r) => t + r.baseSen, 0) };
}

/** "INV-2026-00042": prefix, year, a running number. */
export const docNo = (prefix, year, n) => `${prefix}-${year}-${String(n).padStart(5, '0')}`;

/** Is [date] inside a closed period? (lockDate: the last closed day's end, ms) */
export const locked = (date, lockDate) => Boolean(lockDate) && date <= lockDate;
