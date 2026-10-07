// Taxes per item: a mixed bill, the receipt mark, settings, the item editor,
// the bulk tool and the tax report.
import { start } from './harness.mjs';

const { page, base, step, shot, done } = await start({
  seedPatch: {
    merge: { 'workspaces/w1/pos/settings': { taxPct: 0, taxes: [{ id: 'sst', name: 'SST', pct: 6, byDefault: true }] } },
    set: { 'workspaces/w1/products/3003': { name: 'Beras 5kg', priceSen: 1500, unit: 'pcs', active: true, category: 'food', taxIds: [] } },
    del: ['workspaces/w1/products/7777'],
  },
});
const sums = () => page.$eval('.sums', (el) => el.innerText);

await page.goto(base + '/pos/#/pos');
await page.waitForSelector('.tile');
await step('mixed bill: SST only on Milo, rice tax-free', async () => {
  await page.click('.tile:has-text("Milo 1kg")');
  await page.click('.tile:has-text("Beras 5kg")');
  await page.waitForFunction(() => document.querySelector('.sums').innerText.includes('31.85'));
  const s = await sums();
  if (!/SST 6%\s+0\.95/.test(s)) throw new Error(s);
  await shot('tax-1-ticket');
});
await step('sale stores each tax and the tax-free amount', async () => {
  await page.click('.buttons .pay');
  await page.click('.dialog .paymethods button:has-text("现金")');
  await page.click('.dialog .quick button:has-text("刚好")');
  await page.waitForFunction(() => !document.querySelector('.dialog .actions button.primary').disabled);
  await page.click('.dialog .actions button.primary');
  await page.waitForSelector('.dialog:has-text("下一单")');
  const sale = await page.evaluate(() => [...window.__store].find(([k]) => k.includes('/sales/'))[1]);
  if (sale.taxSen !== 95 || sale.untaxedSen !== 1500 || sale.taxes[0].baseSen !== 1590) throw new Error(JSON.stringify(sale.taxes) + sale.untaxedSen);
  if (JSON.stringify(sale.lines.map((l) => l.taxIds)) !== '[["sst"],[]]') throw new Error(JSON.stringify(sale.lines.map((l) => l.taxIds)));
  await page.click('.dialog button:has-text("打印收据")');
  const receipt = await page.$eval('#print-area', (el) => el.innerText);
  if (!receipt.includes('Beras 5kg *') || !receipt.includes('不收税的商品') || !/SST 6%\s*0\.95/.test(receipt)) throw new Error(receipt);
  await page.click('.dialog button:has-text("下一单")');
});
await step('settings: add a second tax and save', async () => {
  await page.goto(base + '/pos/#/settings/taxes');
  await page.waitForSelector('button:has-text("加一个税")');
  await page.click('button:has-text("加一个税")');
  await shot('tax-3-settings');
  await page.click('.card .actions button.primary');
  await page.waitForFunction(() => (window.__store.get('workspaces/w1/pos/settings').taxes || []).length === 2);
});
await step('item editor: untick SST makes Milo tax-free', async () => {
  await page.goto(base + '/pos/#/items/list');
  await page.click('tr:has-text("Milo 1kg")');
  await page.waitForSelector('.dialog:has-text("这个商品收的税")');
  await page.uncheck('.dialog label:has-text("SST 6%") input');
  await page.click('.dialog .actions button.primary');
  await page.waitForFunction(() => JSON.stringify(window.__store.get('workspaces/w1/products/9555012345678').taxIds) === '[]');
});
await step('untouched item keeps following the default', async () => {
  await page.click('tr:has-text("Nasi Lemak")');
  await page.waitForSelector('.dialog:has-text("这个商品收的税")');
  await page.click('.dialog .actions button.primary');
  await page.waitForSelector('.dialog', { state: 'detached' });
  const p = await page.evaluate(() => window.__store.get('workspaces/w1/products/2002'));
  if ('taxIds' in p) throw new Error(JSON.stringify(p.taxIds));
});
await step('bulk: food category set to SST', async () => {
  await page.click('button:has-text("批量设定税")');
  await page.click('.dialog label:has-text("SST 6%") input');
  await page.selectOption('.dialog select', 'food');
  await page.click('.dialog button:has-text("全选")');
  await shot('tax-4-bulk');
  await page.click('.dialog .actions button.primary');
  await page.waitForFunction(() => JSON.stringify(window.__store.get('workspaces/w1/products/3003').taxIds) === '["sst"]');
  const milo = await page.evaluate(() => window.__store.get('workspaces/w1/products/9555012345678').taxIds);
  if (milo.length) throw new Error('drink touched');
  await page.waitForSelector('tr:has-text("Milo 1kg") .pill:has-text("免税")');
  await shot('tax-5-list');
});
await step('tax report splits taxed and tax-free sales', async () => {
  await page.goto(base + '/pos/#/reports/taxes');
  await page.waitForSelector('table.list td:has-text("不收税的销售")');
  const text = await page.$eval('table.list', (el) => el.innerText);
  if (!/SST 6%\s+15\.90\s+0\.95/.test(text) || !/不收税的销售\s+15\.00/.test(text)) throw new Error(text);
});

process.exit(await done() ? 1 : 0);
