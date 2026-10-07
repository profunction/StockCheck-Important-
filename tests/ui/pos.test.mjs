// The till, end to end: scanning, modifiers, weighed goods, dine-in, discounts,
// cash rounding, kitchen tickets, reports, voids, items, customers and points.
import { start } from './harness.mjs';

const { page, base, step, shot, done } = await start();

await page.goto(base + '/pos/');
await step('lands on the register', async () => {
  await page.waitForSelector('.tile', { timeout: 8000 });
  if (!page.url().includes('#/pos')) throw new Error('url ' + page.url());
});

await step('scanner adds Milo', async () => {
  await page.click('.tiles'); // focus away from inputs, like a cashier would
  await page.keyboard.type('9555012345678');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.ticket .line:has-text("Milo 1kg")');
});
await step('scanning again adds one more, not a new line', async () => {
  await page.keyboard.type('9555012345678');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.ticket .line').length === 1 && document.querySelector('.ticket .line .stepper > span').textContent === '2');
});
await step('unknown barcode says not found', async () => {
  await page.keyboard.type('000111');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#toast.show:has-text("找不到")');
});
await step('item with modifiers asks for them', async () => {
  await page.click('.tile:has-text("Teh Tarik")');
  await page.waitForSelector('.dialog:has-text("甜度")');
  await page.click('.dialog button:has-text("加入")');
  await page.waitForSelector('#toast.show:has-text("甜度")'); // required group not chosen
  await page.click('.dialog button:has-text("少糖")');
  await page.click('.dialog button:has-text("加蛋")');
  await shot('03-modifiers');
  await page.click('.dialog button:has-text("加入")');
  await page.waitForSelector('.ticket .line:has-text("Teh Tarik") .mods:has-text("少糖, 加蛋")');
});
await step('weighed item asks for weight', async () => {
  await page.click('.tile:has-text("白糖")');
  await page.waitForSelector('.dialog:has-text("重量")');
  await page.fill('.dialog input', '1.5');
  await page.click('.dialog button:has-text("确定")');
  await page.waitForSelector('.ticket .line:has-text("白糖")');
});
await step('dine-in adds service charge and SST', async () => {
  await page.click('.tile:has-text("Nasi Lemak")');
  await page.click('.ticket .seg button:has-text("堂食")');
  await page.waitForSelector('.sums:has-text("服务费 10%")');
  await page.waitForSelector('.sums:has-text("SST 6%")');
  await shot('01-register');
});
// Expected: Milo 2x15.90=31.80, Teh 2.50+1.50=4.00, Sugar 1.5x2.99=4.485->4.49 (round half), Nasi 6.00
// subtotal 46.29, service 4.63, SST 6% of 50.92 = 3.06 (3.0552), total 53.98
await step('totals are right', async () => {
  const text = await page.textContent('.sums');
  for (const want of ['46.29', '4.63', '3.06', 'RM 53.98']) if (!text.includes(want)) throw new Error(`missing ${want} in ${text}`);
});
await step('member discount applies', async () => {
  await page.click('.buttons button:has-text("折扣")');
  await page.check('.dialog input[type=checkbox]');
  await page.click('.dialog button:has-text("套用")');
  await page.waitForSelector('.sums:has-text("会员 10%")');
});
await step('pay cash with change and 5-sen rounding', async () => {
  await page.click('.buttons .pay');
  await page.waitForSelector('.dialog .paymethods');
  await shot('04-payment');
  await page.click('.dialog .quick button:has-text("RM 50")');
  await page.waitForFunction(() => !document.querySelector('.dialog .actions button.primary').disabled);
  await page.click('.dialog .actions button.primary');
  await page.waitForSelector('.dialog:has-text("找钱")');
  await shot('05-paid');
  await page.click('.dialog button:has-text("下一单")');
});
await step('sale and stock movements written', async () => {
  const r = await page.evaluate(() => {
    const keys = [...window.__store.keys()];
    const sale = keys.filter((k) => k.includes('/sales/')).map((k) => window.__store.get(k))[0];
    const moves = keys.filter((k) => k.includes('/movements/')).map((k) => window.__store.get(k));
    return { sale, moves };
  });
  if (!r.sale) throw new Error('no sale');
  const s = r.sale;
  // 46.29 - 4.63 (10%) = 41.66; service 4.17; SST 6% of 45.83 = 2.75; total 48.58; cash rounds to 48.60
  if (s.totalSen !== 4858) throw new Error('total ' + s.totalSen);
  if (s.roundingSen !== 2) throw new Error('rounding ' + s.roundingSen);
  if (s.changeSen !== 140) throw new Error('change ' + s.changeSen);
  if (!Number.isInteger(s.totalSen) || !Array.isArray(s.lines)) throw new Error('shape');
  const codes = r.moves.map((m) => `${m.barcode}:${m.quantityMilli}:${m.type}:${m.source}`).sort().join(',');
  if (codes !== '8888:1500:SALE:POS,9555012345678:2000:SALE:POS') throw new Error('moves ' + codes);
});
await step('ticket is empty for the next customer', async () => {
  await page.waitForSelector('.ticket .empty');
});

await step('table order: send to kitchen, shows busy', async () => {
  await page.click('.reg-bar button:has-text("桌位")');
  await page.click('.dialog .tables button:has-text("A1")');
  await page.click('.tile:has-text("Nasi Lemak")');
  await page.click('.buttons button:has-text("送厨房")');
  await page.waitForFunction(() => window.__printed > 0, null, { timeout: 3000 });
  await page.click('.buttons button:has-text("存单")');
  await page.click('.reg-bar button:has-text("桌位")');
  await page.waitForSelector('.dialog .tables button.busy:has-text("A1")');
  await shot('06-tables');
  await page.click('.dialog .tables button.busy:has-text("A1")');
  await page.waitForSelector('.ticket .line:has-text("Nasi Lemak ✓")');
});

await step('reports: summary', async () => {
  await page.goto(base + '/pos/#/reports/summary');
  await page.waitForSelector('.cards .stat');
  const text = await page.textContent('.cards');
  if (!text.includes('RM 41.66')) throw new Error('net sales not 41.66: ' + text);
  await shot('07-report-summary');
});
await step('reports: items', async () => {
  await page.goto(base + '/pos/#/reports/items');
  await page.waitForSelector('table.list td:has-text("Milo 1kg")');
  await shot('08-report-items');
});
await step('reports: payments shows cash net of change', async () => {
  await page.goto(base + '/pos/#/reports/payments');
  await page.waitForSelector('table.list td:has-text("现金")');
  const text = await page.textContent('table.list');
  if (!text.includes('48.60')) throw new Error(text);
});
await step('reports: receipt opens and voids', async () => {
  await page.goto(base + '/pos/#/reports/receipts');
  await page.click('table.list tr.click');
  await page.waitForSelector('.dialog .receipt');
  await shot('09-receipt');
  await page.click('.dialog button:has-text("作废这单")');
  await page.fill('.dialog input', '打错');
  await page.click('.dialog .actions button.danger');
  await page.waitForSelector('.confirm-text');
  await page.click('.backdrop:last-of-type .dialog button.danger');
  await page.waitForSelector('#toast.show:has-text("已作废")');
  const refunds = await page.evaluate(() => [...window.__store.keys()].filter((k) => k.includes('/movements/void-')).length);
  if (refunds !== 2) throw new Error('refund movements ' + refunds);
});
await step('items: list and add with generated barcode', async () => {
  await page.goto(base + '/pos/#/items/list');
  await page.waitForSelector('table.list td:has-text("Milo 1kg")');
  await shot('10-items');
  await page.click('button:has-text("新增商品")');
  await page.click('.dialog button:has-text("自动生成")');
  await page.fill('.dialog label:has-text("名称") input', 'Kopi O');
  await page.fill('.dialog label:has-text("售价") input', '2.20');
  await shot('11-add-item');
  await page.click('.dialog .actions button.primary');
  await page.waitForSelector('table.list td:has-text("Kopi O")');
});
await step('settings: features and taxes render', async () => {
  await page.goto(base + '/pos/#/settings/features');
  await page.waitForSelector('.modecard');
  await page.goto(base + '/pos/#/settings/taxes');
  await page.waitForSelector('input');
  await shot('12-settings-taxes');
});
await step('employees: roles with POS permissions', async () => {
  await page.goto(base + '/pos/#/employees');
  await page.waitForSelector('table.list td:has-text("Ali")');
  await shot('13-employees');
});

await step('customer earns and spends points', async () => {
  await page.goto(base + '/pos/#/pos');
  await page.waitForSelector('.tile');
  await page.click('.tile:has-text("Nasi Lemak")');
  await page.click('.ticket button:has-text("顾客")');
  await page.fill('.dialog input[type=search]', 'Ah Seng');
  await page.click('.dialog button:has-text("Ah Seng")');
  await page.waitForSelector('.ticket button:has-text("Ah Seng · 500")');
  await page.click('.buttons .pay');
  await page.click('.dialog .paymethods button:has-text("积分")');
  await page.click('.dialog button:has-text("加入")'); // pays what points can (RM 5.00 of 6.00)
  await page.click('.dialog .paymethods button:has-text("现金")');
  await page.click('.dialog .quick button:has-text("刚好")');
  await page.waitForFunction(() => !document.querySelector('.dialog .actions button.primary').disabled);
  await page.click('.dialog .actions button.primary');
  await page.waitForSelector('.dialog:has-text("找钱"), .dialog:has-text("已付款")');
  await page.click('.dialog button:has-text("下一单")');
  const c = await page.evaluate(() => window.__store.get('workspaces/w1/customers/cust1'));
  // RM 6.00 bill (retail, SST 6% on top = 6.36): 500 points (RM 5) used, 1 point earned on RM 1.36 paid in cash
  if (c.points !== 1 || c.visits !== 4) throw new Error(JSON.stringify(c));
});
await step('purchase orders and transfers lead to the warehouse system', async () => {
  for (const sub of ['purchase', 'transfers', 'suppliers']) {
    await page.goto(base + `/pos/#/inventory/${sub}`);
    await page.waitForSelector(`a[href="/warehouse/#/${sub}"]`);
  }
});
await step('stock levels: count + movements', async () => {
  await page.goto(base + '/pos/#/inventory/levels');
  await page.waitForSelector('table.list td:has-text("Milo 1kg")');
  await shot('15-levels');
  const text = await page.textContent('table.list');
  if (!text.includes('18 · ')) throw new Error('count not shown');
});
await step('access token: created once, stored as a hash', async () => {
  await page.goto(base + '/pos/#/integrations/tokens');
  await page.click('button:has-text("新增访问令牌")');
  await page.fill('.dialog input', 'Shopify');
  await page.click('.dialog button:has-text("建立")');
  await page.waitForSelector('.dialog:has-text("只会显示这一次")');
  const token = await page.inputValue('.dialog input');
  const keys = await page.evaluate(() => [...window.__store.keys()].filter((k) => k.startsWith('apiTokens/')));
  if (!token.startsWith('sck_') || keys.length !== 1 || keys[0].includes(token) || keys[0].length !== 'apiTokens/'.length + 64) throw new Error(token + ' ' + keys);
  await page.click('.dialog button:has-text("完成")');
  await page.goto(base + '/pos/#/integrations/api');
  await page.waitForSelector('pre');
  await shot('16-api');
});
await step('add employee', async () => {
  await page.goto(base + '/pos/#/employees');
  await page.click('button:has-text("新增员工")');
  await page.fill('.dialog label:has-text("名称") input', 'Mei Ling');
  await page.fill('.dialog input[type=email]', 'mei@x.com');
  await page.click('.dialog button:has-text("建立")');
  await page.waitForSelector('.dialog:has-text("已新增员工")');
  const ok = await page.evaluate(() => [...window.__store.entries()].some(([k, v]) => k.startsWith('userIndex/staff') && v.workspaceId === 'w1'));
  if (!ok) throw new Error('userIndex not written');
  await page.click('.dialog button:has-text("确定")');
});
await step('customers page', async () => {
  await page.goto(base + '/pos/#/customers');
  await page.waitForSelector('table.list td:has-text("Ah Seng")');
});

await step('member card and RFID tag work like a scan', async () => {
  await page.goto(base + '/pos/#/pos');
  await page.waitForSelector('.tile');
  await page.click('.tiles');
  await page.keyboard.type('E2801160600002054D2C5A1B'); // a UHF tag typed by a reader in keyboard mode
  await page.keyboard.press('Enter');
  await page.waitForSelector('.ticket .line:has-text("Milo 1kg")');
  await page.keyboard.type('04:a2:b3:c4:d5:e6:f7'); // an NFC member card, as Web NFC writes it
  await page.keyboard.press('Enter');
  await page.waitForSelector('.ticket button:has-text("Ah Seng")');
  await page.click('.buttons button.danger');
});
await step('points cannot be spent twice: picking the customer again reads the new balance', async () => {
  await page.goto(base + '/pos/#/pos');
  await page.waitForSelector('.tile');
  await page.click('.tile:has-text("Nasi Lemak")');
  await page.click('.ticket button:has-text("顾客")');
  await page.fill('.dialog input[type=search]', 'Ah Seng');
  await page.click('.dialog button:has-text("Ah Seng")');
  await page.waitForSelector('.ticket button:has-text("Ah Seng · 1 ")');
  await page.click('.buttons .pay');
  const methods = await page.textContent('.dialog .paymethods');
  if (methods.includes('积分')) throw new Error('points offered with 1 point: ' + methods);
  await page.keyboard.press('Escape');
  await page.click('.buttons button.danger');
});
await step('the next scan after a sale closes the change box and is not lost', async () => {
  await page.click('.tile:has-text("Nasi Lemak")');
  await page.click('.buttons .pay');
  await page.click('.dialog .quick button:has-text("刚好")');
  await page.waitForFunction(() => !document.querySelector('.dialog .actions button.primary').disabled);
  await page.click('.dialog .actions button.primary');
  await page.waitForSelector('[data-after-sale]', { state: 'attached' });
  await page.keyboard.type('9555012345678');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.ticket .line:has-text("Milo 1kg")');
  if (await page.$('[data-after-sale]')) throw new Error('change box still open');
  await page.click('.buttons button.danger');
});

await step('installable: manifest and service worker', async () => {
  const m = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  if (m.display !== 'standalone' || m.icons.length < 2) throw new Error(JSON.stringify(m));
  const sw = await page.evaluate(async () => (await fetch('/sw.js')).text());
  if (!sw.includes("addEventListener('fetch'")) throw new Error('no service worker script');
});

await step('phone width has no sideways scroll', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(base + '/pos/#/reports/summary');
  await page.waitForSelector('.cards');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (wide) throw new Error('horizontal scroll at 390px');
});


process.exit(await done() ? 1 : 0);
