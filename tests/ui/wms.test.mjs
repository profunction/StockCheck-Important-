// JSOX WMS's second round, end to end: cartons and shelves on a product;
// a delivery taken by the carton with an expiry date, then warned about;
// a transfer approved before it leaves (and a worker who can only send it
// for approval); goods back to the supplier and the credit note; stock
// promised to a customer, then handed over; and the month closed.
import { start } from './harness.mjs';
import { item, world } from '../../tools/videos/world.mjs';

const W = 'workspaces/w1/';
const malt = item('malt');
const s = await start({ seedPatch: world() });
const { page, base, step, shot, store, docs } = s;
const scan = async (code) => { await page.keyboard.type(code); await page.keyboard.press('Enter'); };
const moves = () => docs(`${W}movements/`);
const dayFromNow = (n) => new Date(Date.now() + n * 86_400_000 + 8 * 3600_000).toISOString().slice(0, 10);
const yes = () => page.click('.dialog .actions button:last-child');
let failed = 0;

await step('product: 24 to a carton, and its shelf at the warehouse', async () => {
  await page.goto(`${base}/warehouse/#/stock/${malt.barcode}`);
  await page.waitForSelector('input[data-f="packSize"]');
  await page.fill('input[data-f="packSize"]', '24');
  await page.fill('input[data-shelf="gudang"]', 'A-03-2');
  await page.click('section.card .actions button.primary');
  await page.waitForFunction((k) => window.__store.get(k)?.packSize === 24, `${W}products/${malt.barcode}`);
  const p = await store(`${W}products/${malt.barcode}`);
  if (p.packName !== 'ctn' || p.shelves?.gudang !== 'A-03-2') throw new Error(JSON.stringify(p));
});

await step('receive: one scan and one carton is 25, with its expiry date', async () => {
  await page.goto(`${base}/warehouse/#/receive/free`);
  await page.waitForSelector('.wh-scan input.scan');
  await page.click('.wh-scan input.scan');
  await scan(malt.barcode);
  await page.click(`.wh-line[data-line="${malt.barcode}"] button[data-act="add-pack"]`);
  await page.waitForSelector(`.wh-line[data-line="${malt.barcode}"] .q:has-text("25")`);
  await page.click(`.wh-line[data-line="${malt.barcode}"] .n strong`);
  await page.waitForSelector('input[data-q="packs"]');
  if (await page.inputValue('input[data-q="packs"]') !== '1' || await page.inputValue('input[data-q="pieces"]') !== '1') throw new Error('not 1 ctn + 1');
  await page.fill('input[data-act="expiry"]', dayFromNow(10));
  await page.click('.dialog .actions button.primary');
  await page.waitForSelector(`.wh-line[data-line="${malt.barcode}"] .pill:has-text("${dayFromNow(10)}")`);
  await shot('wms-1-receive-carton');
  await page.click('.wh-bar button.primary');
  await yes();
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/movements/') && v.type === 'RECEIVE' && v.expiry));
  const m = (await moves()).find((x) => x.type === 'RECEIVE' && x.expiry);
  if (m.quantityMilli !== 25000 || m.expiry !== dayFromNow(10)) throw new Error(JSON.stringify(m));
});

await step('expiry: the home screen and the stock list warn about it', async () => {
  await page.goto(`${base}/warehouse/#/home`);
  await page.waitForSelector(`[data-card="expiring"] tr:has-text("${malt.name}")`);
  await page.goto(`${base}/warehouse/#/stock`);
  await page.click('.seg button:has-text("快到期")');
  await page.waitForSelector(`table.wh-stock tr:has-text("${malt.name}") .pill:has-text("还有 10 天")`);
  await shot('wms-2-expiring');
});

await step('transfer: the owner switches approval on; a sent-for-approval transfer is approved, then dispatched', async () => {
  await page.goto(`${base}/warehouse/#/places`);
  await page.check('input[data-act="tr-approval"]');
  await page.waitForFunction((k) => window.__store.get(k)?.transferApproval === true, `${W}pos/settings`);
  await page.evaluate((k) => window.__put(k, {
    transferNo: 'TR-PEND-1', fromBranch: 'gudang', toBranch: 'ipoh', status: 'PENDING', note: '',
    lines: [{ barcode: '9555012345678', name: 'Milo 1kg', qtyMilli: 3000 }], createdByName: 'Siti', submittedByName: 'Siti', createdAt: Date.now(),
  }), `${W}transfers/tp1`);
  await page.goto(`${base}/warehouse/#/transfers/tp1`);
  await page.click('button[data-act="tr-approve"]');
  await page.waitForFunction((k) => window.__store.get(k)?.status === 'APPROVED', `${W}transfers/tp1`);
  const tr = await store(`${W}transfers/tp1`);
  if (tr.approvedByName !== 'Ah Hock') throw new Error(JSON.stringify(tr));
  await page.goto(`${base}/warehouse/#/transfers/tp1`);
  await page.click('button[data-act="tr-dispatch"]');
  await yes();
  await page.waitForFunction((k) => window.__store.get(k)?.status === 'SENT', `${W}transfers/tp1`);
  const out = (await moves()).find((x) => x.type === 'TRANSFER_OUT' && x.reference === 'TR-PEND-1');
  if (!out || out.quantityMilli !== 3000 || out.branchId !== 'gudang') throw new Error(JSON.stringify(out));
});

await step('supplier return: stock leaves now, the credit note later', async () => {
  await page.goto(`${base}/warehouse/#/returns/new`);
  await page.selectOption('select[data-act="ret-supplier"]', 's1');
  await page.click('.wh-scan input.scan');
  await scan(malt.barcode);
  await scan(malt.barcode);
  await page.waitForSelector(`.wh-line[data-line="${malt.barcode}"]:has-text("2")`);
  await shot('wms-3-return');
  await page.click('button[data-act="ret-save"]');
  await yes();
  await page.waitForFunction(() => [...window.__store].some(([k]) => k.includes('/supplierReturns/')));
  const r = (await docs(`${W}supplierReturns/`))[0];
  const m = (await moves()).find((x) => x.reason === 'SUPPLIER_RETURN');
  if (r.status !== 'OPEN' || r.supplierName !== 'Syarikat Borong Maju' || r.valueSen !== 2 * malt.costSen || m.type !== 'WRITE_OFF' || m.quantityMilli !== 2000) throw new Error(JSON.stringify({ r, m }));
  await page.waitForSelector(`[data-ret="${r.__id}"]`);
  await page.click(`[data-ret="${r.__id}"]`);
  await page.fill('input[data-act="credit-no"]', 'CN-0042');
  await page.click('button[data-act="credit-save"]');
  await page.waitForFunction((k) => window.__store.get(k)?.status === 'CREDITED', `${W}supplierReturns/${r.__id}`);
});

await step('reservation: promised stock is not available, then handed over', async () => {
  await page.goto(`${base}/warehouse/#/reserve/new`);
  await page.fill('input[data-act="res-for"]', 'Restoran Ali');
  await page.click('.wh-scan input.scan');
  await scan(malt.barcode);
  await scan(malt.barcode);
  await page.waitForSelector(`.wh-line[data-line="${malt.barcode}"] input.q`);
  await page.click('button[data-act="res-save"]');
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/reservations/') && v.status === 'OPEN'));
  await page.goto(`${base}/warehouse/#/stock/${malt.barcode}`);
  await page.waitForSelector('.wh-head table.list tbody tr');
  // Place, on hand, in transit, on order, reserved, available: the place it was promised at.
  const rows = await page.$$eval('.wh-head table.list tbody tr', (els) => els.map((el) => [...el.cells].map((c) => c.innerText.trim())));
  const row = rows.find((r) => r[4] === '2');
  if (!row || Number(row[5]) !== Number(row[1].split(' ')[0]) - 2) throw new Error(JSON.stringify(rows));
  await page.goto(`${base}/warehouse/#/reserve`);
  await page.click('button[data-act="res-deliver"]');
  await yes();
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/reservations/') && v.status === 'DELIVERED'));
  const sale = (await moves()).find((x) => x.reason === 'RESERVATION');
  if (sale.type !== 'SALE' || sale.quantityMilli !== 2000 || sale.note !== 'Restoran Ali') throw new Error(JSON.stringify(sale));
});

await step('month end: last month closed for every place, once', async () => {
  await page.goto(`${base}/warehouse/#/monthend`);
  await page.click('button[data-act="close-month"]');
  await yes();
  await page.waitForFunction(() => [...window.__store].filter(([k]) => k.includes('/stockClosings/')).length === 3);
  const c = await docs(`${W}stockClosings/`);
  const month = c[0].month;
  if (!c.every((x) => x.month === month && Array.isArray(x.lines) && x.asOf < Date.now())) throw new Error(JSON.stringify(c));
  await page.waitForSelector(`[data-month="${month}"]`);
  if (await page.$('button[data-act="close-month"]')) throw new Error('offered twice');
  await shot('wms-4-month-end');
});

failed += await s.done();

// A worker who may move stock but not approve: with approval on, the
// transfer can only be sent for approval (the rules refuse the rest too).
{
  const worker = await start({
    seedPatch: {
      ...world(),
      // merge comes before set, so these are set whole.
      set: {
        ...world().set,
        [`${W}users/u1`]: { ...world().set[`${W}users/u1`], roleId: 'keeper' },
        [`${W}pos/settings`]: { ...world().set[`${W}pos/settings`], transferApproval: true },
        [`${W}roles/keeper`]: { name: 'Keeper', permissions: ['RECORD_STOCK_MOVEMENTS', 'VIEW_ALL_HISTORY'] },
      },
    },
  });
  const p = worker.page;
  await worker.step('a worker sends a transfer for approval, and cannot dispatch it', async () => {
    await p.goto(`${worker.base}/warehouse/#/transfers/new`);
    await p.waitForSelector('.wh-head select');
    await p.selectOption('.wh-head select >> nth=1', 'gudang');
    await p.click('.wh-scan input.scan');
    await p.keyboard.type(malt.barcode); await p.keyboard.press('Enter');
    await p.waitForSelector('button[data-act="tr-submit"]');
    if (await p.$('button[data-act="tr-dispatch"]')) throw new Error('dispatch offered');
    await p.click('button[data-act="tr-submit"]');
    await p.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/transfers/') && v.status === 'PENDING'));
    if ((await worker.docs(`${W}movements/`)).some((m) => m.type === 'TRANSFER_OUT')) throw new Error('stock left');
  });
  failed += await worker.done();
}
process.exit(failed ? 1 : 0);
