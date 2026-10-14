// JSOX WMS in 3D: racks where the shelf codes say, slots coloured by
// stock, expiry, picking and activity; lorries at the docks for what is
// arriving and leaving; a tap shows what is on a slot; a place with no
// shelf codes yet shows a sample and says how to fill it in.
import { start } from './harness.mjs';
import { item, world } from '../../tools/videos/world.mjs';

const W = 'workspaces/w1/';
const seed = world();
const bins = { malt: 'A1-L1-04', rice: 'A1-L2-01', sugar: 'A1-L1-10', eggs: 'A2-L1-03', bread: 'A2-L3-06', water: 'B1-L1-02', noodle: 'B1-L2-08', coffee: 'B2-L1-05', milk: 'B2-L2-01' };
for (const [pic, bin] of Object.entries(bins)) {
  const p = item(pic);
  seed.set[`${W}products/${p.barcode}`] = { ...seed.set[`${W}products/${p.barcode}`], shelves: { gudang: bin } };
}
seed.set[`${W}transfers/out1`] = { transferNo: 'TR-OUT-1', fromBranch: 'gudang', toBranch: 'ipoh', status: 'APPROVED', lines: [{ barcode: item('malt').barcode, name: 'Malt', qtyMilli: 2000 }], createdAt: Date.now() };
seed.set[`${W}picklists/pk1`] = { pickNo: 'PCK-1', branchId: 'gudang', status: 'PICKING', orders: [], lines: [{ barcode: item('water').barcode, name: 'Water', bin: 'B1-L1-02', qtyMilli: 6000, pickedMilli: 0 }], createdAt: Date.now() };

const phone = process.argv.includes('--phone');
const s = await start({ seedPatch: seed, viewport: phone ? { width: 390, height: 844 } : { width: 1366, height: 860 } });
const { page, base, step, shot } = s;

await step('the warehouse: racks, a lorry arriving and one leaving', async () => {
  await page.goto(`${base}/warehouse/#/map`);
  await page.waitForSelector('select[data-act="map-place"]');
  await page.selectOption('select[data-act="map-place"]', 'gudang');
  await page.waitForSelector('.iso-svg .iso-box');
  await page.waitForSelector('.iso-box[data-id="lorry-TR-OUT-1"]');
  await page.waitForSelector('.iso-box[data-id^="lorry-PO-"]');
  if (await page.$('.map-demo')) throw new Error('shows the sample');
  const used = await page.textContent('.map-kpis .stat:first-child .value');
  if (!/^9\//.test(used)) throw new Error(used);
  await shot('map-1-stock');
});

await step('a tap on a slot says what is on it', async () => {
  // The top face of the slot: what a finger lands on.
  await page.evaluate(() => [...document.querySelectorAll('.iso-box title')].find((t) => t.textContent.startsWith('A1-L1-04'))
    .parentNode.querySelector('polygon:last-of-type').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForSelector(`.map-info [data-bin-item="${item('malt').barcode}"]`);
});

await step('the other colourings: expiry, picking (the slot to pick pulses), activity', async () => {
  await page.click('.map-modes button[data-mode="expiry"]');
  await page.click('.map-modes button[data-mode="pick"]');
  await page.waitForSelector('.iso-box.pulse');
  await shot('map-2-pick');
  await page.click('.map-modes button[data-mode="activity"]');
  await page.click('button[data-act="iso-right"]');
  await page.click('button[data-act="iso-in"]');
  await page.waitForSelector('.iso-box');
  await shot('map-3-turned');
});

await step('a place without shelf codes: a sample, and how to fill it in', async () => {
  await page.selectOption('select[data-act="map-place"]', 'ipoh');
  await page.waitForSelector('.map-demo');
  await page.waitForSelector('.iso-box.demo');
});

process.exit(await s.done() ? 1 : 0);
