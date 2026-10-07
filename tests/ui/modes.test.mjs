// Till modes: the first-run picker, the supermarket screen and its keys,
// switching modes on Profile (admin, password), and the phone layout.
import { start } from './harness.mjs';

const { page, base, step, shot, done } = await start({ seedPatch: { merge: { 'workspaces/w1/pos/settings': { mode: '' } } } });
const scan = async (code) => { await page.keyboard.type(code); await page.keyboard.press('Enter'); };
const settings = () => page.evaluate(() => window.__store.get('workspaces/w1/pos/settings'));
// Once chosen, the mode changes only on Profile, by an admin, with the password.
const changeMode = async (mode) => {
  await page.goto(base + '/pos/#/profile');
  await page.click('button[data-act="change-mode"]');
  await page.click(`.dialog .modecard[data-mode="${mode}"]`);
  await page.fill('.dialog input[type=password]', 'secret');
  await page.click('.dialog .actions button.primary');
  await page.waitForFunction((m) => window.__store.get('workspaces/w1/pos/settings').mode === m, mode);
};

await page.goto(base + '/pos/');
await step('a new shop is asked which kind of till it wants', async () => {
  await page.waitForSelector('.modecard[data-mode="SUPERMARKET"]', { timeout: 8000 });
  if ((await page.$$('.modecard')).length !== 3) throw new Error('not three modes');
});
await step('picking supermarket saves it and opens the scan screen', async () => {
  await page.click('.modecard[data-mode="SUPERMARKET"]');
  await page.waitForSelector('.market input.scan');
  await page.waitForFunction(() => window.__store.get('workspaces/w1/pos/settings').mode === 'SUPERMARKET');
});
await step('3* then a scan sells three', async () => {
  await page.click('.mlines');
  await scan('3*');
  await page.waitForSelector('.qtyflag:not(.hidden):has-text("× 3")');
  await scan('9555012345678');
  await page.waitForFunction(() => document.querySelector('.mlines .stepper > span')?.textContent === '3');
  if (await page.$('.qtyflag:not(.hidden)')) throw new Error('flag still on');
  await scan('2*9555012345678');
  await page.waitForFunction(() => document.querySelector('.mlines .stepper > span')?.textContent === '5');
  const total = await page.textContent('.totalcard .big');
  if (!total.includes('84.27')) throw new Error(total); // 5 x 15.90 = 79.50 + SST 6% 4.77
});
await step('qty key sets the next quantity', async () => {
  await page.click('.fkeys button:has-text("数量")');
  await page.fill('.dialog input', '2');
  await page.click('.dialog button.primary');
  await page.waitForSelector('.qtyflag:not(.hidden):has-text("× 2")');
  await page.click('.fkeys button:has-text("数量")'); // tapped again: cancelled
  await page.waitForSelector('.qtyflag.hidden', { state: 'attached' });
});
await step('price check shows the price without selling', async () => {
  await page.click('.fkeys button:has-text("查价")');
  await page.fill('.dialog input', '2002');
  await page.press('.dialog input', 'Enter');
  await page.waitForSelector('.dialog .pricecheck:has-text("Nasi Lemak"):has-text("RM 6.00")');
  await page.keyboard.press('Escape');
  if ((await page.$$('.mlines tr.line')).length !== 1) throw new Error('price check sold it');
});
await step('quick items add things without a barcode', async () => {
  await page.click('.fkeys button:has-text("快捷商品")');
  await page.click('.dialog .tile:has-text("Nasi Lemak")');
  await page.waitForSelector('.mlines tr.line:has-text("Nasi Lemak")');
  await page.waitForSelector('.lastitem:has-text("Nasi Lemak")');
});
await step('hold and recall a bill', async () => {
  await page.click('.fkeys button:has-text("挂单")');
  await page.waitForSelector('.mlines .empty');
  await page.click('.fkeys button:has-text("取单")');
  await page.click('.dialog tr.click');
  await page.waitForSelector('.mlines tr.line:has-text("Milo 1kg")');
});
await step('pay from the supermarket screen', async () => {
  await page.click('.mpanel .pay');
  await page.click('.dialog .paymethods button:has-text("现金")');
  await page.click('.dialog .quick button:has-text("刚好")');
  await page.waitForFunction(() => !document.querySelector('.dialog .actions button.primary').disabled);
  await page.click('.dialog .actions button.primary');
  await page.click('.dialog button:has-text("下一单")');
  await page.waitForSelector('.mlines .empty');
  const sales = await page.evaluate(() => [...window.__store].filter(([k]) => k.includes('/sales/')).length);
  if (sales !== 1) throw new Error('sales ' + sales);
});
await step('settings show the mode locked; Profile switches to restaurant; the till follows', async () => {
  await page.goto(base + '/pos/#/settings/features');
  await page.waitForSelector('.modecard.on[data-mode="SUPERMARKET"]');
  await page.waitForSelector('.mode-lock');
  if (!(await page.$('textarea.hidden, .hidden textarea'))) throw new Error('table names shown for supermarket');
  await changeMode('FNB');
  await page.goto(base + '/pos/#/pos');
  await page.waitForSelector('.register .reg-bar button:has-text("桌位")');
  await page.waitForSelector('.ticket .seg button.on:has-text("堂食")');
});
await step('retail shop: product grid, no tables', async () => {
  await changeMode('RETAIL');
  await page.goto(base + '/pos/#/pos');
  await page.waitForSelector('.register .tile');
  if (await page.isVisible('.reg-bar button:has-text("桌位")')) throw new Error('tables shown');
  if (await page.$('.ticket .seg')) throw new Error('order types shown');
  if ((await settings()).mode !== 'RETAIL') throw new Error('not saved');
});
await step('phone width has no sideways scroll on the supermarket screen', async () => {
  await changeMode('SUPERMARKET');
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(base + '/pos/#/pos');
  await page.waitForSelector('.market');
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 400) throw new Error('width ' + w);
  await shot('mode-phone');
});

process.exit(await done() ? 1 : 0);
