// node web/js/books.test.mjs -- the books balance, and the reports add up.
import assert from 'node:assert/strict';
import {
  entryForDay,
  aging, balanceSheet, DEFAULT_ACCOUNTS, docNo, docTotals, entryForDoc, entryForExpense, entryForPayment, entryProblem, ledger, lineTotals,
  locked, outstanding, profitAndLoss, reversal, roleAccount, sstSummary, tidy, trialBalance,
} from './books.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const A = DEFAULT_ACCOUNTS;
const acc = (code) => A.find((a) => a.code === code);
const D = (s) => Date.UTC(...s.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))));

test('the chart has one account per job, all five types', () => {
  for (const role of ['cash', 'bank', 'receivable', 'payable', 'sst', 'sales', 'returns', 'purchases', 'expense', 'retained', 'capital']) assert.ok(roleAccount(A, role), role);
  assert.deepEqual([...new Set(A.map((a) => a.type))].sort(), ['ASSET', 'EQUITY', 'EXPENSE', 'INCOME', 'LIABILITY']);
  assert.equal(new Set(A.map((a) => a.code)).size, A.length);
  assert.equal(acc('1100').names.zh, '应收账款');
});

test('an entry must balance, one side a line, whole sen, known accounts', () => {
  assert.equal(entryProblem([{ account: '1000', debitSen: 100 }, { account: '4000', creditSen: 100 }]), '');
  assert.equal(entryProblem([{ account: '1000', debitSen: 100 }]), 'TOO_FEW_LINES');
  assert.equal(entryProblem([{ account: '1000', debitSen: 100 }, { account: '4000', creditSen: 90 }]), 'UNBALANCED');
  assert.equal(entryProblem([{ account: '1000', debitSen: 100, creditSen: 100 }, { account: '4000', creditSen: 0, debitSen: 0 }]), 'ONE_SIDE');
  assert.equal(entryProblem([{ account: '1000', debitSen: 10.5 }, { account: '4000', creditSen: 10.5 }]), 'BAD_AMOUNT');
  assert.equal(entryProblem([{ account: '9999', debitSen: 1 }, { account: '4000', creditSen: 1 }]), 'NO_ACCOUNT');
  assert.deepEqual(tidy([{ account: '1000', debitSen: 50 }, { account: '1000', debitSen: 50 }, { account: '4000', creditSen: 100 }, { account: '6900', debitSen: 0 }]),
    [{ account: '1000', debitSen: 100, creditSen: 0 }, { account: '4000', debitSen: 0, creditSen: 100 }]);
  assert.deepEqual(reversal({ lines: [{ account: '1000', debitSen: 5, creditSen: 0 }] }), [{ account: '1000', debitSen: 0, creditSen: 5 }]);
});

// 3 x RM 10.00, 10% discount of RM 3, 6% service tax; 2 kg at RM 4.50, no tax.
const LINES = [
  { description: 'Service', qtyMilli: 3000, unitPriceSen: 1000, discountSen: 300, taxPct: 6, taxType: '02' },
  { description: 'Rice', qtyMilli: 2000, unitPriceSen: 450, taxType: 'E' },
];

test('line and document totals are whole sen, tax after discount', () => {
  assert.deepEqual(lineTotals(LINES[0]), { grossSen: 3000, netSen: 2700, taxSen: 162, totalSen: 2862 });
  assert.deepEqual(lineTotals({ qtyMilli: 1500, unitPriceSen: 333 }), { grossSen: 500, netSen: 500, taxSen: 0, totalSen: 500 });
  const t = docTotals(LINES);
  assert.equal(t.netSen, 3600); assert.equal(t.taxSen, 162); assert.equal(t.totalSen, 3762); assert.equal(t.discountSen, 300);
  assert.deepEqual(t.byTax, [{ taxType: '02', taxPct: 6, baseSen: 2700, taxSen: 162 }, { taxType: 'E', taxPct: 0, baseSen: 900, taxSen: 0 }]);
});

const inv = { id: 'i1', type: 'INVOICE', no: 'INV-1', status: 'ISSUED', date: D('2026-09-05'), dueDate: D('2026-10-05'), contactId: 'c1', contact: { name: 'Kedai Ali' }, lines: LINES };

test('an invoice: receivable against sales and SST; a credit note the other way', () => {
  const e = entryForDoc(inv);
  assert.equal(entryProblem(e), '');
  assert.deepEqual(e, [
    { account: '1100', debitSen: 3762, creditSen: 0 },
    { account: '4000', debitSen: 0, creditSen: 3600 },
    { account: '2100', debitSen: 0, creditSen: 162 },
  ]);
  const cn = entryForDoc({ type: 'CREDIT_NOTE', lines: [LINES[0]] });
  assert.equal(entryProblem(cn), '');
  assert.deepEqual(cn.find((l) => l.account === '1100'), { account: '1100', debitSen: 0, creditSen: 2862 });
  assert.deepEqual(cn.find((l) => l.account === '4010'), { account: '4010', debitSen: 2700, creditSen: 0 });
});

test('a bill: cost against payable, SST part of the cost; payments and expenses balance', () => {
  const bill = entryForDoc({ type: 'BILL', lines: [{ qtyMilli: 1000, unitPriceSen: 10000, taxPct: 10, account: '1200' }, { qtyMilli: 1000, unitPriceSen: 5000, account: '6200' }] });
  assert.equal(entryProblem(bill), '');
  assert.deepEqual(bill.find((l) => l.account === '1200'), { account: '1200', debitSen: 11000, creditSen: 0 });
  assert.deepEqual(bill.find((l) => l.account === '2000'), { account: '2000', debitSen: 0, creditSen: 16000 });
  assert.equal(entryProblem(entryForPayment({ direction: 'IN', amountSen: 2000, account: '1010' })), '');
  assert.deepEqual(entryForPayment({ direction: 'OUT', amountSen: 500 })[0], { account: '2000', debitSen: 500, creditSen: 0 });
  const ex = entryForExpense({ account: '1000', lines: [{ unitPriceSen: 4500, account: '6100' }, { unitPriceSen: 1200 }] });
  assert.equal(entryProblem(ex), '');
  assert.deepEqual(ex.find((l) => l.account === '1000'), { account: '1000', debitSen: 0, creditSen: 5700 });
});

test('outstanding and aging: payments and notes reduce what is owed', () => {
  const pay = [{ allocations: [{ docId: 'i1', amountSen: 1000 }] }];
  const cn = { id: 'n1', type: 'CREDIT_NOTE', status: 'ISSUED', refId: 'i1', lines: [{ unitPriceSen: 500 }] };
  assert.equal(outstanding(inv, pay, [cn]), 3762 - 1000 - 500);
  // A draft note is not in the accounts yet.
  assert.equal(outstanding(inv, pay, [{ ...cn, status: 'DRAFT' }]), 3762 - 1000);
  const rows = aging([inv, cn], pay, { now: D('2026-11-20') });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].d31_60, 2262);
  assert.equal(rows[0].totalSen, 2262);
  assert.equal(aging([inv], [{ allocations: [{ docId: 'i1', amountSen: 3762 }] }]).length, 0);
});

// A month of business: capital in, stock bought on credit, a sale, rent, payments.
const J = (date, lines, extra = {}) => ({ date: D(date), lines, ...extra });
const BOOKS = [
  J('2026-09-01', [{ account: '1010', debitSen: 1000000 }, { account: '3000', creditSen: 1000000 }]),
  J('2026-09-02', entryForDoc({ type: 'BILL', lines: [{ unitPriceSen: 200000, account: '5100' }] })),
  J('2026-09-05', entryForDoc(inv)),
  J('2026-09-06', entryForExpense({ account: '1010', lines: [{ unitPriceSen: 150000, account: '6100' }] })),
  J('2026-09-20', entryForPayment({ direction: 'IN', amountSen: 3762, account: '1010' })),
  J('2026-09-25', entryForPayment({ direction: 'OUT', amountSen: 100000, account: '1010' })),
  J('2026-09-26', [{ account: '1000', debitSen: 999 }, { account: '4100', creditSen: 999 }], { void: true }),
];

test('the trial balance balances; profit and loss; the balance sheet balances', () => {
  const tb = trialBalance(BOOKS, A);
  assert.equal(tb.debitSen, tb.creditSen);
  const pl = profitAndLoss(BOOKS, A, { from: D('2026-09-01'), to: D('2026-09-30') });
  assert.equal(pl.incomeSen, 3600);
  assert.equal(pl.cogsSen, 200000);
  assert.equal(pl.expenseSen, 150000);
  assert.equal(pl.profitSen, 3600 - 200000 - 150000);
  const bs = balanceSheet(BOOKS, A, { to: D('2026-09-30') });
  assert.ok(bs.balanced, JSON.stringify(bs));
  assert.equal(bs.assetSen, 1000000 - 150000 + 3762 - 100000);
  assert.equal(bs.liabilitySen, 162 + 200000 - 100000);
  assert.equal(bs.earningsSen, pl.profitSen);
});

test('the ledger runs a balance with what came before brought forward', () => {
  const l = ledger(BOOKS, acc('1010'), { from: D('2026-09-05'), to: D('2026-09-30') });
  assert.equal(l.opening, 1000000);
  assert.deepEqual(l.rows.map((r) => r.balanceSen), [850000, 853762, 753762]);
  assert.equal(l.closing, 753762);
});

test('SST for the period, less credit notes; numbering; the period lock', () => {
  const cn = { type: 'CREDIT_NOTE', status: 'ISSUED', date: D('2026-09-10'), lines: [LINES[0]] };
  const s = sstSummary([inv, cn, { ...inv, status: 'VOID' }], { from: D('2026-09-01'), to: D('2026-10-31') });
  assert.equal(s.taxSen, 0);
  assert.equal(sstSummary([inv], { from: D('2026-09-01'), to: D('2026-10-31') }).taxSen, 162);
  assert.equal(docNo('INV', 2026, 42), 'INV-2026-00042');
  assert.equal(locked(D('2026-09-05'), D('2026-09-30')), true);
  assert.equal(locked(D('2026-10-01'), D('2026-09-30')), false);
  assert.equal(locked(D('2026-10-01'), null), false);
});

test('a day\'s takings as one entry: cash, settlements, sales and SST, balanced', () => {
  const lines = entryForDay({ totalSen: 10600, taxSen: 600, cashSen: 4000 });
  const by = Object.fromEntries(lines.map((l) => [l.account, [l.debitSen, l.creditSen]]));
  assert.deepEqual(by, { 1000: [4000, 0], 1020: [6600, 0], 4000: [0, 10000], 2100: [0, 600] });
  assert.equal(lines.reduce((s, l) => s + l.debitSen - l.creditSen, 0), 0);
  // All cash, no tax: two lines.
  assert.equal(entryForDay({ totalSen: 500, cashSen: 500 }).length, 2);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n', e.message); }
}
process.exit(failed ? 1 : 0);
