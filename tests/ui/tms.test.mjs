// SuXin TMS end to end: a lorry with its road tax due; a driver who clocks
// in with it; a trip planned from what the warehouse has waiting (a
// transfer and a customer's reservation); loaded, on the road (and on the
// 3D map), one stop delivered with a signature and one not; finished; the
// proof of delivery; the driver clocks out with the kilometres.
import { start } from './harness.mjs';
import { world } from '../../tools/videos/world.mjs';

const W = 'workspaces/w1/';
const seed = world();
const line = (n) => [{ barcode: '9555012345678', name: 'Milo 1kg', qtyMilli: n * 1000 }];
seed.set[`${W}transfers/tr1`] = { transferNo: 'TR-LORRY-1', fromBranch: 'gudang', toBranch: 'ipoh', status: 'APPROVED', lines: line(3), createdAt: Date.now() - 7200_000, approvedAt: Date.now() - 3600_000 };
seed.set[`${W}reservations/rv1`] = { reservationNo: 'RSV-LORRY-1', branchId: 'gudang', forWhom: 'Restoran Ali', status: 'OPEN', lines: line(2), createdAt: Date.now() - 5400_000 };
const phone = process.argv.includes('--phone');
const s = await start({ seedPatch: seed, viewport: phone ? { width: 390, height: 844 } : { width: 1366, height: 860 } });
const { page, base, step, shot, docs } = s;
// One page all the way through: the pretend database lives in it.
const nav = (hash) => page.evaluate((x) => { location.hash = x; }, hash);
const day = (n) => new Date(Date.now() + n * 86_400_000 + 8 * 3600_000).toISOString().slice(0, 10);
const yes = () => page.click('.dialog .actions button:last-child');
let tripId = '';
const theTrip = async () => (await docs(`${W}tmsTrips/`)).find((x) => x.__id === tripId);

await step('a lorry, its road tax due in 10 days', async () => {
  await page.goto(`${base}/tms/#/lorries`);
  await page.click('button[data-act="lorry-add"]');
  await page.fill('input[data-f="plate"]', 'wxy 1234');
  await page.fill('input[data-f="model"]', 'Isuzu NPR 1 tan');
  await page.fill('input[data-f="capacityKg"]', '1000');
  await page.fill('input[data-f="roadTaxExpiry"]', day(10));
  await page.click('button[data-act="lorry-save"]');
  await page.waitForSelector('.tm-lorry .tm-plate:has-text("WXY 1234")');
  await page.waitForSelector('.tm-lorry .pill.warn:has-text("10")');
});

await step('a driver clocks in with it, odometer 1000', async () => {
  await nav('#/drivers');
  await page.click('button[data-act="driver-add"]');
  await page.fill('input[data-f="name"]', 'Ali bin Ahmad');
  await page.fill('input[data-f="phone"]', '012-3456789');
  await page.click('button[data-act="driver-save"]');
  await page.waitForSelector('.tm-driver:has-text("Ali bin Ahmad") button[data-act="clock-in"]');
  await page.click('.tm-driver:has-text("Ali bin Ahmad") button[data-act="clock-in"]');
  await page.selectOption('select[data-f="shift-lorry"]', { label: 'WXY 1234' });
  await page.fill('input[data-f="odo-in"]', '1000');
  await page.click('button[data-act="clock-in-save"]');
  await page.waitForSelector('.tm-driver.on:has-text("Ali bin Ahmad") .pill.shelf:has-text("WXY 1234")');
  const shift = (await docs(`${W}tmsShifts/`))[0];
  if (shift.odoIn !== 1000 || shift.plate !== 'WXY 1234' || shift.outAt !== null) throw new Error(JSON.stringify(shift));
});

await step('a trip from what the warehouse has waiting; the driver brings his lorry', async () => {
  await nav('#/trips/new');
  await page.waitForSelector('.pk-order[data-stop="TR-LORRY-1"] input:checked');
  await page.waitForSelector('.pk-order[data-stop="RSV-LORRY-1"] input:checked');
  const driverId = await page.$eval('select[data-f="driver"] option:nth-child(2)', (o) => o.value);
  await page.selectOption('select[data-f="driver"]', driverId);
  if (!await page.inputValue('select[data-f="lorry"]')) throw new Error('lorry not chosen with the driver');
  await shot('tms-1-plan');
  await page.click('button[data-act="trip-save"]');
  await page.waitForFunction(() => /#\/trips\/\w+/.test(location.hash) && !location.hash.endsWith('/new'));
  tripId = await page.evaluate(() => location.hash.split('/').pop());
  const x = await theTrip();
  if (x.status !== 'PLANNED' || x.plate !== 'WXY 1234' || x.branchId !== 'gudang' || x.stops.map((z) => z.ref).join() !== 'RSV-LORRY-1,TR-LORRY-1') throw new Error(JSON.stringify(x));
});

await step('loaded, and off: the next stop in big letters, and the lorry on the 3D map', async () => {
  await page.click('button[data-act="trip-LOADING"]');
  await page.click('button[data-act="trip-ON_ROAD"]');
  await yes();
  await page.waitForSelector('.pk-next[data-next="RSV-LORRY-1"]');
  await shot('tms-2-road');
  await nav('#/map');
  await page.waitForSelector('[data-card="fleet3d"] .iso-box[data-id="lorry-WXY 1234"]');
  await page.waitForSelector('[data-card="fleet3d"] .iso-box[data-id="b-c:Restoran Ali"]');
  await shot('tms-3-map');
  await nav(`#/trips/${tripId}`);
});

await step('the customer signs; the branch was not in, so that stop is not delivered; trip finished', async () => {
  await page.click('.tm-stop[data-stop="RSV-LORRY-1"] button[data-act="stop-deliver"]');
  await page.fill('input[data-f="receiver"]', 'Encik Ali');
  await page.$eval('.dialog .sigpad', (c) => c.scrollIntoView({ block: 'center' }));
  const box = await page.$eval('.dialog .sigpad', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 20 + i * 20, box.y + 20 + (i % 2) * 30);
  await page.mouse.up();
  await page.click('button[data-act="pod-save"]');
  await page.waitForSelector('.tm-stop[data-stop="RSV-LORRY-1"] .tm-ink polyline');
  await page.click('.tm-stop[data-stop="TR-LORRY-1"] button[data-act="stop-fail"]');
  await page.fill('input[data-f="reason"]', 'Kedai tutup');
  await page.click('button[data-act="fail-save"]');
  await page.click('button[data-act="trip-DONE"]');
  await page.waitForFunction(async (id) => window.__store.get(`workspaces/w1/tmsTrips/${id}`)?.status === 'DONE', tripId);
  const x = await theTrip();
  const [a, b] = x.stops;
  if (a.status !== 'DELIVERED' || a.receivedBy !== 'Encik Ali' || !a.signature || b.status !== 'FAILED' || b.note !== 'Kedai tutup' || !x.doneAt) throw new Error(JSON.stringify(x));
  await shot('tms-4-done');
});

await step('proof of delivery: who, when, the signature', async () => {
  await nav('#/pod');
  await page.waitForSelector('.tm-podcard[data-pod="RSV-LORRY-1"] .tm-ink polyline');
  await page.waitForSelector('.tm-podcard[data-pod="TR-LORRY-1"]:has-text("Kedai tutup")');
  await shot('tms-5-pod');
});

await step('home: the transfer not delivered waits for a lorry again; the road tax warning', async () => {
  await nav('#/home');
  await page.waitForSelector('[data-card="papers"]:has-text("WXY 1234")');
  await nav('#/trips/new');
  await page.waitForSelector('.pk-order[data-stop="TR-LORRY-1"]');
  if (await page.$('.pk-order[data-stop="RSV-LORRY-1"]')) throw new Error('delivered stop offered again');
});

await step('the driver clocks out: 180 km', async () => {
  await nav('#/drivers');
  await page.click('.tm-driver:has-text("Ali bin Ahmad") button[data-act="clock-out"]');
  await page.fill('input[data-f="odo-out"]', '1180');
  await page.click('button[data-act="clock-out-save"]');
  await page.waitForSelector('table.list td.num:has-text("180")');
  await shot('tms-6-drivers');
});

process.exit(await s.done() ? 1 : 0);
