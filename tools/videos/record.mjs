/**
 * Films the guide videos in web/videos/: the till and the warehouse system
 * driven in a real browser (the same harness as tests/ui), in the pretend
 * shop from world.mjs, with a visible pointer and captions in Chinese with
 * a line of English. The phone app's videos are illustrated step cards --
 * the Android app cannot be filmed here.
 *
 *   node tools/videos/record.mjs              every video
 *   node tools/videos/record.mjs pos-3-retail just that one
 */
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { item, world } from './world.mjs';
import { APP_FILMS, slidesHtml } from './app-slides.mjs';
import { OUT, film } from './studio.mjs';

// ---------------------------------------------------------------- the till

await film('pos-1-start', world({ mode: '' }), async (page, x, base) => {
  await page.waitForSelector('.modecard');
  await x.title('开始使用收银系统', 'JEXO POS · 第一步', 'Getting started');
  await x.caption('第一次打开，先选你的店是哪一种', 'First time: choose what kind of shop you are');
  await x.point('.modecard[data-mode="FNB"]'); await x.point('.modecard[data-mode="SUPERMARKET"]'); await x.point('.modecard[data-mode="RETAIL"]');
  await x.caption('超市：一直扫码，结账快', 'Supermarket: scan after scan, fast checkout', 1800);
  await x.click('.modecard[data-mode="SUPERMARKET"]', 1200);
  await x.caption('收银画面马上照这个模式排好', 'The till is laid out for it at once');
  await x.go(base, '/pos/#/settings/taxes', 1200);
  await x.caption('设置 → 税：大部分商品收 SST 6%，勾「默认」', 'Settings → Taxes: SST 6% as the default');
  await x.point('.card label.check');
  await x.caption('没注册 SST 的店：不要加任何税', 'Not SST-registered? Add no tax at all', 2000);
  await x.go(base, '/pos/#/settings/receipt', 1200);
  await x.caption('收据：店名、地址、电话、SST 号码', 'Receipt: shop name, address, phone, SST number');
  await x.go(base, '/pos/#/settings/features', 1200);
  await x.caption('以后随时可以在「设置 → 功能」换模式', 'Change the mode any time under Settings → Features', 2600);
});

await film('pos-2-items', world({ mode: 'RETAIL' }), async (page, x, base) => {
  await x.go(base, '/pos/#/items/list', 1200);
  await x.title('商品和照片', 'JEXO POS · 商品', 'Items and photos');
  await x.caption('商品清单：照片、售价、成本、税', 'Item list: photo, price, cost and tax');
  await x.click('button:has-text("新增商品")', 900);
  await x.click('.dialog button:has-text("生成")', 500);
  await x.caption('没有条码的商品，按「生成」自动给一个', 'No barcode? Press Generate', 1800);
  await x.type('.dialog .row .grow input >> nth=1', 'Kuih Lapis 千层糕');
  await x.type('.dialog .grid2 input >> nth=0', '1.50');
  await x.type('.dialog .grid2 input >> nth=1', '0.80');
  await page.locator('.dialog .grid2 select').first().selectOption('demo-food');
  await x.caption('按「选择照片」用手机或电脑拍照上传', 'Choose photo: take or upload a picture', 2000);
  await x.point('.dialog button:has-text("选择照片")');
  await x.click('.dialog .actions button.primary', 1000);
  await x.caption('保存后，收银画面马上出现', 'Saved — it is on the till at once');
  await x.click('button:has-text("批量设定税")', 900);
  await x.caption('米、糖、鸡蛋不收税：批量设成免税', 'Rice, sugar, eggs: set tax-free in one go', 2400);
  await page.locator('.dialog select').selectOption('demo-grocery');
  await x.click('.dialog button:has-text("全选")', 900);
  await x.click('.dialog button:has-text("取消")', 600);
  await x.go(base, '/pos/#/pos', 1400);
  await x.caption('照片会显示在收银画面', 'Photos show on the till', 2600);
});

await film('pos-3-retail', world({ mode: 'RETAIL' }), async (page, x) => {
  await page.waitForSelector('.tile');
  await x.title('店面零售收银', 'JEXO POS · 店面零售', 'Retail shop checkout');
  await x.caption('点商品图片，或用扫码枪扫', 'Tap a picture, or scan with the scanner');
  await x.click('.tile:has-text("Malt")', 500);
  await x.click('.tile:has-text("Roti 面包")', 500);
  await x.click('.tile:has-text("Air Mineral")', 500);
  await x.click('.scanwrap input.scan', 200);
  await x.caption('扫码枪一扫就加进账单', 'A scan adds it to the bill', 1200);
  await x.scan(item('eggs').barcode, 700);
  await x.click('.ticket .line:has-text("Air Mineral") .stepper button >> nth=1', 500);
  await x.caption('按 + / − 改数量；鸡蛋免税，不算 SST', '+ / − for quantity; eggs are tax-free', 2200);
  await x.click('.ticket button:has-text("顾客")', 700);
  await x.type('.dialog input[type=search]', 'Ah Seng', 500);
  await x.click('.dialog button:has-text("Ah Seng")', 700);
  await x.caption('会员累积积分', 'Members collect points', 1600);
  await x.click('.buttons .pay', 900);
  await x.click('.dialog .paymethods button:has-text("现金")', 400);
  await x.click('.dialog .quick button:has-text("RM 50")', 500);
  await x.caption('现金自动四舍五入到 5 仙', 'Cash is rounded to the 5 sen', 1800);
  await x.click('.dialog .actions button.primary', 1200);
  await x.caption('找钱多少一目了然，收据自动打印', 'Change shown, receipt prints', 2400);
  await x.click('.dialog button:has-text("下一单")', 900);
  await x.caption('库存马上减少，手机 app 也看得到', 'Stock goes down at once — the phone app sees it too', 2600);
});

await film('pos-4-market', world({ mode: 'SUPERMARKET' }), async (page, x) => {
  await page.waitForSelector('.market');
  await x.title('超市收银', 'JEXO POS · 超市 / 迷你市场', 'Supermarket checkout');
  await x.click('.mlines', 200);
  await x.caption('一直扫，账单是清单，总数很大', 'Keep scanning; the total is big and clear');
  for (const pic of ['malt', 'water', 'water', 'coffee']) await x.scan(item(pic).barcode, 650);
  await x.caption('输入 3* 再扫 = 3 件', 'Type 3* then scan = 3 pieces', 1400);
  await page.keyboard.type('3*'); await page.keyboard.press('Enter'); await x.wait(500);
  await x.scan(item('noodle').barcode, 900);
  await x.click('.fkeys button:has-text("查价")', 700);
  await page.keyboard.type(item('milk').barcode); await page.keyboard.press('Enter');
  await x.caption('查价：扫一下看价钱，不会卖出', 'Price check: see the price without selling', 2200);
  await page.keyboard.press('Escape'); await x.wait(400);
  await x.click('.fkeys button:has-text("快捷商品")', 900);
  await x.caption('快捷商品：没条码的面包、菜', 'Quick items: bread and veg with no barcode', 1800);
  await x.click('.dialog .tile:has-text("Roti 面包")', 900);
  await x.click('.fkeys button:has-text("挂单")', 900);
  await x.caption('挂单：客人忘了拿东西，先服务下一位', 'Hold: serve the next customer meanwhile', 2200);
  await x.click('.fkeys button:has-text("取单")', 800);
  await x.click('.dialog tr.click', 900);
  await x.click('.mpanel .pay', 900);
  await x.click('.dialog .paymethods button >> nth=1', 500);
  await x.click('.dialog button:has-text("加入")', 500);
  await x.click('.dialog .actions button.primary', 1200);
  await x.caption('DuitNow QR、刷卡、电子钱包都可以记录', 'Record DuitNow QR, card or e-wallet', 2400);
  await x.click('.dialog button:has-text("下一单")', 900);
});

await film('pos-5-fnb', world({ mode: 'FNB' }), async (page, x) => {
  await page.waitForSelector('.tile');
  await x.title('餐饮点单', 'JEXO POS · 餐饮', 'Restaurant ordering');
  await x.click('.reg-bar button:has-text("桌位")', 900);
  await x.caption('先选桌位', 'Pick a table', 1400);
  await x.click('.tables button:has-text("3")', 800);
  await x.click('.tile:has-text("Teh Tarik")', 900);
  await x.caption('加料：甜度、加蛋', 'Modifiers: sugar level, extra egg', 1400);
  await x.click('.dialog button:has-text("少糖")', 400);
  await x.click('.dialog button:has-text("加蛋")', 400);
  await x.click('.dialog button:has-text("加入")', 700);
  await x.click('.tile:has-text("Nasi Lemak")', 500);
  await x.click('.tile:has-text("Roti Canai")', 600);
  await x.click('.buttons button:has-text("送厨房")', 1000);
  await x.caption('送厨房：只印新点的菜', 'Kitchen ticket: only what is new', 2000);
  await x.click('.buttons button:has-text("存单")', 900);
  await x.click('.reg-bar button:has-text("桌位")', 900);
  await x.caption('有人坐的桌子显示金额', 'Busy tables show their bill', 2000);
  await x.click('.tables button.busy', 900);
  await x.caption('堂食才收服务费 10%', '10% service charge on dine-in only', 2000);
  await x.click('.buttons .pay', 900);
  await x.click('.dialog .paymethods button >> nth=1', 500);
  await x.click('.dialog button:has-text("加入")', 500);
  await x.click('.dialog .actions button.primary', 1200);
  await x.click('.dialog button:has-text("下一单")', 900);
  await x.caption('桌子空出来，可以接下一桌', 'The table is free again', 2200);
});

await film('pos-6-reports', world({ mode: 'RETAIL', withSales: true }), async (page, x, base) => {
  await x.go(base, '/pos/#/reports/summary', 1500);
  await x.title('报表', 'JEXO POS · 老板看报表', 'Reports for the owner');
  await x.caption('今天卖了多少、赚多少、几单', 'Today’s sales, profit and receipts');
  await x.go(base, '/pos/#/reports/items', 1300);
  await x.caption('哪样最好卖、哪样最赚钱', 'Best sellers and what earns most');
  await x.go(base, '/pos/#/reports/payments', 1300);
  await x.caption('现金、QR、刷卡各收多少', 'Cash, QR and card, each counted');
  await x.go(base, '/pos/#/reports/taxes', 1300);
  await x.caption('税务报表：每种税率，加不收税的销售', 'Tax report: each rate, and tax-free sales');
  await x.go(base, '/pos/#/reports/receipts', 1300);
  await x.caption('作废要写原因，记录永远保留', 'A void needs a reason and is kept forever');
  await x.point('button:has-text("导出")');
  await x.caption('全部可以导出 Excel 给会计', 'Export any report to Excel for the accountant', 2600);
});

// ---------------------------------------------------------- the warehouse

const WH_BG = 'linear-gradient(135deg,#0b1b2b,#12385a 65%,#1d5a8a)';

await film('wh-1-purchase', world({ branch: 'gudang' }), async (page, x, base) => {
  await page.waitForSelector('.wh-tile');
  await x.title('采购单和补货', 'JEXO Warehouse · 采购', 'Purchase orders and reorder', { bg: WH_BG });
  await x.caption('首页：今天要做的事，一按就到', 'Home: today’s jobs, one tap away');
  await x.go(base, '/warehouse/#/purchase/reorder', 1500);
  await x.caption('低于补货点的商品，自动建议要订多少', 'Below the reorder point: how much to order');
  await x.click('.wh-bar button.primary', 1300);
  await x.caption('按常用供应商生成采购单草稿', 'Draft orders made, one per usual supplier', 2000);
  await x.click('.wh-tabs button:has-text("草稿")', 700);
  await x.click('table.list tr.click', 1200);
  await x.caption('可以改数量和单价；员工按「提交」等老板批准', 'Change quantities and prices; staff submit for approval', 2200);
  await x.caption('老板（有审批权限）一按就批准', 'The owner approves with one tap', 1600);
  await x.click('.wh-bar button.primary', 1500);
  await x.click('.wh-bar button:has-text("确认下单")', 1200);
  await x.click('.wh-bar button:has-text("复制发 WhatsApp")', 900);
  await x.caption('复制采购单，直接贴给供应商 WhatsApp', 'Copy the order into WhatsApp for the supplier', 2600);
}, { path: '/warehouse/' });

await film('wh-2-receive', world({ branch: 'gudang' }), async (page, x, base) => {
  await x.go(base, '/warehouse/#/receive', 1500);
  await x.title('收货', 'JEXO Warehouse · 收货', 'Receiving goods', { bg: WH_BG });
  await x.caption('货到了：选是哪一张采购单', 'Goods arrive: pick the purchase order');
  await x.click('.wh-card:has-text("PO-")', 1200);
  await x.type('.wh-head input', 'DO-77812');
  await x.caption('一样一样扫，系统对照订了多少', 'Scan each item; it checks against the order', 1600);
  await x.click('.wh-scan input.scan', 200);
  for (let i = 0; i < 6; i++) await x.scan(item('malt').barcode, 220);
  await x.click('.wh-line:has-text("Malt")', 800);
  await x.type('.dialog label.field input', '22');
  await x.type('.dialog .grid2 input >> nth=0', '2');
  await x.caption('坏了的写「损坏」，不会算进库存', 'Damaged goods are noted, not stocked', 2000);
  await x.click('.dialog button.primary', 700);
  await x.click('.wh-line:has-text("Mi Segera")', 600);
  await x.type('.dialog label.field input', '30', 200);
  await x.click('.dialog button.primary', 600);
  await x.caption('少了的会显示「少」，采购单会继续等', 'What is short stays on the order', 2000);
  await x.click('.wh-bar button.primary', 900);
  await x.click('.dialog button:has-text("完成收货")', 1300);
  await x.caption('完成：库存马上增加，收银和 app 都看得到', 'Done: stock goes up everywhere at once', 2600);
}, { path: '/warehouse/' });

await film('wh-3-transfer', world({ branch: 'gudang' }), async (page, x, base) => {
  await x.go(base, '/warehouse/#/transfers/new', 1500);
  await x.title('调货', 'JEXO Warehouse · 仓库 → 门店', 'Transfers between places', { bg: WH_BG });
  await page.locator('.wh-head select').nth(1).selectOption('ipoh'); await x.wait(400);
  await x.caption('从仓库送去门店：扫要送的货', 'Warehouse to shop: scan what goes', 1800);
  await x.click('.wh-scan input.scan', 200);
  for (let i = 0; i < 10; i++) await x.scan(item('water').barcode, 120);
  for (let i = 0; i < 6; i++) await x.scan(item('rice').barcode, 120);
  await x.wait(600);
  await x.click('.wh-bar button.primary', 900);
  await x.click('.dialog button:has-text("发货")', 1300);
  await x.caption('发货后：仓库马上扣，货在「在途」', 'Dispatched: off the warehouse, now in transit', 2400);
  await x.click('.wh-tabs button:has-text("待我收")', 800);
  await x.click('.wh-card:has-text("TR-")', 1200);
  await x.caption('门店收到：扫一下到了什么', 'At the shop: scan what arrived', 1600);
  await x.click('.wh-scan input.scan', 200);
  for (let i = 0; i < 10; i++) await x.scan(item('water').barcode, 120);
  for (let i = 0; i < 5; i++) await x.scan(item('rice').barcode, 120);
  await x.caption('白米少了 1 包，会记成运输差异', 'One bag short: kept as a transit difference', 2200);
  await x.click('.wh-bar button.primary', 900);
  await x.click('.dialog button.primary', 1300);
  await x.click('.wh-tabs button:has-text("已完成")', 900);
  await x.caption('哪一次调货少了，一查就知道', 'Find out which transfer came up short', 2600);
}, { path: '/warehouse/' });

await film('wh-4-stock', world({ branch: 'gudang' }), async (page, x, base) => {
  await x.go(base, '/warehouse/#/adjust', 1500);
  await x.title('库存和调整', 'JEXO Warehouse · 库存', 'Stock and adjustments', { bg: WH_BG });
  await x.click('.wh-scan input.scan', 200);
  await x.scan(item('eggs').barcode, 1200);
  await x.caption('调整库存一定要选原因：损坏、过期、丢失…', 'Every adjustment needs a reason', 2000);
  await x.type('input.big-num', '2');
  await x.click('.wh-chips button:has-text("损坏")', 400);
  await x.click('button:has-text("保存调整")', 1200);
  await x.caption('谁改的、为什么、之前之后多少，全部记下', 'Who, why, and the figure before and after', 2200);
  await x.go(base, '/warehouse/#/stock', 1600);
  await x.caption('库存：现有、在途、订购中、可用、价值', 'On hand, in transit, on order, available, value', 2400);
  await x.click('table.wh-stock tr:has-text("Telur")', 1500);
  await x.caption('「为什么是 23？」最后盘点 + 每一笔进出', '“Why is it 23?” Last count plus every movement', 2600);
  await page.mouse.wheel(0, 500); await x.wait(1200);
  await x.caption('设补货点和常用供应商，系统会提醒补货', 'Set a reorder point; it reminds you to buy', 2600);
}, { path: '/warehouse/' });

await film('wh-5-check', world({ branch: 'gudang' }), async (page, x, base) => {
  await x.go(base, '/warehouse/#/variance', 1500);
  await x.title('盘点差异和记录', 'JEXO Warehouse · 查账', 'Count differences and the audit log', { bg: WH_BG });
  await x.caption('手机 app 每次盘点，和账面数比较', 'Each count from the phone app against the books');
  await x.click('table.list tr.click', 1500);
  await x.caption('短少多少、值多少钱，一目了然', 'What is short and what it is worth', 2400);
  await x.go(base, '/warehouse/#/places', 1300);
  await x.caption('仓库和门店：每个地点库存分开算', 'Warehouses and shops, each with its own stock', 2200);
  await x.go(base, '/warehouse/#/audit', 1300);
  await x.caption('操作记录：每一次修改都在，没人能删', 'Audit log: every change kept, nobody can delete it', 2600);
}, { path: '/warehouse/' });

await film('wh-6-online', world({ branch: 'gudang' }), async (page, x, base) => {
  await page.waitForSelector('.wh-tile');
  await x.go(base, '/warehouse/#/online', 1200);
  await page.waitForSelector('textarea');
  await x.title('网购进货', 'JEXO Warehouse · 拼多多 / 淘宝 / Shopee / TikTok', 'Stock bought online, as a purchase order', { bg: WH_BG });
  await x.caption('在购物 app 打开订单，全选复制', 'Copy the order from the shopping app', 2000);
  await x.click('.wh-chips button:has-text("拼多多")', 400);
  await page.fill('textarea', ['拼多多', '订单编号：240915-582013947761', 'Beras 5kg 白米 泰国香米 批发', '规格：5kg', '¥30.00', 'x4',
    'Kopi 500g 咖啡粉 马来西亚', '¥18.00', 'x6', '运费 ¥10.00', '实付 ¥238.00', '快递单号：YT7491234567890'].join('\n'));
  await x.caption('贴进来，按「读取订单」', 'Paste it, press Read the order', 1500);
  await x.click('button:has-text("读取订单")', 1500);
  await page.evaluate(() => window.scrollTo(0, 260));
  await x.caption('商品、数量、价钱、运费、订单号都读出来了', 'Items, quantities, prices, shipping, order number — read for you', 2600);
  await x.point('.wh-online-line .pill');
  await x.caption('自动配对你的商品；下次同一样会记得', 'Matched to your products, and remembered next time', 2400);
  await x.point('.wh-online-total');
  await x.caption('人民币按汇率换成 RM，运费算进成本', 'Yuan converted to ringgit, shipping added to the cost', 2400);
  await x.click('.wh-bar button.primary', 1500);
  await x.caption('变成采购单：已下单，等包裹', 'Now a purchase order, waiting for the parcel', 2200);
  await x.go(base, '/warehouse/#/receive', 1200);
  await x.click('.wh-scan input.scan', 200);
  await x.scan('YT7491234567890', 1500);
  await x.caption('包裹到了：扫运单号，打开这张单收货', 'Parcel here: scan its tracking number to receive it', 2600);
}, { path: '/warehouse/' });

// ------------------------------------------------------- the phone app

for (const f of APP_FILMS) {
  await film(f.name, {}, async (page) => {
    await page.setContent(slidesHtml(f));
    await page.waitForFunction(() => window.__slidesDone === true, null, { timeout: 120000 });
  }, { path: null });
}

for (const f of readdirSync(OUT).filter((x) => x.startsWith('_raw_'))) rmSync(join(OUT, f), { recursive: true, force: true });
