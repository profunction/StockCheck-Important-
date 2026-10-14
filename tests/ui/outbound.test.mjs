// JSOX WMS outbound, end to end: two orders picked and waiting to be
// packed show on the board; one is marked urgent and goes to the top; both
// are packed into cartons and set down in staging lanes; a lorry planned in
// the TMS waits in the yard, is called to dock OUT-1, both orders are
// loaded (the trip starts loading) and it is let go (on the road).
import { start } from './harness.mjs';
import { item, world } from '../../tools/videos/world.mjs';

const W = 'workspaces/w1/';
const [malt, rice] = ['malt', 'rice'].map(item);
const seed = world();
const line = (p, n) => ({ barcode: p.barcode, name: p.name, qtyMilli: n * 1000 });
const ago = (min) => Date.now() - min * 60_000;
seed.set[`${W}transfers/tr1`] = { transferNo: 'TR-OUT-1', fromBranch: 'gudang', toBranch: 'ipoh', status: 'APPROVED', lines: [line(malt, 3), line(rice, 2)], createdAt: ago(120), approvedAt: ago(100) };
seed.set[`${W}reservations/rv1`] = { reservationNo: 'RSV-OUT-1', branchId: 'gudang', forWhom: 'Restoran Ali', status: 'OPEN', lines: [line(malt, 2)], createdAt: ago(90) };
seed.set[`${W}picklists/pk1`] = {
  pickNo: 'PCK-OUT-1', branchId: 'gudang', status: 'DONE', zone: 'A', createdAt: ago(60), doneAt: ago(30), pickerName: 'Ah Kow',
  orders: [{ kind: 'TRANSFER', id: 'tr1', ref: 'TR-OUT-1', to: 'ipoh' }, { kind: 'RESERVATION', id: 'rv1', ref: 'RSV-OUT-1', to: 'Restoran Ali' }],
  lines: [{ ...line(malt, 5), pickedMilli: 5000, bin: 'A1-L1-01' }, { ...line(rice, 2), pickedMilli: 2000, bin: 'A1-L1-02' }],
};
seed.set[`${W}tmsTrips/trip1`] = {
  tripNo: 'TRP-OUT-1', branchId: 'gudang', status: 'PLANNED', plate: 'WXY 1234', lorryId: 'l1', driverName: 'Ali bin Ahmad', date: '2026-10-12', createdAt: ago(20), createdByUid: 'u-owner',
  stops: [
    { kind: 'RESERVATION', refId: 'rv1', ref: 'RSV-OUT-1', to: 'Restoran Ali', status: 'PENDING' },
    { kind: 'TRANSFER', refId: 'tr1', ref: 'TR-OUT-1', to: 'ipoh', status: 'PENDING' },
  ],
};

const phone = process.argv.includes('--phone');
const s = await start({ seedPatch: seed, viewport: phone ? { width: 390, height: 844 } : { width: 1366, height: 860 } });
const { page, base, step, shot, store } = s;
const nav = (hash) => page.evaluate((x) => { location.hash = x; }, hash);
const yes = () => page.click('.dialog .actions button:last-child');
const stageCount = (st) => page.$eval(`.ob-stage[data-stage="${st}"] b`, (b) => b.textContent);

await step('the board: both orders picked, waiting to be packed', async () => {
  await page.goto(`${base}/warehouse/#/outbound`);
  await page.waitForSelector('select[data-act="ob-place"]');
  await page.selectOption('select[data-act="ob-place"]', 'gudang');
  await page.waitForSelector('.ob-card[data-ob="TR-OUT-1"]:has-text("打包中")');
  await page.waitForSelector('.ob-card[data-ob="RSV-OUT-1"]');
  if (await stageCount('PACKING') !== '2') throw new Error(`packing ${await stageCount('PACKING')}`);
  const first = await page.$eval('.ob-card', (c) => c.dataset.ob);
  if (first !== 'TR-OUT-1') throw new Error(`first ${first}`);
  await shot('out-1-board');
});

await step('urgent: the reservation goes to the top', async () => {
  await page.click('.ob-card[data-ob="RSV-OUT-1"]');
  await page.waitForSelector('[data-card="pack"]');
  await page.click('button[data-act="ob-urgent"]');
  await page.waitForFunction((k) => window.__store.get(k)?.urgent === true, `${W}outbound/RS-rv1`);
  const p = await store(`${W}outbound/RS-rv1`);
  if (p.status !== 'OPEN' || p.kind !== 'RESERVATION' || p.orderId !== 'rv1' || p.branchId !== 'gudang') throw new Error(JSON.stringify(p));
});

await step('pack it: 2 cartons, 12.5 kg, lane S2', async () => {
  await page.click('button[data-act="ctn-plus"]');
  await page.fill('input[data-f="weight"]', '12.5');
  await page.click('.ob-lane[data-lane="S2"]');
  await shot('out-2-pack');
  await page.click('button[data-act="pack-save"]');
  await page.waitForFunction((k) => window.__store.get(k)?.status === 'PACKED', `${W}outbound/RS-rv1`);
  const p = await store(`${W}outbound/RS-rv1`);
  if (p.cartons !== 2 || p.lane !== 'S2' || p.weightKg !== 12.5 || !p.urgent || !p.packedByName) throw new Error(JSON.stringify(p));
  await page.waitForSelector('[data-card="packed"]:has-text("S2")');
});

await step('the transfer packed too, into the first empty lane', async () => {
  await nav('#/outbound/TR-tr1');
  await page.waitForSelector('[data-card="pack"]');
  await page.waitForSelector('.ob-lane.on[data-lane="S1"]');
  await page.click('button[data-act="pack-save"]');
  await page.waitForFunction((k) => window.__store.get(k)?.status === 'PACKED', `${W}outbound/TR-tr1`);
  await nav('#/outbound');
  await page.waitForSelector('.ob-card[data-ob="TR-OUT-1"]:has-text("已打包")');
  if (await stageCount('PACKED') !== '2') throw new Error(`packed ${await stageCount('PACKED')}`);
  const first = await page.$eval('.ob-card', (c) => c.dataset.ob);
  if (first !== 'RSV-OUT-1') throw new Error(`urgent not first: ${first}`);
  await shot('out-3-packed');
});

await step('the docks: the lorry waits in the yard; called to OUT-1', async () => {
  await nav('#/docks');
  await page.waitForSelector('.ob-yard[data-yard="WXY 1234"]');
  await page.waitForSelector('.ob-lane[data-lane="S2"] .ob-chip[data-ob="RSV-OUT-1"]');
  await page.click('.ob-yard[data-yard="WXY 1234"] button[data-dock="OUT-1"]');
  await page.waitForFunction((k) => window.__store.get(k)?.dock === 'OUT-1', `${W}tmsTrips/trip1`);
  await page.waitForSelector('.ob-dock[data-dock="OUT-1"]:has-text("WXY 1234")');
});

await step('load both: the trip starts loading; all on, let it go', async () => {
  await page.click('.ob-dock[data-dock="OUT-1"] .ob-load-row[data-load="RSV-OUT-1"] button[data-act="load"]');
  await page.waitForFunction((k) => window.__store.get(k)?.status === 'LOADING', `${W}tmsTrips/trip1`);
  if (!await page.$eval('.ob-dock[data-dock="OUT-1"] button[data-act="let-go"]', (b) => b.disabled)) throw new Error('let go before all loaded');
  await page.click('.ob-dock[data-dock="OUT-1"] .ob-load-row[data-load="TR-OUT-1"] button[data-act="load"]');
  await page.waitForSelector('.ob-dock.ready[data-dock="OUT-1"]');
  const p = await store(`${W}outbound/TR-tr1`);
  if (p.status !== 'LOADED' || p.tripId !== 'trip1' || p.dock !== 'OUT-1' || !p.loadedByName) throw new Error(JSON.stringify(p));
  await shot('out-4-dock');
  await page.click('.ob-dock[data-dock="OUT-1"] button[data-act="let-go"]');
  await yes();
  await page.waitForFunction((k) => window.__store.get(k)?.status === 'ON_ROAD', `${W}tmsTrips/trip1`);
  await page.waitForSelector('.ob-dock[data-dock="OUT-1"].empty');
});

await step('the board: both on the road; home shows outbound and docks', async () => {
  await nav('#/outbound');
  await page.waitForSelector('.ob-card[data-ob="TR-OUT-1"]:has-text("在路上")');
  if (await stageCount('ON_ROAD') !== '2') throw new Error(`on road ${await stageCount('ON_ROAD')}`);
  await nav('#/home');
  await page.waitForSelector('.wh-tile:has-text("出货单")');
  await page.waitForSelector('.wh-tile:has-text("装车码头")');
});

process.exit(await s.done() ? 1 : 0);
