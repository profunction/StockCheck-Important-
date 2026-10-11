// The 3D pictures outside the warehouse: Every Data's town (each shop as
// tall as today's sales, the warehouse as its stock, a lorry on the road for
// a transfer on its way); a tap on a building shows its figures.
import { start } from './harness.mjs';
import { world } from '../../tools/videos/world.mjs';

const W = 'workspaces/w1/';
const seed = world({ withSales: true });
seed.set[`${W}transfers/road1`] = { transferNo: 'TR-ROAD-1', fromBranch: 'gudang', toBranch: 'ipoh', status: 'SENT', lines: [{ barcode: '1', name: 'x', qtyMilli: 1000 }], createdAt: Date.now(), sentAt: Date.now() };
const phone = process.argv.includes('--phone');
const s = await start({ seedPatch: seed, viewport: phone ? { width: 390, height: 844 } : { width: 1366, height: 900 } });
const { page, base, step, shot } = s;

await step('Every Data: the town, the busiest shop tallest, a lorry on the road', async () => {
  await page.goto(`${base}/data/`);
  await page.waitForSelector('[data-card="city3d"] .iso-box[data-id="b-ipoh"]');
  await page.waitForSelector('[data-card="city3d"] .iso-box[data-id="b-gudang"]');
  await page.waitForSelector('[data-card="city3d"] .iso-box[data-id="lorry-TR-ROAD-1"]');
  await page.evaluate(() => document.querySelector('[data-card="city3d"]').scrollIntoView());
  await shot('town-1-data');
});

await step('a tap on the shop: its takings and receipts', async () => {
  await page.evaluate(() => document.querySelector('.iso-box[data-id="b-ipoh"] polygon:last-of-type').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForSelector('.city-info .city-figs:has-text("今天营业额")');
  const text = await page.textContent('.city-info');
  if (!/Kedai Ipoh/.test(text) || !/RM/.test(text)) throw new Error(text);
  await shot('town-2-tap');
});

await step('POS shop floor, restaurant: tables with chairs, one with a bill open', async () => {
  await page.goto(`${base}/pos/#/floor`);
  await page.waitForSelector('.iso-box[data-id^="till-"]');
  // Changed while the page is open: it follows, as a till would.
  await page.evaluate((k) => window.__put(k, { ...window.__store.get(k), mode: 'FNB' }), `${W}pos/settings`);
  await page.evaluate((k) => window.__put(k, { table: '3', branchId: '', orderType: 'DINE_IN', lines: [{ barcode: '1', name: 'Nasi Lemak', qtyMilli: 2000, unitPriceSen: 650, taxIds: [] }], discountIds: [], openedAt: Date.now() - 1200_000, updatedAt: Date.now() }), `${W}orders/o3`);
  await page.waitForSelector('.iso-box[data-id="table-3"].busy');
  await page.waitForSelector('.iso-box[data-id="table-1"]:not(.busy)');
  await page.evaluate(() => document.querySelector('.iso-box[data-id="table-3"] polygon:last-of-type').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForSelector('.map-info:has-text("Nasi Lemak")');
  await shot('town-3-fnb');
});

await step('POS shop floor, shop: a shelf per category', async () => {
  await page.evaluate((k) => window.__put(k, { ...window.__store.get(k), mode: 'RETAIL' }), `${W}pos/settings`);
  await page.waitForSelector('.iso-box[data-id^="shelf-"]');
  await shot('town-4-shop');
});

process.exit(await s.done() ? 1 : 0);
