// SuXin Books end to end: the chart set up on first open; the company and
// a customer filled in; an invoice issued (its number, its journal entry,
// its MyInvois file); the customer pays it; an expense; opening capital by
// hand; the reports add up; and a second invoice voided.
import { readFileSync } from 'node:fs';
import { start } from './harness.mjs';

const W = 'workspaces/w1/';
const s = await start();
const { page, base, step, shot, store, docs } = s;
const YEAR = new Date(Date.now() + 8 * 3600_000).getUTCFullYear();
const yes = () => page.click('.dialog .actions button:last-child');
const journal = () => docs(`${W}bkJournal/`);
// After posting, the app moves to what was posted; wait for it to land.
const landed = (group) => page.waitForFunction((g) => new RegExp(`^#/${g}/[A-Za-z0-9]+$`).test(location.hash) && !/\/(new|in|out|expense)$/.test(location.hash), group);
const balanced = (e) => e.lines.reduce((x, l) => x + l.debitSen - l.creditSen, 0) === 0;

await step('first open: the starting chart of accounts is saved', async () => {
  await page.goto(`${base}/books/#/home`);
  await page.waitForSelector('.bk-todo');
  await page.waitForFunction((k) => window.__store.get(k)?.list?.length > 20, `${W}bkMeta/chart`);
  await shot('books-1-home');
});

await step('settings: the company on the e-invoice', async () => {
  await page.goto(`${base}/books/#/settings`);
  await page.waitForSelector('input[data-s="tin"]');
  if (await page.inputValue('input[data-s="name"]') !== 'Kedai Jeffrey') throw new Error('not taken from the till');
  await page.fill('input[data-s="tin"]', 'c20880050010');
  await page.fill('input[data-s="brn"]', '202001234567');
  await page.fill('input[data-s="msic"]', '47111');
  await page.fill('input[data-s="msicName"]', 'Retail sale in non-specialised stores');
  await page.fill('input[data-s="city"]', 'Ipoh');
  await page.fill('input[data-s="postcode"]', '30000');
  await page.selectOption('select[data-s="state"]', '08');
  await page.click('button[data-act="save-settings"]');
  await page.waitForFunction((k) => window.__store.get(k)?.tin === 'C20880050010', `${W}bkMeta/settings`);
});

await step('contacts: a customer with what an e-invoice needs; the till\'s supplier brought in', async () => {
  await page.goto(`${base}/books/#/contacts`);
  await page.click('button[data-act="import-suppliers"]');
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/bkContacts/') && v.name === 'Nestle Sdn Bhd' && v.kind === 'SUPPLIER'));
  await page.click('button[data-act="new-contact"]');
  await page.fill('input[data-c="name"]', 'Syarikat ABC Sdn Bhd');
  await page.fill('input[data-c="tin"]', 'C10000000000');
  await page.fill('input[data-c="idNo"]', '201901000001');
  await page.fill('input[data-c="phone"]', '05-2551234');
  await page.fill('input[data-c="address"]', '12 Jalan Sultan Idris');
  await page.fill('input[data-c="termsDays"]', '14');
  await page.click('button[data-act="save-contact"]');
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/bkContacts/') && v.name === 'Syarikat ABC Sdn Bhd' && v.termsDays === 14));
});

let invId;
await step('invoice: two lines, one with 10% sales tax, issued with its number and its entry', async () => {
  await page.goto(`${base}/books/#/sales/new/INVOICE`);
  await page.waitForSelector('select[data-f="contact"]');
  const abc = (await docs(`${W}bkContacts/`)).find((c) => c.name === 'Syarikat ABC Sdn Bhd');
  await page.selectOption('select[data-f="contact"]', abc.__id);
  await page.fill('.bk-line[data-line="0"] input[data-l="desc"]', 'Milo 1kg');
  await page.fill('.bk-line[data-line="0"] input[data-l="qty"]', '10');
  await page.fill('.bk-line[data-line="0"] input[data-l="price"]', '15.90');
  await page.selectOption('.bk-line[data-line="0"] select[data-l="tax"]', '01|10');
  await page.click('button[data-act="add-line"]');
  await page.fill('.bk-line[data-line="1"] input[data-l="desc"]', 'Delivery');
  await page.fill('.bk-line[data-line="1"] input[data-l="price"]', '20');
  await page.waitForSelector('[data-total]:has-text("194.90")');
  await shot('books-2-invoice');
  await page.click('button[data-act="issue"]');
  await yes();
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/bkDocs/') && v.status === 'ISSUED'));
  await landed('sales');
  const inv = (await docs(`${W}bkDocs/`)).find((d) => d.status === 'ISSUED');
  invId = inv.__id;
  if (inv.no !== `INV-${YEAR}-00001` || inv.totals.totalSen !== 19490 || inv.totals.taxSen !== 1590) throw new Error(JSON.stringify(inv));
  if (Math.round((inv.dueDate - inv.date) / 86_400_000) !== 14) throw new Error('due date not from the 14-day terms');
  const e = (await journal()).find((x) => x.sourceId === invId);
  const line = (acc) => e.lines.find((l) => l.account === acc);
  if (!balanced(e) || line('1100').debitSen !== 19490 || line('4000').creditSen !== 17900 || line('2100').creditSen !== 1590) throw new Error(JSON.stringify(e.lines));
  await page.waitForSelector('[data-owed]:has-text("194.90")');
});

await step('e-invoice: the MyInvois JSON file, type 01, both TINs', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="einvoice"]')]);
  const json = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  const inv = json.Invoice[0];
  const tins = (p) => p[0].Party[0].PartyIdentification.find((x) => x.ID[0].schemeID === 'TIN').ID[0]._;
  if (inv.InvoiceTypeCode[0]._ !== '01' || tins(inv.AccountingSupplierParty) !== 'C20880050010' || tins(inv.AccountingCustomerParty) !== 'C10000000000') throw new Error(JSON.stringify(inv).slice(0, 300));
  if (inv.LegalMonetaryTotal[0].PayableAmount[0]._ !== 194.9) throw new Error('total');
});

await step('payment: the customer pays; the invoice is settled', async () => {
  await page.click('button[data-act="pay"]');
  await page.waitForSelector(`input[data-alloc="${invId}"]`);
  if (await page.inputValue('input[data-f="amount"]') !== '194.90') throw new Error('amount not prefilled');
  await page.click('button[data-act="post-payment"]');
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/bkPayments/') && v.no?.startsWith('RCT-')));
  await landed('payments');
  const p = (await docs(`${W}bkPayments/`))[0];
  if (p.amountSen !== 19490 || p.allocations[0].docId !== invId || p.account !== '1010') throw new Error(JSON.stringify(p));
  await page.goto(`${base}/books/#/sales/${invId}`);
  await page.waitForSelector('.bk-view');
  if (await page.$('[data-owed]')) throw new Error('still shows money owed');
});

await step('expense: electricity paid from cash', async () => {
  await page.goto(`${base}/books/#/payments/expense`);
  await page.fill('input[data-f="payee"]', 'TNB');
  await page.fill('input[data-l="desc"]', 'Electricity September');
  await page.selectOption('select[data-l="account"]', '6200');
  await page.fill('input[data-l="price"]', '100');
  await page.click('button[data-act="post-expense"]');
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/bkPayments/') && v.kind === 'EXPENSE'));
  await landed('payments');
  const e = (await journal()).find((x) => x.source === 'EXPENSE');
  if (!balanced(e) || e.lines.find((l) => l.account === '6200').debitSen !== 10000 || e.lines.find((l) => l.account === '1000').creditSen !== 10000) throw new Error(JSON.stringify(e.lines));
});

await step('journal: opening capital into the bank, by hand', async () => {
  await page.goto(`${base}/books/#/journal/new`);
  await page.check('input[data-f="opening"]');
  await page.fill('input[data-f="memo"]', 'Opening balances');
  await page.selectOption('select[data-j="account-0"]', '1010');
  await page.fill('input[data-j="debit-0"]', '5000');
  await page.selectOption('select[data-j="account-1"]', '3000');
  await page.fill('input[data-j="credit-1"]', '5000');
  await page.waitForSelector('.bk-diff.ok');
  await page.click('button[data-act="post-entry"]');
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/bkJournal/') && v.source === 'OPENING'));
  await landed('journal');
});

await step('journal: an entry that does not balance is refused', async () => {
  await page.goto(`${base}/books/#/journal/new`);
  await page.selectOption('select[data-j="account-0"]', '6100');
  await page.fill('input[data-j="debit-0"]', '10');
  await page.selectOption('select[data-j="account-1"]', '1000');
  await page.fill('input[data-j="credit-1"]', '9');
  const before = (await journal()).length;
  await page.click('button[data-act="post-entry"]');
  await page.waitForSelector('#toast.error');
  if ((await journal()).length !== before) throw new Error('posted anyway');
});

await step('reports: profit is sales less the expense; the balance sheet balances', async () => {
  await page.goto(`${base}/books/#/reports/pl`);
  await page.waitForSelector('[data-profit]');
  const profit = await page.getAttribute('[data-profit]', 'data-profit');
  if (profit !== String(17900 - 10000)) throw new Error(`profit ${profit}`);
  await shot('books-3-profit');
  await page.click('button[data-tab="bs"]');
  await page.waitForSelector('[data-balanced="true"]');
  await page.click('button[data-tab="tb"]');
  await page.waitForSelector('[data-report="tb"] tfoot');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="csv"]')]);
  if (!readFileSync(await dl.path(), 'utf8').includes('1010')) throw new Error('csv');
});

await step('void: a second invoice issued, then voided with a reversing entry', async () => {
  await page.goto(`${base}/books/#/sales/new/INVOICE`);
  await page.waitForSelector('select[data-f="contact"]');
  const abc = (await docs(`${W}bkContacts/`)).find((c) => c.name === 'Syarikat ABC Sdn Bhd');
  await page.selectOption('select[data-f="contact"]', abc.__id);
  await page.fill('.bk-line[data-line="0"] input[data-l="desc"]', 'Wrong');
  await page.fill('.bk-line[data-line="0"] input[data-l="price"]', '50');
  await page.click('button[data-act="issue"]');
  await yes();
  await page.waitForFunction((y) => [...window.__store].some(([k, v]) => k.includes('/bkDocs/') && v.no === `INV-${y}-00002`), YEAR);
  await page.waitForSelector('button[data-act="void"]');
  await page.click('button[data-act="void"]');
  await yes();
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/bkDocs/') && v.status === 'VOID'));
  const d = (await docs(`${W}bkDocs/`)).find((x) => x.status === 'VOID');
  const rev = (await journal()).find((x) => x.source === 'VOID' && x.sourceId === d.__id);
  if (!rev || rev.lines.find((l) => l.account === '1100').creditSen !== 5000) throw new Error(JSON.stringify(rev));
});

await step('numbers: two invoices taken, none skipped', async () => {
  const counters = await store(`${W}bkMeta/counters`);
  if (counters?.[`INV-${YEAR}`] !== 2 || counters?.[`RCT-${YEAR}`] !== 1) throw new Error(JSON.stringify(counters));
});

// Last: a new page starts the pretend database again.
await step('home: the books as towers in 3D; a tap opens the page behind one', async () => {
  // In the same page, so what the steps above posted is still there.
  await page.evaluate(() => { location.hash = '#/home'; });
  await page.waitForSelector('[data-card="books3d"] .iso-box[data-id="m-cash"]');
  await page.evaluate(() => document.querySelector('[data-card="books3d"]').scrollIntoView());
  await shot('books-3d');
  await page.evaluate(() => document.querySelector('.iso-box[data-id="m-sales"] polygon:last-of-type').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.click('[data-card="books3d"] a[data-go="sales"]');
  await page.waitForFunction(() => location.hash === '#/reports/pl');
});

await step('the app centre lists SuXin Books', async () => {
  await page.goto(`${base}/app/`);
  await page.waitForSelector('[data-app="books"], a[href="/books/"]');
});

process.exit((await s.done()) ? 1 : 0);
