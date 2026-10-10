// Shifts, price labels, the e-invoice, PDPA and plans, in a real browser.
import { start } from './harness.mjs';

const DAY = 86_400_000;
const now = Date.now();
const { page, base, step, shot, store, docs, done } = await start({
  seedPatch: {
    merge: { 'workspaces/w1/pos/settings': { requireShift: true, tin: 'C1234567890', msic: '47111' } },
    set: {
      // Asked to be removed 100 days ago: due for erasing, with a receipt in their name.
      'workspaces/w1/customers/gone': { name: 'Mr Gone', phone: '0199999999', status: 'UNSUBSCRIBED', unsubscribedAt: now - 100 * DAY, purgeAfter: now - 10 * DAY },
      'workspaces/w1/sales/old-gone': { receiptNo: 'OLD-1', status: 'COMPLETED', createdAt: now - 120 * DAY, totalSen: 1000, customerId: 'gone', customerName: 'Mr Gone', customerPhone: '0199999999', cashierUid: 'u1', branchId: '', lines: [], payments: [] },
    },
  },
});

await page.goto(base + '/pos/#/pos');
await page.waitForSelector('.tile');

await step('shift required: paying asks to open a shift first', async () => {
  await page.click('.tile:has-text("Milo 1kg")');
  await page.click('.buttons .pay');
  await page.waitForSelector('.dialog h2:has-text("开班")');
  await page.fill('.dialog input.bigsum', '200');
  await page.click('.dialog .actions button.primary');
  await page.waitForSelector('.dialog .paymethods');
  const shift = (await docs('workspaces/w1/shifts/'))[0];
  if (!shift || shift.floatSen !== 20000 || shift.status !== 'OPEN' || shift.operatorId !== 'u1') throw new Error(JSON.stringify(shift));
});

await step('a cash sale carries the shift id', async () => {
  await page.click('.dialog .paymethods button:has-text("现金")');
  await page.click('.dialog .quick button:has-text("RM 50")');
  await page.click('.dialog .actions button.primary');
  await page.waitForSelector('.dialog:has-text("下一单")');
  await page.click('.dialog button:has-text("下一单")');
  const shift = (await docs('workspaces/w1/shifts/'))[0];
  const sale = (await docs('workspaces/w1/sales/')).find((s) => s.shiftId);
  if (!sale || sale.shiftId !== shift.__id) throw new Error('no shiftId on the sale');
});

await step('closing the shift: expected cash, short, slip printed', async () => {
  await page.click('.shift-btn');
  await page.waitForSelector('.dialog .shift-sum');
  const sumText = await page.$eval('.dialog .shift-sum', (el) => el.innerText);
  // Float 200 + the sale's cash (18.38 rounded to 18.40 with 10% service and 6% SST... whatever it is) -- read it back.
  const expected = /应有现金\s*RM ([\d.]+)/.exec(sumText)?.[1];
  if (!expected || Number(expected) <= 200) throw new Error(sumText);
  await page.fill('.dialog input.bigsum', String((Number(expected) - 1).toFixed(2)));
  const diff = await page.$eval('.dialog .bigsum:not(input)', (el) => el.innerText);
  if (!/短少 RM 1\.00/.test(diff)) throw new Error(diff);
  await page.click('.dialog .actions button.primary:has-text("交班")');
  await page.click('.dialog .actions button.primary:has-text("交班") >> nth=-1');
  await page.waitForFunction(() => !document.querySelector('.shift-btn.open'));
  const shift = (await docs('workspaces/w1/shifts/'))[0];
  if (shift.status !== 'CLOSED' || shift.shortOverSen !== -100 || shift.summary.salesCount !== 1) throw new Error(JSON.stringify(shift));
  // printView prints on the next animation frame.
  await page.waitForFunction(() => window.__printed > 0, null, { timeout: 5000 }).catch(() => { throw new Error('slip not printed'); });
  await shot('pro-1-shift');
});

await step('shift report lists it', async () => {
  await page.goto(base + '/pos/#/reports/shifts');
  await page.waitForSelector('table.list td:has-text("-1.00")');
});

await step('price labels: pick items, print', async () => {
  await page.goto(base + '/pos/#/items/list');
  await page.evaluate(() => { window.open = () => { window.__labels = (window.__labels || 0) + 1; return { document: { write(x) { window.__labelHtml = x; }, close() {} } }; }; });
  await page.click('button:has-text("价格标签")');
  await page.click('.dialog label.check:has-text("Milo 1kg") input');
  await page.selectOption('.dialog select >> nth=0', '30x20');
  await page.click('.dialog .actions button.primary');
  const html = await page.evaluate(() => window.__labelHtml || '');
  if (!/size:30mm 20mm/.test(html) || (html.match(/<img /g) || []).length !== 1) throw new Error(html.slice(0, 200));
});

await step('e-invoice: the month\'s receipts, JSON and CSV downloads', async () => {
  await page.goto(base + '/pos/#/reports/einvoice');
  const month = new Date().toISOString().slice(0, 7);
  await page.fill('input[type=month]', month);
  await page.dispatchEvent('input[type=month]', 'change');
  await page.waitForSelector('button:has-text("下载 JSON")');
  const [json] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("下载 JSON")')]);
  const body = JSON.parse(await (await import('node:fs')).promises.readFile(await json.path(), 'utf8'));
  const inv = body.Invoice[0];
  if (inv.AccountingCustomerParty[0].Party[0].PartyIdentification[0].ID[0]._ !== 'EI00000000010') throw new Error('buyer');
  if (inv.AccountingSupplierParty[0].Party[0].PartyIdentification[0].ID[0]._ !== 'C1234567890') throw new Error('seller TIN');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("下载 CSV")')]);
  if (!/\.csv$/.test(csv.suggestedFilename())) throw new Error(csv.suggestedFilename());
  await shot('pro-2-einvoice');
});

await step('MyInvois assistant: a question goes with the conversation and the language; the answer shows with LHDN links only', async () => {
  let asked = null;
  await page.route(/\/app\/myinvois-ask$/, async (route) => {
    asked = { auth: route.request().headers().authorization, body: route.request().postDataJSON() };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
      answer: '需要。按年营业额分阶段实施。', sources: [{ url: 'https://www.hasil.gov.my/en/e-invoice/', title: 'e-Invoice' }, { url: 'https://evil.example/x', title: 'Not LHDN' }],
    }) });
  });
  await page.goto(base + '/pos/#/reports/einvoice');
  await page.waitForSelector('[data-card="myinvois"]');
  await page.click('[data-card="myinvois"] .mi-chips button >> nth=0');
  await page.waitForSelector('.mi-msg.assistant:has-text("分阶段")');
  if (asked.auth !== 'Bearer test-id-token' || asked.body.lang !== 'zh' || asked.body.messages.at(-1).content !== '我要开电子发票吗？') throw new Error(JSON.stringify(asked));
  const links = await page.$$eval('.mi-msg.assistant .mi-src a', (as) => as.map((a) => a.href));
  if (links.length !== 1 || !links[0].startsWith('https://www.hasil.gov.my/')) throw new Error(links.join(' '));
  // A follow-up carries the whole conversation.
  await page.fill('textarea[data-act="mi-input"]', '整合发票几时交？');
  await page.click('button[data-act="mi-ask"]');
  await page.waitForSelector('.mi-msg.assistant >> nth=1');
  if (asked.body.messages.length !== 3 || asked.body.messages[1].role !== 'assistant') throw new Error(JSON.stringify(asked.body.messages));
  await shot('pro-2b-myinvois');
  await page.unroute(/\/app\/myinvois-ask$/);
});

await step('PDPA: a customer past 90 days is erased, their receipt kept without the name', async () => {
  await page.goto(base + '/pos/#/customers');
  await page.waitForSelector('table.list td:has-text("Ah Seng")');
  await page.waitForFunction(() => !window.__store.has('workspaces/w1/customers/gone'));
  const sale = await store('workspaces/w1/sales/old-gone');
  if (sale.customerName !== '' || sale.customerPhone !== '' || sale.totalSen !== 1000 || !sale.customerErased) throw new Error(JSON.stringify(sale));
  const audit = (await docs('workspaces/w1/auditLog/')).find((a) => a.entityId === 'gone');
  if (!audit) throw new Error('no audit entry');
});

await step('PDPA: remove a customer -> hidden and masked, then undo', async () => {
  await page.click('table.list td:has-text("Ah Seng")');
  await page.click('.dialog button:has-text("删除顾客资料")');
  await page.click('.dialog .actions button.danger:has-text("删除顾客资料") >> nth=-1');
  await page.waitForSelector('table.list td:has-text("A*** (••••6789)")');
  const c = await store('workspaces/w1/customers/cust1');
  if (c.status !== 'UNSUBSCRIBED' || !(c.purgeAfter > Date.now() + 89 * 86_400_000)) throw new Error(JSON.stringify(c));
  await shot('pro-3-pdpa');
  await page.click('table.list td:has-text("A***")');
  await page.click('.dialog button:has-text("恢复")');
  await page.waitForSelector('table.list td:has-text("Ah Seng")');
});

await step('customers export to Excel', async () => {
  const [x] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("导出 Excel")')]);
  const bytes = await (await import('node:fs')).promises.readFile(await x.path());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || !/\.xlsx$/.test(x.suggestedFilename())) throw new Error('not an xlsx');
});

await step('SuXin Every Data: today, stock and the warehouse for a company with all three', async () => {
  await page.goto(base + '/data/');
  await page.waitForSelector('.cnt-top .brandmark:has-text("SuXin Every Data")');
  await page.waitForSelector('.dash-part .stat:has-text("今天销售")');
  await page.waitForSelector('.dash-part .stat:has-text("低库存")');
  await page.waitForSelector('.dash-part .stat:has-text("待收货的采购单")');
  await shot('pro-4-cloud');
});

const firstDone = await done();

// ---------------------------------------------------------------- plans
const plan = await start({ seedPatch: { set: { 'licences/w1': { plan: 'APP_ONLY', status: 'ACTIVE', expiresAt: 0, modules: { app: true, pos: false, warehouse: false, api: false } } } } });
await plan.step('a plan without the POS: the till address opens the back office instead', async () => {
  await plan.page.goto(plan.base + '/pos/#/pos');
  await plan.page.waitForFunction(() => !location.hash.startsWith('#/pos'));
  if (await plan.page.$('.tile, .market, .scanwrap')) throw new Error('the till was shown');
});
await plan.step('a plan without the POS: its menus are hidden, the rest stay', async () => {
  await plan.page.goto(plan.base + '/pos/#/items/list');
  await plan.page.waitForSelector('.side nav, nav');
  const menu = await plan.page.$$eval('nav a, nav button', (els) => els.map((e) => e.textContent.trim()).join('|'));
  for (const hidden of ['收银', '报表', '顾客', '整合']) if (menu.split('|').some((x) => x === hidden)) throw new Error(`${hidden} still shown: ${menu}`);
  for (const shown of ['商品', '员工', '设置']) if (!menu.includes(shown)) throw new Error(`${shown} missing: ${menu}`);
  if (await plan.page.$('a.side-link[href="/warehouse/"]')) throw new Error('warehouse link shown');
});
await plan.step('Add more: what is on, what can be added, what is coming', async () => {
  await plan.page.goto(plan.base + '/pos/#/settings/addons');
  await plan.page.waitForSelector('.addon');
  const text = await plan.page.$eval('main', (el) => el.innerText);
  if (!/SuXin Barcode Scan\s*已开启/.test(text) || !/SuXin POS\s*可以增加/.test(text) || !/SuXin Accounting\s*即将推出/.test(text)) throw new Error(text.slice(0, 600));
  if (/module|API scope|feature flag/i.test(text)) throw new Error('technical words shown to the customer');
});
await plan.step('SuXin Every Data follows the plan: stock shown, no sales, no warehouse', async () => {
  await plan.page.goto(plan.base + '/data/');
  await plan.page.waitForSelector('.dash-part .stat:has-text("低库存")');
  const text = await plan.page.$eval('main', (el) => el.innerText);
  if (/今天销售|待收货的采购单/.test(text)) throw new Error(text.slice(0, 400));
  if (!/可以增加：[\s\S]*SuXin WMS/.test(text)) throw new Error('no add-more line: ' + text.slice(0, 400));
});
await plan.step('a plan without the warehouse: the warehouse says so', async () => {
  await plan.page.goto(plan.base + '/warehouse/#/receive');
  await plan.page.waitForSelector('.card:has-text("你的配套没有仓库系统")');
});
const planDone = await plan.done();

const tills = await start({
  seedPatch: {
    set: {
      'licences/w1': { plan: 'POS_ONLY', status: 'ACTIVE', expiresAt: 0, tills: 2, modules: { app: false, pos: true, warehouse: true, api: false } },
      'workspaces/w1/tills/t-a': { name: 'Counter A', createdAt: 1 },
      'workspaces/w1/tills/t-b': { name: 'Counter B', createdAt: 2 },
    },
  },
});
await tills.step('POS pack with both tills taken: a third computer is told', async () => {
  await tills.page.goto(tills.base + '/pos/#/pos');
  await tills.page.waitForSelector('.card:has-text("只可以用 2 台收银机")');
});
await tills.step('the owner frees a place under Settings -> This device', async () => {
  await tills.page.goto(tills.base + '/pos/#/settings/device');
  await tills.page.waitForSelector('.card h2:has-text("收银机")');
  await tills.page.click('.till-row:has-text("Counter A") button:has-text("移除")');
  await tills.page.goto(tills.base + '/pos/#/pos');
  await tills.page.waitForSelector('.tile');
  await tills.page.waitForTimeout(500);
  if (await tills.page.$('.card:has-text("只可以用 2 台收银机")')) throw new Error('still locked');
});
const tillsDone = await tills.done();

process.exit(firstDone || planDone || tillsDone ? 1 : 0);
