// The warehouse system end to end: a purchase order approved, ordered and
// received with damage; stock and its ledger; a transfer dispatched and
// received short; an adjustment; reorder suggestions; count differences;
// places; the audit log; and the phone layout.
import { start } from './harness.mjs';

const W = 'workspaces/w1/';
const { page, base, step, shot, store, docs, done } = await start({
  seedPatch: { del: [`${W}products/7777`] },
});
const scan = async (code) => { await page.keyboard.type(code); await page.keyboard.press('Enter'); };
const movements = () => docs(`${W}movements/`);
const milo = '9555012345678';

await page.goto(base + '/warehouse/');
await step('home: jobs as big buttons', async () => {
  await page.waitForSelector('.wh-tile:has-text("收货")', { timeout: 8000 });
  await page.waitForSelector('.cards .stat');
  await shot('wh-01-home');
});

await step('purchase order: owner raises and approves in one step', async () => {
  await page.goto(base + '/warehouse/#/purchase/new');
  await page.waitForSelector('.wh-head');
  await page.selectOption('.wh-head select >> nth=0', 'sup1');
  await page.click('.wh-scan input.scan');
  await scan(milo);
  await page.waitForSelector('.wh-line:has-text("Milo 1kg")');
  await page.fill('.wh-line .wh-po-fields input >> nth=0', '10');
  await page.press('.wh-line .wh-po-fields input >> nth=0', 'Tab');
  await page.fill('.wh-line .wh-po-fields input >> nth=1', '14.00');
  await page.press('.wh-line .wh-po-fields input >> nth=1', 'Tab');
  await shot('wh-02-po-new');
  await page.click('.wh-bar button.primary');
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/purchaseOrders/') && v.status === 'APPROVED'));
  const po = (await docs(`${W}purchaseOrders/`))[0];
  if (po.lines[0].qtyMilli !== 10000 || po.lines[0].costSen !== 1400 || po.approvedByName !== 'Jeffrey') throw new Error(JSON.stringify(po));
});

await step('purchase order: marked ordered, copy for WhatsApp', async () => {
  await page.waitForSelector('.wh-bar button:has-text("确认下单"), .wh-bar button:has-text("下单")');
  await page.click('.wh-bar button.primary');
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/purchaseOrders/') && v.status === 'ORDERED'));
});

await step('receive: scan 8, 2 damaged, order complete', async () => {
  await page.goto(base + '/warehouse/#/receive');
  await page.click('.wh-card:has-text("PO-")');
  await page.waitForSelector('.wh-line:has-text("Milo 1kg")');
  await page.fill('.wh-head input', 'DO-5521');
  await page.click('.wh-scan input.scan');
  for (let i = 0; i < 8; i++) await scan(milo);
  await page.waitForSelector('.wh-line .q:text-is("8")');
  await page.click('.wh-line');
  await page.fill('.dialog .grid2 input >> nth=0', '2');
  await page.click('.dialog button.primary');
  await page.waitForSelector('.wh-line:has-text("刚好")');
  await shot('wh-03-receiving');
  await page.click('.wh-bar button.primary');
  await page.click('.dialog button:has-text("完成收货")');
  await page.waitForFunction(() => [...window.__store].some(([k]) => k.includes('/receivings/')));
  const rec = (await docs(`${W}receivings/`))[0];
  if (rec.lines[0].receivedMilli !== 8000 || rec.lines[0].damagedMilli !== 2000 || rec.deliveryNo !== 'DO-5521') throw new Error(JSON.stringify(rec));
  const po = (await docs(`${W}purchaseOrders/`))[0];
  if (po.status !== 'RECEIVED' || po.lines[0].receivedMilli !== 8000) throw new Error(JSON.stringify(po));
  const m = (await movements()).filter((x) => x.type === 'RECEIVE');
  if (m.length !== 1 || m[0].quantityMilli !== 8000 || m[0].source !== 'WAREHOUSE') throw new Error(JSON.stringify(m));
  const p = await store(`${W}products/${milo}`);
  if (p.costSen !== 1400) throw new Error('cost not updated: ' + p.costSen);
});

await step('stock: count 18 + 8 received = 26, and why', async () => {
  await page.goto(base + `/warehouse/#/stock/${milo}`);
  await page.waitForSelector('.wh-ledger');
  const text = await page.$eval('.wh-ledger', (el) => el.innerText);
  if (!/18/.test(text) || !/\+8/.test(text) || !/26/.test(text)) throw new Error(text);
  await shot('wh-04-ledger');
});

await step('transfer: dispatch 5 to Ipoh — off the warehouse, in transit', async () => {
  await page.goto(base + '/warehouse/#/transfers/new');
  await page.waitForSelector('.wh-head select');
  await page.selectOption('.wh-head select >> nth=1', 'ipoh');
  await page.click('.wh-scan input.scan');
  for (let i = 0; i < 5; i++) await scan(milo);
  await page.waitForSelector('.wh-line input.q');
  if (await page.inputValue('.wh-line input.q') !== '5') throw new Error('qty');
  await page.click('.wh-bar button.primary');
  await page.click('.dialog button:has-text("发货")');
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/transfers/') && v.status === 'SENT'));
  const out = (await movements()).filter((x) => x.type === 'TRANSFER_OUT');
  if (out.length !== 1 || out[0].quantityMilli !== 5000 || out[0].branchId !== '') throw new Error(JSON.stringify(out));
  await page.goto(base + '/warehouse/#/stock');
  await page.selectOption('.page-head + .wh-scan + .row select', 'ipoh');
  await page.waitForSelector('table.wh-stock td:has-text("Milo 1kg")');
  const row = await page.$eval('table.wh-stock tbody tr', (el) => el.innerText);
  if (!/\b5\b/.test(row)) throw new Error('in transit not shown: ' + row);
});

await step('transfer: Ipoh receives 4 of 5 — difference kept', async () => {
  await page.goto(base + '/warehouse/#/transfers');
  await page.click('.wh-card:has-text("TR-")');
  await page.waitForSelector('.wh-line');
  await page.click('.wh-scan input.scan');
  for (let i = 0; i < 4; i++) await scan(milo);
  await page.waitForSelector('.wh-line:has-text("少 1")');
  await shot('wh-05-transfer-receive');
  await page.click('.wh-bar button.primary');
  await page.click('.dialog button.primary');
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/transfers/') && v.status === 'RECEIVED'));
  const tr = (await docs(`${W}transfers/`))[0];
  if (!tr.hasVariance || tr.lines[0].receivedMilli !== 4000 || tr.lines[0].diffMilli !== -1000) throw new Error(JSON.stringify(tr));
  const tin = (await movements()).filter((x) => x.type === 'TRANSFER_IN');
  if (tin.length !== 1 || tin[0].quantityMilli !== 4000 || tin[0].branchId !== 'ipoh') throw new Error(JSON.stringify(tin));
});

await step('adjust: 1 damaged, with reason, audited', async () => {
  await page.goto(base + '/warehouse/#/adjust');
  await page.click('.wh-scan input.scan');
  await scan(milo);
  await page.waitForSelector('.wh-onhand strong:has-text("21")');
  await page.fill('input.big-num', '1');
  await page.click('.wh-chips button:has-text("损坏")');
  await page.click('button:has-text("保存调整")');
  await page.waitForSelector('.wh-onhand strong:has-text("20")');
  const adj = (await movements()).filter((x) => x.kind === 'ADJUSTMENT');
  if (adj.length !== 1 || adj[0].type !== 'WRITE_OFF' || adj[0].reason !== 'DAMAGED') throw new Error(JSON.stringify(adj));
  const audits = await docs(`${W}auditLog/`);
  if (!audits.some((a) => a.entity === 'Adjustment' && a.oldValue === '21' && a.newValue === '20')) throw new Error(JSON.stringify(audits.map((a) => [a.entity, a.oldValue, a.newValue])));
  await shot('wh-06-adjust');
});

await step('adjust: set to actual counts the difference', async () => {
  await page.click('.seg button:has-text("改成实际数量")');
  await page.fill('input.big-num', '17');
  await page.click('.wh-chips button:has-text("丢失")');
  await page.click('button:has-text("保存调整")');
  await page.waitForSelector('.wh-onhand strong:has-text("17")');
});

await step('reorder: point 30, max 100 → suggests 83, makes a draft', async () => {
  await page.goto(base + `/warehouse/#/stock/${milo}`);
  await page.waitForSelector('h2:has-text("补货设定")');
  const card = page.locator('section.card:has(h2:has-text("补货设定"))');
  await card.locator('input >> nth=0').fill('30');
  await card.locator('input >> nth=1').fill('100');
  await card.locator('select').selectOption('sup1');
  await card.locator('button.primary').click();
  await page.waitForFunction((k) => window.__store.get(k).maxStockMilli === 100000, `${W}products/${milo}`);
  await page.goto(base + '/warehouse/#/purchase/reorder');
  await page.waitForSelector('section.card:has-text("Nestle")');
  const v = await page.inputValue('section.card input');
  if (v !== '83') throw new Error('suggested ' + v);
  await shot('wh-07-reorder');
  await page.click('.wh-bar button.primary');
  await page.waitForFunction(() => [...window.__store].filter(([k, v]) => k.includes('/purchaseOrders/') && v.status === 'DRAFT').length === 1);
  const draft = (await docs(`${W}purchaseOrders/`)).find((p) => p.status === 'DRAFT');
  if (draft.lines[0].qtyMilli !== 83000 || draft.supplierId !== 'sup1') throw new Error(JSON.stringify(draft));
});

await step('count differences: the count is listed and opens', async () => {
  await page.goto(base + '/warehouse/#/variance');
  await page.waitForSelector('table.list tr.click');
  await page.click('table.list tr.click');
  await page.waitForSelector('.cards .stat');
});

await step('online purchase: a pasted Pinduoduo order becomes an ordered purchase order', async () => {
  await page.goto(base + '/warehouse/#/online');
  await page.waitForSelector('textarea');
  await page.click('.wh-chips button:has-text("拼多多")');
  await page.fill('textarea', ['拼多多', '订单编号：PDD240915001', 'Milo 1kg 麦芽饮料 大包装', '¥10.00', 'x5',
    '一次性塑料袋 50个装', '规格：中号', '¥5.00', 'x2', '运费 ¥6.00', '实付 ¥66.00', '快递单号：YT1234567890'].join('\n'));
  await page.click('button:has-text("读取订单")');
  await page.waitForSelector('.wh-online-line:has-text("Milo 1kg") .pill:has-text("系统猜的")');
  // The bag is not a product yet: make it from the order line.
  await page.click('.wh-online-line:has-text("塑料袋") button:has-text("新增商品")');
  await page.waitForSelector('.dialog input');
  await page.click('.dialog .actions button.primary');
  await page.waitForFunction(() => !document.querySelector('.wh-online-total')?.innerText.includes('还没配对'));
  await shot('wh-online-1-check');
  await page.click('.wh-bar button.primary:has-text("保存采购单")');
  await page.waitForFunction(() => [...window.__store].some(([k, v]) => k.includes('/purchaseOrders/') && v.source === 'ONLINE'));
  const po = (await docs(`${W}purchaseOrders/`)).find((x) => x.source === 'ONLINE');
  const milo = po.lines.find((l) => l.name === 'Milo 1kg');
  const bag = po.lines.find((l) => l.sourceTitle.includes('塑料袋'));
  // ¥ at 0.65: goods RM 32.50 + 6.50, shipping RM 3.90 shared 3.25 / 0.65.
  if (po.status !== 'ORDERED' || po.onlinePlatform !== 'pdd' || po.onlineOrderNo !== 'PDD240915001' || po.trackingNo !== 'YT1234567890'
    || po.currency !== 'CNY' || po.shippingSen !== 390 || milo.qtyMilli !== 5000 || milo.costSen !== 715 || bag.qtyMilli !== 2000 || bag.costSen !== 358) throw new Error(JSON.stringify(po));
  const made = await store(`${W}products/${bag.barcode}`);
  if (!made || !made.name.includes('塑料袋') || made.costSen !== 358) throw new Error(JSON.stringify(made));
});

await step('online purchase: the same order pasted again is refused', async () => {
  await page.goto(base + '/warehouse/#/online');
  await page.waitForSelector('textarea');
  await page.waitForTimeout(400);
  await page.fill('textarea', '拼多多\n订单编号：PDD240915001\nMilo 1kg\n¥10.00\nx5');
  await page.click('button:has-text("读取订单")');
  await page.waitForSelector('text=这张订单已经记过了');
});

await step('online purchase: scanning the parcel label opens it for receiving', async () => {
  await page.goto(base + '/warehouse/#/receive');
  await page.waitForSelector('.wh-card:has-text("YT1234567890")');
  await page.click('input.scan');
  await scan('YT1234567890');
  await page.waitForFunction(() => /#\/receive\/.+/.test(location.hash) && !location.hash.endsWith('/free'));
  await page.waitForSelector('text=Milo 1kg');
});

await step('places: add a warehouse', async () => {
  await page.goto(base + '/warehouse/#/places');
  await page.click('button:has-text("新增地点")');
  await page.fill('.dialog input', 'Gudang Pusat');
  await page.click('.dialog button.primary');
  await page.waitForFunction((k) => (window.__store.get(k).branches || []).some((b) => b.id === 'gudang-pusat' && b.kind === 'WAREHOUSE'), `${W}meta/config`);
  await shot('wh-08-places');
});

await step('audit log lists what happened', async () => {
  await page.goto(base + '/warehouse/#/audit');
  await page.waitForSelector('table.list td:has-text("Receiving")');
  await page.waitForSelector('table.list td:has-text("Transfer")');
});

await step('guide page opens', async () => {
  await page.goto(base + '/warehouse/#/guide');
  await page.waitForSelector('.guide');
});

await step('the POS lists the warehouse system', async () => {
  await page.goto(base + '/pos/#/inventory/purchase');
  await page.waitForSelector('a[href="/warehouse/#/purchase"]');
});

await step('phone: bottom bar, big buttons, no sideways scroll', async () => {
  await page.setViewportSize({ width: 390, height: 820 });
  await page.goto(base + '/warehouse/#/home');
  await page.waitForSelector('.wh-bottom a');
  if (!(await page.isVisible('.wh-bottom'))) throw new Error('no bottom bar');
  for (const route of ['home', 'receive', 'transfers', 'stock', `stock/${milo}`, 'purchase', 'adjust']) {
    await page.goto(base + `/warehouse/#/${route}`);
    await page.waitForTimeout(400);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (wide) throw new Error(`sideways scroll on ${route}`);
  }
  await page.goto(base + '/warehouse/#/home');
  await page.waitForTimeout(300);
  await shot('wh-09-phone');
});

let failed = await done();

// A buyer without approval rights: the screen offers "send for approval",
// never "approve" (and the rules refuse it too: rules-test/pos-test.mjs).
{
  const buyer = await start({
    seedPatch: {
      merge: { [`${W}users/u1`]: { roleId: 'buyer' } },
      set: { [`${W}roles/buyer`]: { name: 'Buyer', permissions: ['WH_PURCHASE', 'RECORD_STOCK_MOVEMENTS', 'VIEW_ALL_HISTORY'] } },
    },
  });
  await buyer.page.goto(buyer.base + '/warehouse/#/purchase/new');
  await buyer.step('a buyer without approval rights can only submit', async () => {
    await buyer.page.waitForSelector('.wh-bar button.primary:has-text("提交审批")');
    if (await buyer.page.$('.wh-bar button:has-text("批准")')) throw new Error('approve offered');
  });
  await buyer.step('a buyer does not see the places or audit pages', async () => {
    const menu = await buyer.page.$eval('.side nav', (el) => el.innerText);
    if (menu.includes('仓库和分店') || menu.includes('操作记录')) throw new Error(menu);
  });
  failed += await buyer.done();
}
process.exit(failed ? 1 : 0);
