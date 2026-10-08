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
import { APP_FILMS, SLIDE_AT, slidesHtml } from './app-slides.mjs';
import { OUT, film } from './studio.mjs';

// ---------------------------------------------------------------- the till

await film('pos-1-start', world({ mode: '' }), async (page, x, base) => {
  await page.waitForSelector('.modecard');
  await x.title('开始使用收银系统', 'SuXin POS · 第一步', 'Getting started');
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
  await x.go(base, '/pos/#/profile', 1200);
  await x.caption('模式选了就锁住；要换，管理员在「我的 Profile」输入密码', 'The mode is then locked; an admin changes it in Profile, with their password', 2800);
});

await film('pos-2-items', world({ mode: 'RETAIL' }), async (page, x, base) => {
  await x.go(base, '/pos/#/items/list', 1200);
  await x.title('商品和照片', 'SuXin POS · 商品', 'Items and photos');
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
  await x.title('店面零售收银', 'SuXin POS · 店面零售', 'Retail shop checkout');
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
  await x.title('超市收银', 'SuXin POS · 超市 / 迷你市场', 'Supermarket checkout');
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
  await x.title('餐饮点单', 'SuXin POS · 餐饮', 'Restaurant ordering');
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
  await x.title('报表', 'SuXin POS · 老板看报表', 'Reports for the owner');
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
  await x.title('采购单和补货', 'SuXin WMS · 采购', 'Purchase orders and reorder', { bg: WH_BG });
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
  await page.waitForSelector('.wh-tile');
  await x.go(base, '/warehouse/#/receive', 1500);
  await x.title('收货', 'SuXin WMS · 收货', 'Receiving goods', { bg: WH_BG });
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
  await page.waitForSelector('.wh-tile');
  await x.go(base, '/warehouse/#/transfers/new', 1500);
  await x.title('调货', 'SuXin WMS · 仓库 → 门店', 'Transfers between places', { bg: WH_BG });
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
  await page.waitForSelector('.wh-tile');
  await x.go(base, '/warehouse/#/adjust', 1500);
  await x.title('库存和调整', 'SuXin WMS · 库存', 'Stock and adjustments', { bg: WH_BG });
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
  await page.waitForSelector('.wh-tile');
  await x.go(base, '/warehouse/#/variance', 1500);
  await x.title('盘点差异和记录', 'SuXin WMS · 查账', 'Count differences and the audit log', { bg: WH_BG });
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
  await x.title('拼多多进货', 'SuXin WMS · 拼多多', 'Pinduoduo purchases, as a purchase order', { bg: WH_BG });
  await x.point('button[data-act="pdd-shot"]');
  await x.caption('可以按「读截图」选订单截图，或者复制订单文字', 'Read screenshots of the order, or copy its text', 2600);
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

// ------------------------------------------------- more of the till

const W = 'workspaces/w1/';
/** The shop, with changes to its till settings. */
const shopWith = (settings, opts = {}) => {
  const w = world(opts);
  w.set[`${W}pos/settings`] = { ...w.set[`${W}pos/settings`], ...settings };
  return w;
};

await film('pos-7-shift', shopWith({ requireShift: true }), async (page, x, base) => {
  await page.waitForSelector('.tile');
  await x.title('开班和交班', 'SuXin POS · 班次', 'Opening and closing a shift');
  await x.caption('开店：按「开班」，输入钱箱里的零钱', 'Opening: press Open shift, enter the float in the drawer');
  await x.click('.shift-btn', 900);
  await x.type('.dialog input', '200');
  await x.click('.dialog .actions button.primary', 1000);
  await x.caption('开班后才可以收钱，每张收据都记在这一班', 'Every receipt is kept under this shift', 2000);
  await x.click('.tile:has-text("Malt")', 400);
  await x.click('.tile:has-text("Air Mineral")', 400);
  await x.click('.buttons .pay', 900);
  await x.click('.dialog .paymethods button:has-text("现金")', 400);
  await x.click('.dialog .quick button:has-text("RM 50")', 500);
  await x.click('.dialog .actions button.primary', 1200);
  await x.click('.dialog button:has-text("下一单")', 800);
  await x.click('.shift-btn', 1500);
  await x.caption('交班：系统算好钱箱应该有多少钱', 'Closing: it works out the cash that should be in the drawer', 2400);
  await x.point('.dialog .shift-sum');
  await x.caption('中途放入或拿出现金，按「放入现金 / 取出现金」写原因', 'Cash in or out during the day: with a reason', 2400);
  await x.point('.dialog button:has-text("取出现金")');
  await x.type('.dialog input >> nth=0', '210');
  await x.caption('输入数到的现金，马上显示短少或多出', 'Enter the cash you counted: short or over at once', 2400);
  await x.click('.dialog .actions button.primary', 900);
  await x.click('.dialog .actions button.primary >> nth=-1', 1500);
  await x.caption('交班单自动打印，老板在「报表 → 班次」看每一班', 'The shift slip prints; owners see every shift under Reports → Shifts', 2400);
  await x.go(base, '/pos/#/reports/shifts', 1600);
  await x.caption('谁开的班、卖多少、短多少，全部记录', 'Who opened it, what was sold, what was short — all kept', 2600);
});

await film('pos-8-labels', world({ mode: 'RETAIL' }), async (page, x, base) => {
  await x.go(base, '/pos/#/items/list', 1300);
  await page.evaluate(() => { window.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {} }); });
  await x.title('价格标签', 'SuXin POS · 商品 → 价格标签', 'Printing shelf price labels');
  await x.caption('商品 → 商品清单 → 按「价格标签」', 'Items → Item list → Price labels');
  await x.click('button:has-text("价格标签")', 900);
  await x.caption('勾要印的商品', 'Tick the items to print', 1600);
  await x.click('.dialog label.check >> nth=0', 400);
  await x.click('.dialog label.check >> nth=1', 400);
  await x.click('.dialog label.check >> nth=2', 400);
  await x.caption('选标签大小：常用的标签打印机尺寸都有', 'Choose the label size', 2000);
  await x.point('.dialog select >> nth=0');
  await x.caption('每样印几张也可以设定', 'And how many of each', 1600);
  await x.point('.dialog .actions button.primary');
  await x.caption('按「打印标签」：有名称、价钱和条码', 'Print labels: name, price and barcode on each', 2600);
});

await film('pos-9-customers', world({ mode: 'RETAIL' }), async (page, x, base) => {
  await x.go(base, '/pos/#/customers', 1400);
  await x.title('顾客和会员积分', 'SuXin POS · 顾客', 'Customers and loyalty points');
  await x.caption('顾客清单：电话、积分、来了几次、花了多少', 'Phone, points, visits and spending for each customer');
  await x.click('button:has-text("新增顾客")', 900);
  await x.type('.dialog label.field input >> nth=0', 'Puan Rosnah');
  await x.type('.dialog .grid2 input >> nth=0', '0124567890');
  await x.caption('会员卡：扫卡号，或手机感应 NFC 卡', 'Member card: scan its number, or tap an NFC card', 2200);
  await x.point('.dialog .row input');
  await x.click('.dialog .actions button.primary', 1000);
  await x.go(base, '/pos/#/settings/loyalty', 1300);
  await x.caption('设置 → 积分：每 RM1 得几分，几分可以抵钱', 'Settings → Loyalty: points per ringgit and what they are worth', 2600);
  await x.go(base, '/pos/#/customers', 1200);
  await x.caption('顾客要求删除资料（PDPA）：按「删除顾客资料」', 'A customer asks to be removed (PDPA): Remove customer data', 2400);
  await x.caption('90 天后自动删除，收据保留但没有名字', 'Erased after 90 days; receipts stay, without the name', 2400);
  await x.point('button:has-text("导出 Excel")');
  await x.caption('全部顾客可以导出 Excel', 'Export every customer to Excel', 2200);
});

await film('pos-10-einvoice', shopWith({ tin: 'C2584563200', msic: '47111' }, { withSales: true }), async (page, x, base) => {
  await x.go(base, '/pos/#/reports/taxes', 1500);
  await x.title('SST 和电子发票', 'SuXin POS · 税务', 'SST and the e-invoice (MyInvois)');
  await x.caption('税务报表：每个税率收了多少，不收税的也分开', 'Tax report: each rate, and tax-free sales apart', 2400);
  await x.go(base, '/pos/#/settings/receipt', 1300);
  await x.caption('设置 → 收据：填公司 TIN 和 MSIC 号码', 'Settings → Receipt: your TIN and MSIC code', 2400);
  await x.go(base, '/pos/#/reports/einvoice', 1400);
  const month = new Date().toISOString().slice(0, 7);
  await page.fill('input[type=month]', month);
  await page.dispatchEvent('input[type=month]', 'change');
  await x.wait(1200);
  await x.caption('每个月：一般顾客的收据合并成一张电子发票', 'Each month: receipts to ordinary buyers in one consolidated e-invoice', 2800);
  await x.point('button:has-text("下载 JSON")');
  await x.caption('下载 JSON 上传到 MyInvois，或 CSV 给会计', 'Download JSON for MyInvois, or CSV for the accountant', 2800);
});

await film('pos-11-setup', world({ mode: 'RETAIL' }), async (page, x, base) => {
  await x.go(base, '/pos/#/settings/payments', 1400);
  await x.title('收银设定', 'SuXin POS · 付款、收据、收银机', 'Payments, receipt and till numbers');
  await x.caption('付款方式：现金、DuitNow QR、刷卡、电子钱包', 'Payment types: cash, DuitNow QR, card, e-wallet', 2400);
  await x.caption('QR 和刷卡用银行给的机器收，收银只是记录', 'QR and card are taken on the bank’s terminal; the till records them', 2600);
  await x.go(base, '/pos/#/settings/receipt', 1300);
  await x.caption('收据：店名、地址、SST 号码、纸宽 58 或 80mm', 'Receipt: name, address, SST number, 58 or 80 mm paper', 2400);
  await x.go(base, '/pos/#/settings/device', 1400);
  await x.caption('这台电脑：收银机号码，可以改名字，例如「1 号柜台」', 'This device: its till number, and a name like “Counter 1”', 2600);
  await x.point('.this-till');
  await x.caption('收据和报表都会写是哪一台收银机', 'Receipts and reports show which till', 2000);
  await page.mouse.wheel(0, 500); await x.wait(800);
  await x.caption('打印机和钱箱：USB 收据打印机可以直接连接', 'Printer and cash drawer: connect a USB receipt printer', 2600);
  await x.go(base, '/pos/#/settings/stores', 1300);
  await x.caption('分店：每间店的库存、销售分开', 'Stores: each shop’s stock and sales apart', 2200);
  await x.go(base, '/pos/#/settings/addons', 1300);
  await x.caption('附加功能：现在有什么，还可以加什么', 'Add-ons: what you have and what you can add', 2400);
});

await film('pos-12-lock', world({ mode: 'RETAIL' }), async (page, x, base) => {
  await page.waitForSelector('.tile');
  await x.title('锁定收银和换模式', 'SuXin POS · 只给收银员用收银', 'Till lock, folding menu and changing the mode');
  await x.caption('左上角的按钮：菜单可以收起来，画面更大', 'The menu folds away for a bigger till', 1800);
  await x.click('.side .side-collapse', 1200);
  await x.click('.menu-toggle >> nth=0', 1200);
  await x.caption('右上角「锁定收银」：这台电脑只能用收银', 'Lock till, top right: this computer shows only the till', 2200);
  await x.click('button[data-act="till-lock"]', 900);
  await x.type('.dialog input[type=password]', 'secret');
  await x.caption('要输入管理员的 email 和密码', 'It takes an admin’s email and password', 1800);
  await x.click('button[data-act="till-lock-ok"]', 1400);
  await x.caption('锁了之后：报表、设定、仓库都打不开', 'Locked: no reports, settings or warehouse here', 2400);
  await x.caption('解锁也要管理员密码', 'Unlocking needs the admin password too', 1600);
  await x.click('button[data-act="till-lock"]', 900);
  await x.type('.dialog input[type=password]', 'secret');
  await x.click('button[data-act="till-lock-ok"]', 1400);
  await x.go(base, '/pos/#/profile', 1400);
  await x.caption('换收银模式：只有管理员，在 Profile 这里', 'Changing the till’s mode: admins only, here in Profile', 2400);
  await x.click('button[data-act="change-mode"]', 1000);
  await x.click('.dialog .modecard[data-mode="SUPERMARKET"]', 600);
  await x.type('.dialog input[type=password]', 'secret');
  await x.caption('再输入一次自己的密码，才会换', 'Type your password again to change it', 1800);
  await x.click('.dialog .actions button.primary', 1500);
  await x.caption('员工看到 Profile，但不能换模式', 'Staff see Profile, but cannot change the mode', 2400);
});

await film('pos-13-staff', world({ mode: 'RETAIL' }), async (page, x, base) => {
  await x.go(base, '/pos/#/employees', 1500);
  await x.title('员工和权限', 'SuXin POS · 员工', 'Staff and what they may do');
  await x.caption('员工清单：每个人的角色和分店', 'Each person’s role and branch');
  await x.click('button:has-text("新增员工")', 1000);
  await x.caption('填名字、email、密码，选角色和分店', 'Name, email, password, role and branch', 2400);
  await x.click('.dialog button:has-text("取消")', 700);
  await x.caption('员工也可以自己注册：用公司代码加入', 'Or staff sign up themselves with the company code', 2400);
  await x.go(base, '/pos/#/inventory/levels', 1500);
  await x.caption('库存：每间分店现在有多少，低库存显示出来', 'Stock: what each branch has; low stock stands out', 2400);
  await x.go(base, '/pos/#/inventory/adjust', 1300);
  await x.caption('调整库存要选原因，每一笔都记录', 'Every stock change needs a reason and is logged', 2400);
});

await film('pos-14-api', world({ mode: 'RETAIL' }), async (page, x, base) => {
  await x.go(base, '/pos/#/integrations/tokens', 1500);
  await x.title('API 和连接其他系统', 'SuXin POS · 集成', 'API: connecting other systems');
  await x.caption('会计软件或网店要读你的资料：开一个访问令牌', 'For accounting software or a web shop: create an access token', 2400);
  await x.click('button:has-text("新增访问令牌")', 900);
  await x.type('.dialog input', 'Akaun SQL');
  await x.click('.dialog .actions button.primary', 1200);
  await x.caption('令牌只显示一次，复制好交给对方', 'The token is shown once: copy it for them', 2400);
  await page.keyboard.press('Escape'); await x.wait(500);
  await x.go(base, '/pos/#/integrations/api', 1400);
  await x.caption('说明页：商品、库存、收据、顾客，每一个怎样读写', 'The API page: items, stock, receipts and customers', 2600);
  await x.caption('不用了按「撤销」，对方马上不能再用', 'Revoke it and it stops working at once', 2200);
});

await film('pos-15-notify', (() => {
  const w = world({ mode: 'RETAIL' });
  w.set['publicConfig/telegram'] = { username: 'SuXinBot' };
  w.set['publicConfig/push'] = { vapidKey: 'demo' };
  return w;
})(), async (page, x, base) => {
  await x.go(base, '/pos/#/settings/notify', 1500);
  await x.title('Telegram 机器人和每日报告', 'SuXin · 设置 → 通知和机器人', 'The Telegram bot and the morning report');
  await x.caption('在 Telegram 问「Milo 还有多少」「今天卖了多少」，机器人马上回答', 'Ask in Telegram: how many Milo, sales today — the bot answers', 2600);
  await x.click('button[data-act="tg-connect"]', 1200);
  await x.caption('按「连接 Telegram」，再按「打开 Telegram」，按 Start 就连上', 'Connect Telegram, Open Telegram, press Start', 2600);
  await x.point('.nf-start');
  await x.caption('每天早上 8 点：昨天卖了多少、哪些低库存', 'Every morning at 8: yesterday\'s sales and low stock', 2400);
  await x.point('.nf-card:has-text("Email") input[type=checkbox]');
  await x.caption('老板也可以用 email 收报告，填几个 email 都可以', 'Owners can get it by email too', 2400);
  await x.point('button[data-act="push-here"]');
  await x.caption('手机 app 登录后会自动收到通知；电脑按这里开启', 'The phone app gets notifications after sign-in; computers turn it on here', 2800);
});

await film('cloud-1-dashboard', world({ mode: 'RETAIL', withSales: true }), async (page, x, base) => {
  await x.go(base, '/data/', 1800);
  await x.title('SuXin Every Data 总览', 'SuXin Every Data · 老板一页看全部', 'SuXin Every Data: the whole business on one page');
  await x.caption('今天卖了多少、几单、平均每单', 'Today’s sales, receipts and average bill', 2400);
  await page.mouse.wheel(0, 400); await x.wait(900);
  await x.caption('库存：低库存、没货、库存价值', 'Stock: low, out, and what it is worth', 2400);
  await page.mouse.wheel(0, 400); await x.wait(900);
  await x.caption('仓库：待批准、待收货、在途', 'Warehouse: to approve, to receive, in transit', 2400);
  await x.caption('你买了哪些配套，这一页就显示哪些', 'It shows what your plan includes', 2200);
  await x.go(base, '/app/', 1600);
  await x.caption('应用中心：收银、仓库、盘点、Cloud 随时换', 'The app centre: switch between the till, warehouse, Count and Cloud', 2600);
}, { path: '/pos/' });

// ------------------------------------------------ SuXin Barcode Scan on the web

await film('count-1-web', world({}), async (page, x, base) => {
  await page.waitForSelector('.cnt-card, .cnt-list');
  await x.title('网页版盘点', 'SuXin Barcode Scan · 电脑或手机浏览器', 'SuXin Barcode Scan in the browser');
  await x.caption('和手机 app 同一个账号、同一份盘点', 'Same account and the same counts as the phone app', 2200);
  await x.click('button:has-text("新盘点")', 900);
  await x.type('form input >> nth=0', 'Rak 3');
  await x.click('form button.primary', 1400);
  await page.waitForSelector('input.scan');
  await x.caption('用扫码枪或镜头扫，扫几次就是几个', 'Scan with a scanner or the camera; each scan adds one', 2000);
  await x.click('input.scan', 200);
  for (const pic of ['malt', 'malt', 'malt', 'rice', 'rice']) await x.scan(item(pic).barcode, 500);
  await x.caption('称重的或很多的：先输入数量再扫', 'Weighed or many: type the quantity, then scan', 2000);
  await x.type('.cnt-qty', '24');
  await x.click('input.scan', 200);
  await x.scan(item('water').barcode, 900);
  await x.caption('按数字可以直接改', 'Tap a number to change it', 1800);
  await x.click(`.cnt-line[data-code="${item('rice').barcode}"] .cnt-n`, 800);
  await x.type('.dialog input', '6');
  await x.click('.dialog .actions button.primary', 900);
  await x.caption('全部数好，按「完成」', 'All counted: Finish', 1600);
  await x.click('button[data-act="finish"]', 900);
  await x.click('.dialog .actions button.primary >> nth=-1', 1500);
  await x.caption('完成后不能再改；仓库系统马上看到差异', 'Finished counts are locked; the warehouse sees the differences at once', 2800);
}, { path: '/count/' });

// ------------------------------------------- accounts and the app centre

await film('acc-1-signup', world({}), async (page, x, base) => {
  // Signed out until the sign-in below (the flag lasts across pages).
  await page.addInitScript(() => { if (!sessionStorage.getItem('demo.in')) window.__signedOut = true; });
  await x.go(base, '/app/#create', 1500);
  await page.waitForSelector('.auth-card');
  await x.title('注册和登录', 'SuXin · 账号', 'Signing up, joining and passwords');
  await x.caption('老板：「注册公司」，你就是管理员，有 14 天试用', 'Owner: Create a company — you are its admin, with a 14-day trial', 2600);
  const vals = ['Ah Hock', 'ahhock@kedaimaju.my', 'rahsia123', 'rahsia123', 'Kedai Maju', 'kedaimaju'];
  for (const [i, v] of vals.entries()) await x.type(`.auth-card form input >> nth=${i}`, v, 150);
  await x.caption('公司代码自己定，员工用它来加入', 'Pick a company code; staff join with it', 2200);
  await x.click('.auth-tabs button[data-tab="join"]', 900);
  await x.caption('员工：「加入公司」，填老板给的公司代码', 'Staff: Join a company with the code from the owner', 2600);
  await x.click('.auth-tabs button[data-tab="signin"]', 900);
  await x.click('button[data-tab="reset"]', 900);
  await x.caption('忘记密码：填 email 和公司代码，重设链接寄到 email', 'Forgot it? Email and company code: a reset link is emailed', 2800);
  await x.click('.auth-tabs button[data-tab="signin"]', 900);
  await x.caption('以后用 email 和密码登录', 'From then on, sign in with email and password', 1600);
  await x.type('.auth-card form input >> nth=0', 'ahhock@kedaimaju.my', 150);
  await x.type('.auth-card form input >> nth=1', 'rahsia123', 150);
  await page.evaluate(() => sessionStorage.setItem('demo.in', '1'));
  await x.click('.auth-card form button.primary', 1800);
  await page.waitForSelector('.hub-app');
  await x.caption('应用中心：你的配套有的 app 可以打开', 'The app centre: the apps in your plan open', 2400);
  await x.point('.hub-app[data-app="pos"]');
  await x.caption('没买的会锁着，升级就开', 'The rest are locked until you upgrade', 2000);
  await x.click('.hub-app[data-app="count"]', 1800);
  await x.click('.appswitch summary', 1000);
  await x.caption('每个 app 上面都可以随时换去另一个', 'Switch to another app from the top of any app', 2600);
}, { path: null });

// ------------------------------------------------ the warehouse, set up

await film('wh-0-setup', world({ branch: 'gudang' }), async (page, x, base) => {
  await page.waitForSelector('.wh-tile');
  await x.go(base, '/warehouse/#/places', 1500);
  await x.title('仓库系统设定', 'SuXin WMS · 开始', 'Setting up the warehouse', { bg: WH_BG });
  await x.caption('仓库和分店：每个地点库存分开算', 'Warehouses and shops, each with its own stock', 2400);
  await x.go(base, '/warehouse/#/suppliers', 1400);
  await x.caption('供应商：电话、联络人、付款条件', 'Suppliers: phone, contact, payment terms', 2400);
  await x.go(base, '/warehouse/#/', 1300);
  await x.caption('「现在在」选你人在哪一个仓库或门店', '“Working at”: the warehouse or shop you are in', 2200);
  await x.point('select');
  await x.caption('员工权限在 SuXin Barcode Scan app 的「角色」设定', 'Staff permissions are set under Roles in the SuXin Barcode Scan app', 2600);
  await x.caption('手机上按「安装」，工人就像用 app 一样', 'On a phone, Install it and workers use it like an app', 2400);
}, { path: '/warehouse/' });

// ------------------------------------------------------- the phone app

for (const f of APP_FILMS) {
  await film(f.name, {}, async (page, x) => {
    await page.setContent(slidesHtml(f));
    x.cue(`${f.title[0]}。${f.title[1]}`, f.title[2]);
    f.slides.forEach(([, head, zh, en], i) => x.cue(`${head}。${zh}`, en, SLIDE_AT(i)));
    await page.waitForFunction(() => window.__slidesDone === true, null, { timeout: 120000 });
  }, { path: null });
}

for (const f of readdirSync(OUT).filter((x) => x.startsWith('_raw_'))) rmSync(join(OUT, f), { recursive: true, force: true });
