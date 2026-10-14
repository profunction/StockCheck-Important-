// JSOX WMS on Auto: the manager switches the warehouse to Auto; the orders
// waiting become picklists on their own (one per lorry, else per place they
// go to); once picked, an order gets a packing table and a lane; once
// packed, its lorry is called from the yard to a free dock. Another screen
// holding the lease means this one leaves it alone.
import { start } from './harness.mjs';
import { item, world } from '../../tools/videos/world.mjs';

const W = 'workspaces/w1/';
const [malt, rice] = ['malt', 'rice'].map(item);
const seed = world();
const line = (p, n) => ({ barcode: p.barcode, name: p.name, qtyMilli: n * 1000 });
const ago = (min) => Date.now() - min * 60_000;
seed.set[`${W}products/${malt.barcode}`] = { ...seed.set[`${W}products/${malt.barcode}`], shelves: { gudang: 'A1-L1-04' } };
seed.set[`${W}products/${rice.barcode}`] = { ...seed.set[`${W}products/${rice.barcode}`], shelves: { gudang: 'A1-L2-01' } };
seed.set[`${W}transfers/tr1`] = { transferNo: 'TR-AUTO-1', fromBranch: 'gudang', toBranch: 'ipoh', status: 'APPROVED', lines: [line(malt, 3)], createdAt: ago(60), approvedAt: ago(50) };
seed.set[`${W}transfers/tr2`] = { transferNo: 'TR-AUTO-2', fromBranch: 'gudang', toBranch: 'ipoh', status: 'APPROVED', lines: [line(rice, 2)], createdAt: ago(40), approvedAt: ago(30) };
seed.set[`${W}transfers/tr3`] = { transferNo: 'TR-AUTO-3', fromBranch: 'gudang', toBranch: 'kl', status: 'PENDING', lines: [line(rice, 1)], createdAt: ago(20) };
seed.set[`${W}reservations/rv1`] = { reservationNo: 'RSV-AUTO-1', branchId: 'gudang', forWhom: 'Restoran Ali', status: 'OPEN', lines: [line(malt, 2)], createdAt: ago(45) };
seed.set[`${W}tmsTrips/trip1`] = { tripNo: 'TRP-AUTO-1', branchId: 'gudang', status: 'PLANNED', plate: 'WXY 1234', driverName: 'Ali', createdAt: ago(10), createdByUid: 'u-owner',
  stops: [{ kind: 'RESERVATION', refId: 'rv1', ref: 'RSV-AUTO-1', to: 'Restoran Ali', status: 'PENDING' }] };

const s = await start({ seedPatch: seed, viewport: { width: 1366, height: 860 } });
const { page, base, step, shot, docs, store } = s;
const nav = (hash) => page.evaluate((x) => { location.hash = x; }, hash);
const tick = () => page.evaluate(() => import('/wh/auto.js').then((m) => m.tick()));
const picklists = async () => (await docs(`${W}picklists/`)).sort((a, b) => a.orders.length - b.orders.length);

await step('the manager switches the warehouse to Auto: picklists by lorry, else by place', async () => {
  await page.goto(`${base}/warehouse/#/outbound`);
  await page.waitForSelector('select[data-act="ob-place"]');
  await page.selectOption('select[data-act="ob-place"]', 'gudang');
  await page.waitForSelector('[data-card="auto"] button[data-act="auto-on"]:not([disabled])');
  await page.click('button[data-act="auto-on"]');
  await page.waitForFunction((k) => window.__store.get(k)?.on === true, `${W}whAuto/gudang`);
  await page.waitForFunction((p) => [...window.__store.keys()].filter((k) => k.startsWith(p)).length === 2, `${W}picklists/`);
  const [byLorry, byPlace] = await picklists();
  if (byLorry.tripId !== 'trip1' || byLorry.orders.map((o) => o.ref).join() !== 'RSV-AUTO-1' || !byLorry.auto) throw new Error(JSON.stringify(byLorry));
  if (byPlace.orders.map((o) => o.ref).sort().join() !== 'TR-AUTO-1,TR-AUTO-2' || byPlace.status !== 'WAITING' || byPlace.branchId !== 'gudang') throw new Error(JSON.stringify(byPlace));
  // Waiting for approval: not picked yet.
  if ((await picklists()).some((p) => p.orders.some((o) => o.ref === 'TR-AUTO-3'))) throw new Error('picked before approval');
  await page.waitForSelector('[data-card="auto"].on');
  await shot('auto-1-on');
});

await step('the picklists say they were made automatically', async () => {
  await nav('#/picking');
  await page.waitForSelector('select[data-act="pk-place"]');
  await page.selectOption('select[data-act="pk-place"]', 'gudang');
  await page.waitForSelector('.pk-card [data-auto]');
});

await step('picked: a packing table and a lane of its own', async () => {
  const [byLorry] = await picklists();
  await page.evaluate(([k, v]) => window.__put(k, v), [`${W}picklists/${byLorry.__id}`, { ...byLorry, __id: undefined, status: 'DONE', doneAt: Date.now() }]);
  await tick();
  await page.waitForFunction((k) => window.__store.get(k)?.station === 'P1', `${W}outbound/RS-rv1`);
  const p = await store(`${W}outbound/RS-rv1`);
  if (p.lane !== 'S1' || p.status !== 'OPEN') throw new Error(JSON.stringify(p));
  await nav('#/outbound/RS-rv1');
  await page.waitForSelector('[data-card="pack"] h2:has-text("P1")');
});

await step('packed: its lorry is called from the yard to a free dock', async () => {
  await page.click('button[data-act="pack-save"]');
  await page.waitForFunction((k) => window.__store.get(k)?.status === 'PACKED', `${W}outbound/RS-rv1`);
  await tick();
  await page.waitForFunction((k) => window.__store.get(k)?.dock === 'OUT-1', `${W}tmsTrips/trip1`);
  await nav('#/docks');
  await page.waitForSelector('.ob-dock[data-dock="OUT-1"]:has-text("WXY 1234")');
  await shot('auto-2-docked');
});

await step('another screen holds the lease: this one leaves it alone until it runs out', async () => {
  const rec = await store(`${W}whAuto/gudang`);
  await page.evaluate(([k, v]) => window.__put(k, v), [`${W}whAuto/gudang`, { ...rec, leaseBy: 'someone-else', leaseUntil: Date.now() + 60_000 }]);
  await page.evaluate(([k, v]) => window.__put(k, v), [`${W}transfers/tr3`, { transferNo: 'TR-AUTO-3', fromBranch: 'gudang', toBranch: 'kl', status: 'APPROVED', lines: [{ barcode: 'x', name: 'X', qtyMilli: 1000 }], createdAt: Date.now(), approvedAt: Date.now() }]);
  await tick();
  if ((await picklists()).length !== 2) throw new Error('ran without the lease');
  await page.evaluate(([k, v]) => window.__put(k, v), [`${W}whAuto/gudang`, { ...rec, leaseBy: 'someone-else', leaseUntil: Date.now() - 1 }]);
  await tick();
  await page.waitForFunction((p) => [...window.__store.keys()].filter((k) => k.startsWith(p)).length === 3, `${W}picklists/`);
});

await step('back to manual: nothing more is planned', async () => {
  await nav('#/outbound');
  await page.waitForSelector('button[data-act="auto-manual"]:not([disabled])');
  await page.click('button[data-act="auto-manual"]');
  await page.waitForFunction((k) => window.__store.get(k)?.on === false, `${W}whAuto/gudang`);
  await page.evaluate(([k, v]) => window.__put(k, v), [`${W}transfers/tr4`, { transferNo: 'TR-AUTO-4', fromBranch: 'gudang', toBranch: 'kl', status: 'APPROVED', lines: [{ barcode: 'y', name: 'Y', qtyMilli: 1000 }], createdAt: Date.now(), approvedAt: Date.now() }]);
  await tick();
  if ((await picklists()).length !== 3) throw new Error('planned while manual');
});

process.exit(await s.done() ? 1 : 0);
