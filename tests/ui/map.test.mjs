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
// A lorry the docks page called to OUT-2 for that transfer.
seed.set[`${W}tmsTrips/trip1`] = { tripNo: 'TRP-1', branchId: 'gudang', status: 'LOADING', dock: 'OUT-2', plate: 'WXY 1234', driverName: 'Ali', createdAt: Date.now(), stops: [{ kind: 'TRANSFER', refId: 'out1', ref: 'TR-OUT-1', to: 'ipoh', status: 'PENDING' }] };
// Malt's slot nearly full: 9 of a 10-unit maximum would be over 80%.
seed.set[`${W}products/${item('malt').barcode}`].maxStockMilli = 1000;
seed.set[`${W}picklists/pk1`] = { pickNo: 'PCK-1', branchId: 'gudang', status: 'PICKING', orders: [], lines: [{ barcode: item('water').barcode, name: 'Water', bin: 'B1-L1-02', qtyMilli: 6000, pickedMilli: 0 }], createdAt: Date.now() };

const phone = process.argv.includes('--phone');
const s = await start({ seedPatch: seed, viewport: phone ? { width: 390, height: 844 } : { width: 1366, height: 860 } });
const { page, base, step, shot } = s;

await step('the warehouse: racks, a lorry arriving and one at its dock; live', async () => {
  await page.goto(`${base}/warehouse/#/map`);
  await page.waitForSelector('select[data-act="map-place"]');
  await page.selectOption('select[data-act="map-place"]', 'gudang');
  await page.waitForSelector('.iso-svg .iso-box');
  await page.waitForSelector('.iso-box[data-id="lorry-WXY 1234"]');
  await page.waitForSelector('.map-live:has-text(":")');
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

await step('the panel: what is waiting, the outbound line, the racks at a glance; the cartons layer', async () => {
  await page.click('.map-tabs button[data-tab="overview"]');
  await page.waitForSelector('[data-card="tasks"] [data-task="pick-pk1"]');
  await page.waitForSelector('[data-card="flow"] [data-flow="CREATED"]');
  await page.click('.map-tabs button[data-tab="racks"]');
  await page.waitForSelector('[data-card="first-expiry"]');
  const full = await page.textContent('.map-panel .map-kpis .stat:nth-child(2) .value');
  if (Number(full) < 1) throw new Error(`nearly full ${full}`);
  await page.click('.map-modes button[data-mode="cartons"]');
  await page.click('.map-modes button[data-mode="fill"]');
  await page.waitForSelector('.map-legend:has-text("> 80%")');
  await shot('map-4-panel');
});

await step('the panel put away and brought back; it stays away next time', async () => {
  await page.click('button[data-act="panel-hide"]', { timeout: 5000 });
  await page.waitForSelector('.map-layout.panel-off .map-panel', { state: 'hidden' });
  await shot('map-5-no-panel');
  await page.click('button[data-act="panel-show"]', { timeout: 5000 });
  await page.waitForSelector('.map-layout:not(.panel-off) .map-panel');
  await page.click('button[data-act="iso-panel"]', { timeout: 5000 });
  await page.waitForSelector('.map-layout.panel-off');
  if (await page.evaluate(() => localStorage.getItem('jsox-map-panel')) !== 'off') throw new Error('not remembered');
  await page.click('button[data-act="iso-panel"]', { timeout: 5000 });
});

await step('the owner turns 3D off for everyone, and back on', async () => {
  await page.click('button[data-act="v3d-off"]');
  await page.click('.dialog .actions button:last-child');
  await page.waitForFunction(() => window.__store.get('workspaces/w1/pos/settings')?.show3d === false);
  await page.waitForSelector('[data-card="v3d-off"] button[data-act="v3d-on"]');
  if (await page.$('.iso-svg')) throw new Error('3D still drawn');
  // The panel stays useful without the picture.
  await page.waitForSelector('.map-panel .map-tabs');
  await shot('map-6-off');
  await page.click('button[data-act="v3d-on"]');
  await page.waitForFunction(() => window.__store.get('workspaces/w1/pos/settings')?.show3d === true);
  await page.waitForSelector('.iso-svg .iso-box');
});

await step('turns any way round, all the way round, and everything can be tapped', async () => {
  const vb = () => page.$eval('.iso-svg', (e) => e.innerHTML.length);
  const before = await page.$eval('.iso-box[data-id="dock-OUT-2"] polygon', (p) => p.getAttribute('points'));
  await page.click('button[data-act="iso-right"]');
  await page.waitForTimeout(450);
  const after = await page.$eval('.iso-box[data-id="dock-OUT-2"] polygon', (p) => p.getAttribute('points'));
  if (before === after) throw new Error('did not turn');
  if (!(await vb())) throw new Error('empty picture');
  const tap = (id) => page.evaluate((x) => document.querySelector(`.iso-box[data-id="${x}"] polygon:last-of-type`).dispatchEvent(new MouseEvent('click', { bubbles: true })), id);
  await tap('dock-OUT-2');
  await page.waitForSelector('.map-info h3:has-text("OUT-2")');
  await tap('z-qc');
  await page.waitForSelector('.map-info h3');
  await tap('pack-0');
  await page.waitForSelector('.map-info h3:has-text("P1")');
  await page.waitForSelector('[data-card="plan-offer"] a[href^="https://wa.me/"]');
  await page.click('button[data-act="iso-home"]');
});

await step('real 3D: 360° round, taps, saved as .glb, the owner puts up their own model', async () => {
  await page.click('button[data-act="v3d-real"]');
  await page.waitForSelector('.iso-wrap.real .g3d[data-ready] canvas.g3d-canvas');
  if (await page.evaluate(() => localStorage.getItem('jsox-3d-real')) !== 'on') throw new Error('not remembered');
  if (await page.$eval('.g3d', (e) => e.view.count()) < 20) throw new Error('3D nearly empty');
  // Drag: it turns round.
  const box = await page.$eval('.g3d canvas', (c) => { const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(box[0], box[1]);
  await page.mouse.down();
  await page.mouse.move(box[0] + 260, box[1] + 10, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  // A tap on a dock in 3D says what is there.
  const at = await page.$eval('.g3d', (e) => e.view.where('dock-OUT-2'));
  if (!at) throw new Error('no dock in 3D');
  await page.mouse.click(at[0], at[1]);
  await page.waitForSelector('.map-info h3:has-text("OUT-2")');
  await page.click('button[data-act="g3d-turn"]');
  await page.waitForSelector('.g3d.turning');
  await shot('map-7-real3d');
  // Saved as a .glb anyone can open.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="g3d-save"]')]);
  if (!/^JSOX-warehouse-map\.glb$/.test(dl.suggestedFilename())) throw new Error(dl.suggestedFilename());
  const { readFileSync } = await import('node:fs');
  const glb = readFileSync(await dl.path());
  if (glb.subarray(0, 4).toString() !== 'glTF' || glb.length < 2000) throw new Error('not a .glb');
  // The owner puts up their own model (here, the one just saved).
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button[data-act="g3d-up"]')]);
  await chooser.setFiles({ name: 'our-shop.glb', mimeType: 'model/gltf-binary', buffer: glb });
  await page.waitForSelector('.iso-wrap.own .g3d[data-model="own"]');
  const rec = await page.evaluate(() => window.__store.get('workspaces/w1/pos/settings')?.models?.['warehouse-map']);
  if (rec?.path !== 'workspaces/w1/models/warehouse-map.glb' || rec.name !== 'our-shop.glb') throw new Error(JSON.stringify(rec));
  await shot('map-8-own-model');
  // Taken down again: back to the live 3D.
  await page.click('button[data-act="g3d-drop"]');
  await page.click('.dialog .actions button:last-child');
  await page.waitForSelector('.iso-wrap:not(.own) .g3d[data-model="live"]');
  // Back to the simple picture, remembered.
  await page.click('button[data-act="v3d-real"]');
  await page.waitForSelector('.iso-wrap:not(.real) .iso-svg');
  if (await page.$('.g3d')) throw new Error('3D still there');
});

await step('a place without shelf codes: a sample, and how to fill it in', async () => {
  await page.selectOption('select[data-act="map-place"]', 'ipoh');
  await page.waitForSelector('.map-demo');
  await page.waitForSelector('.iso-box.demo');
});

process.exit(await s.done() ? 1 : 0);
