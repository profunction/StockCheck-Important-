// JSOX WMS picking, end to end: a transfer and a reservation waiting at
// the warehouse become one picklist in shelf order; scanning fills it and a
// wrong item is refused; what is not on the shelf is marked short; the done
// screen leads on to dispatching; and the home screen says what is waiting.
import { start } from './harness.mjs';
import { item, world } from '../../tools/videos/world.mjs';

const W = 'workspaces/w1/';
const [malt, rice, sugar, water] = ['malt', 'rice', 'sugar', 'water'].map(item);
const seed = world();
const shelf = (p, bin) => { seed.set[`${W}products/${p.barcode}`] = { ...seed.set[`${W}products/${p.barcode}`], shelves: { gudang: bin } }; };
shelf(malt, 'B1-L1-04');
shelf(rice, 'A1-L2-01');
shelf(sugar, 'A1-L1-10');
const line = (p, n) => ({ barcode: p.barcode, name: p.name, qtyMilli: n * 1000 });
seed.set[`${W}transfers/tr1`] = { transferNo: 'TR-PICK-1', fromBranch: 'gudang', toBranch: 'ipoh', status: 'APPROVED', lines: [line(malt, 3), line(rice, 2)], note: '', createdByName: 'Siti', createdAt: Date.now() - 7200_000, approvedAt: Date.now() - 3600_000 };
seed.set[`${W}reservations/rv1`] = { reservationNo: 'RSV-PICK-1', branchId: 'gudang', forWhom: 'Restoran Ali', status: 'OPEN', lines: [line(malt, 2), line(sugar, 1)], createdByName: 'Siti', createdAt: Date.now() - 5400_000 };

const phone = process.argv.includes('--phone');
const s = await start({ seedPatch: seed, viewport: phone ? { width: 390, height: 844 } : { width: 1366, height: 800 } });
const { page, base, step, shot, store } = s;
const scan = async (code) => { await page.click('.wh-scan input.scan'); await page.keyboard.type(code); await page.keyboard.press('Enter'); };
let pickId = '';
const pick = () => store(`${W}picklists/${pickId}`);

await step('the orders waiting at the warehouse, both ticked', async () => {
  await page.goto(`${base}/warehouse/#/picking`);
  await page.waitForSelector('select[data-act="pk-place"]');
  await page.selectOption('select[data-act="pk-place"]', 'gudang');
  await page.waitForSelector('.pk-order[data-order="TR-PICK-1"] input:checked');
  await page.waitForSelector('.pk-order[data-order="RSV-PICK-1"] input:checked');
  await shot('pick-1-waiting');
});

await step('one picklist for both, in shelf order, nothing moved', async () => {
  await page.click('button[data-act="pk-make"]');
  await page.waitForFunction(() => /#\/picking\/\w+/.test(location.hash));
  pickId = await page.evaluate(() => location.hash.split('/').pop());
  await page.waitForFunction((k) => window.__store.get(k)?.status === 'WAITING', `${W}picklists/${pickId}`);
  const p = await pick();
  const got = p.lines.map((l) => `${l.bin}:${l.qtyMilli}`).join(' ');
  if (got !== 'A1-L1-10:1000 A1-L2-01:2000 B1-L1-04:5000') throw new Error(got);
  if (p.branchId !== 'gudang' || p.zone !== 'A B' || p.orders.map((o) => o.ref).join() !== 'RSV-PICK-1,TR-PICK-1') throw new Error(JSON.stringify(p));
  const moved = await page.evaluate(() => [...window.__store.keys()].filter((k) => k.includes('/movements/')).length);
  if (moved) throw new Error(`${moved} movements`);
});

await step('start: the first shelf in big letters; scanning fills it; a wrong item is refused', async () => {
  await page.click('button[data-act="pk-start"]');
  await page.waitForSelector(`.pk-next[data-next="${sugar.barcode}"] .pk-bin:has-text("A1-L1-10")`);
  await shot('pick-2-next');
  await scan(sugar.barcode);
  await page.waitForSelector(`.pk-next[data-next="${rice.barcode}"]`);
  await scan(water.barcode);
  await page.waitForSelector('#toast.error:has-text("拿错了")');
  await page.click('button[data-act="pk-got"]');
  await page.waitForSelector(`.pk-next[data-next="${malt.barcode}"] .pk-bin:has-text("B1-L1-04")`);
  for (let i = 0; i < 3; i++) await scan(malt.barcode);
  await page.waitForSelector(`.pk-line[data-line="${malt.barcode}"] .pk-q:has-text("3/5")`);
  const p = await pick();
  if (p.status !== 'PICKING' || p.pickerName !== 'Ah Hock') throw new Error(JSON.stringify(p));
  const picked = p.lines.map((l) => l.pickedMilli).join();
  if (picked !== '1000,2000,3000') throw new Error(picked);
  await shot('pick-3-picking');
});

await step('finish: what is missing is marked short; next, dispatch and hand over', async () => {
  await page.click('button[data-act="pk-finish"]');
  await page.click('.dialog .actions button:last-child');
  await page.waitForFunction((k) => window.__store.get(k)?.status === 'DONE', `${W}picklists/${pickId}`);
  const p = await pick();
  const m = p.lines.find((l) => l.barcode === malt.barcode);
  if (!m.short || m.pickedMilli !== 3000 || !p.doneAt) throw new Error(JSON.stringify(p));
  await page.waitForSelector('[data-card="pk-next-step"] [data-go="TR-PICK-1"]');
  await shot('pick-4-done');
  await page.click('[data-card="pk-next-step"] [data-go="TR-PICK-1"]');
  await page.waitForFunction(() => location.hash === '#/transfers/tr1');
  await page.waitForSelector('button[data-act="tr-dispatch"]');
});

await step('the list: nothing left waiting; the picklist under done', async () => {
  await page.goto(`${base}/warehouse/#/picking`);
  await page.waitForSelector('[data-card="to-pick"]');
  if (await page.$('.pk-order')) throw new Error('orders still waiting');
  await page.click('.wh-tabs button:nth-child(2)');
  await page.waitForSelector(`.pk-card[data-pick="${pickId}"]`);
});

await step('a new reservation shows on the home screen as waiting to be picked', async () => {
  await page.evaluate((k) => window.__put(k, { reservationNo: 'RSV-PICK-2', branchId: 'gudang', forWhom: 'Kedai Lim', status: 'OPEN', lines: [{ barcode: '9555012345678', name: 'Milo 1kg', qtyMilli: 1000 }], createdAt: Date.now() }), `${W}reservations/rv2`);
  await page.goto(`${base}/warehouse/#/home`);
  await page.waitForSelector('.wh-tile.hot:has-text("拣货")');
  await page.waitForSelector('.wh-row:has-text("RSV-PICK-2")');
  await shot('pick-5-home');
});

process.exit(await s.done() ? 1 : 0);
