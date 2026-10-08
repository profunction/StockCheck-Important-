/**
 * Every page's own tutorial, and every till button's: what the "▶ 教学"
 * button on a page and the till's tutorial mode show (pagehelp.js), and
 * what tools/videos/pages.mjs films. One list, so the words under a video
 * and the words in it never drift apart.
 *
 * Each entry: title [zh, en, ms], where the film starts (path, and the
 * pretend shop's mode), and steps: what is said [zh, en, ms], with what the
 * pointer does first: type, click, scan, point, key, scroll -- in that
 * order -- or a list of them in `do`.
 *
 * Keys: pos-<page>[-<sub>] for the back office, till-<button> for the
 * till, wh-<page> for the warehouse, cnt-<page> for SuXin Count on the
 * web, hub for the app centre.
 */

const S = (zh, en, ms, act = {}) => ({ say: [zh, en, ms], ...act });
const T = (title, path, steps, opts = {}) => ({ title, path, steps, ...opts });

// ------------------------------------------------------------- the till

const MARKET = { world: { mode: 'SUPERMARKET' } };
const RETAIL = { world: { mode: 'RETAIL' } };
const FNB = { world: { mode: 'FNB' } };

export const TILL = {
  'till-scan': T(['扫码', 'Scanning', 'Imbas'], '/pos/#/pos', [
    S('扫码枪对准条码一扫，商品就进账单', 'Point the scanner at the barcode: the item goes on the bill', 'Imbas kod bar: barang masuk ke bil', { click: '.scanbar input.scan' }),
    S('同一样再扫一次，就是 2 件', 'Scan it again for 2', 'Imbas lagi untuk 2', { scan: 'malt' }),
    S('也可以打条码数字再按 Enter', 'Or type the barcode number and press Enter', 'Atau taip nombor kod bar dan tekan Enter', { scan: 'malt' }),
  ], MARKET),
  'till-camera': T(['用镜头扫码', 'Scan with the camera', 'Imbas dengan kamera'], '/pos/#/pos', [
    S('没有扫码枪：按相机按钮', 'No scanner? Press the camera button', 'Tiada pengimbas? Tekan butang kamera', { point: '[data-help="camera"]' }),
    S('把条码对准电脑或手机的镜头，扫到会自动加进账单', 'Hold the barcode to the camera; it is added by itself', 'Hadapkan kod bar ke kamera; ia ditambah sendiri'),
  ], MARKET),
  'till-nfc': T(['NFC 感应', 'NFC tags', 'Tag NFC'], '/pos/#/pos', [
    S('Android 手机用 Chrome 开收银，会多一个 NFC 按钮', 'In Chrome on an Android phone there is an NFC button', 'Di Chrome telefon Android ada butang NFC', { point: '.scanbar' }),
    S('按一下打开，会员卡或商品标签靠近手机就加进来', 'Tap it, then hold a member card or tag to the phone', 'Tekan, kemudian dekatkan kad ahli atau tag'),
  ], MARKET),
  'till-qty': T(['数量 ×', 'Quantity ×', 'Kuantiti ×'], '/pos/#/pos', [
    S('同样的东西很多件：按「数量 ×」', 'Many of the same: press Qty ×', 'Banyak yang sama: tekan Kuantiti ×', { click: '.fkeys button >> nth=0' }),
    S('输入件数，按确定', 'Enter how many, press OK', 'Masukkan bilangan, tekan OK', { type: ['.dialog input', '6'], click: '.dialog .actions button.primary' }),
    S('再扫一次，就是 6 件', 'Scan once: that is 6', 'Imbas sekali: itu 6', { click: '.scanbar input.scan', scan: 'water' }),
    S('快捷：在扫码框打 6* 再扫也一样', 'Shortcut: type 6* in the scan box, then scan', 'Pintas: taip 6* dalam kotak imbas, kemudian imbas'),
  ], MARKET),
  'till-price-check': T(['查价', 'Price check', 'Semak harga'], '/pos/#/pos', [
    S('客人问价钱：按「查价」', 'A customer asks the price: press Price check', 'Pelanggan tanya harga: tekan Semak harga', { click: '.fkeys button >> nth=1' }),
    S('扫一下，看到价钱和库存，不会卖出', 'Scan: see the price and stock, nothing is sold', 'Imbas: lihat harga dan stok, tiada jualan', { scan: 'milk' }),
  ], MARKET),
  'till-quick': T(['快捷商品', 'Quick items', 'Barang pantas'], '/pos/#/pos', [
    S('没有条码的面包、菜：按「快捷商品」', 'Bread or vegetables with no barcode: press Quick items', 'Roti atau sayur tanpa kod bar: tekan Barang pantas', { click: '.fkeys button >> nth=2' }),
    S('点图片就加进账单', 'Tap the picture to add it', 'Tekan gambar untuk tambah', { click: '.dialog .tile >> nth=0' }),
  ], MARKET),
  'till-customer': T(['会员', 'Members', 'Ahli'], '/pos/#/pos', [
    S('按「会员」，搜名字或电话', 'Press Member, search a name or phone', 'Tekan Ahli, cari nama atau telefon', { click: '.fkeys button >> nth=3' }),
    S('选会员，这张单的积分就算给他', 'Pick them: this bill\'s points go to them', 'Pilih: mata bil ini untuk mereka', { type: ['.dialog input[type=search]', 'Ah'], click: '.dialog button:has-text("Ah Seng")' }),
    S('扫会员卡或 NFC 卡也可以', 'Or scan their member card', 'Atau imbas kad ahli'),
  ], MARKET),
  'till-discount': T(['折扣', 'Discounts', 'Diskaun'], '/pos/#/pos', [
    S('先扫商品', 'Scan the items first', 'Imbas barang dahulu', { click: '.scanbar input.scan', scan: 'coffee' }),
    S('按「折扣」，勾要用的折扣，按套用', 'Press Discount, tick one, Apply', 'Tekan Diskaun, tanda satu, Guna', { click: '.fkeys button >> nth=4' }),
    S('折扣在「商品 → 折扣」先设好', 'Discounts are set up under Items → Discounts', 'Diskaun disediakan di Barang → Diskaun', { key: 'Escape' }),
  ], MARKET),
  'till-hold': T(['挂单', 'Hold', 'Tahan'], '/pos/#/pos', [
    S('客人忘了拿东西：先「挂单」', 'The customer forgot something: Hold the bill', 'Pelanggan terlupa: Tahan bil', { click: '.scanbar input.scan', scan: 'bread' }),
    S('账单存起来，马上服务下一位', 'It is kept; serve the next customer', 'Ia disimpan; layan pelanggan seterusnya', { click: '.fkeys button >> nth=5' }),
  ], MARKET),
  'till-recall': T(['取单', 'Recall', 'Panggil'], '/pos/#/pos', [
    S('挂起的单，按「取单」拿回来', 'A held bill: press Recall to bring it back', 'Bil ditahan: tekan Panggil untuk ambil semula', {
      do: [['click', '.scanbar input.scan'], ['scan', 'bread'], ['click', '.fkeys button >> nth=5'], ['click', '.fkeys button >> nth=6']] }),
    S('选那一张，继续扫或收款', 'Pick the bill and carry on', 'Pilih bil dan sambung', { click: '.dialog tr.click >> nth=0' }),
  ], MARKET),
  'till-drawer': T(['开钱箱', 'Open drawer', 'Buka laci'], '/pos/#/pos', [
    S('连接了 USB 收据打印机，就会多一个「开钱箱」按钮', 'With a USB receipt printer connected there is an Open drawer key', 'Dengan pencetak resit USB ada kekunci Buka laci', { point: '.fkeys' }),
    S('收现金会自动开钱箱；要找零钱可以按它', 'Cash payments open it by themselves; press it for change', 'Bayaran tunai membukanya sendiri; tekan untuk wang kecil'),
    S('设置 → 这台电脑 → 连接打印机', 'Settings → This device → connect the printer', 'Tetapan → Peranti ini → sambung pencetak'),
  ], MARKET),
  'till-clear': T(['清除', 'Clear', 'Kosongkan'], '/pos/#/pos', [
    S('扫错了整张单：按「清除」', 'The whole bill is wrong: press Clear', 'Seluruh bil salah: tekan Kosongkan', { click: '.scanbar input.scan', scan: 'eggs' }),
    S('确定后账单清空，什么都不会卖出', 'Confirm: the bill is emptied, nothing sold', 'Sahkan: bil dikosongkan, tiada jualan', { click: '.fkeys button.danger' }),
    S('只错一样：点那一行改数量', 'Only one wrong: tap that line to change it', 'Hanya satu salah: tekan baris itu', { key: 'Escape' }),
  ], MARKET),
  'till-pay': T(['收款', 'Taking payment', 'Terima bayaran'], '/pos/#/pos', [
    S('扫好商品，按「收款」', 'Items scanned: press Charge', 'Barang diimbas: tekan Bayar', { click: '.scanbar input.scan', scan: 'malt' }),
    S('选付款方式：现金、DuitNow QR、刷卡、电子钱包', 'Pick the payment: cash, DuitNow QR, card, e-wallet', 'Pilih bayaran: tunai, DuitNow QR, kad, e-dompet', { click: '.mpanel .pay' }),
    S('现金：按收到的钱，系统算找钱', 'Cash: tap what you were given; the change is worked out', 'Tunai: tekan wang diterima; baki dikira', { click: '.dialog .paymethods button >> nth=0' }),
    S('按完成，收据自动打印，下一单', 'Done: the receipt prints, next customer', 'Selesai: resit dicetak, pelanggan seterusnya', {
      do: [['click', '.dialog .quick button >> nth=1'], ['click', '.dialog .actions button.primary']] }),
  ], MARKET),
  'till-shift': T(['开班 / 交班', 'Shift', 'Syif'], '/pos/#/pos', [
    S('按班次按钮：开班时输入钱箱的零钱', 'The shift button: enter the float when you open', 'Butang syif: isi wang apungan semasa buka', { click: '.shift-btn' }),
    S('交班时系统算好应有现金，输入数到的', 'At closing it works out the cash; enter what you counted', 'Semasa tutup ia kira tunai; isi yang dikira', { type: ['.dialog input', '200'] }),
    S('短少或多出马上看到，交班单自动打印', 'Short or over shows at once; the slip prints', 'Kurang atau lebih terus nampak; slip dicetak', { key: 'Escape' }),
  ], MARKET),
  'till-no': T(['收银机号码', 'Till number', 'Nombor kaunter'], '/pos/#/pos', [
    S('这里显示这是第几台收银机', 'This shows which till this is', 'Ini menunjukkan kaunter mana', { point: '.till-badge' }),
    S('在「设置 → 这台电脑」可以改名字，例如「1 号柜台」', 'Rename it under Settings → This device, e.g. Counter 1', 'Namakan di Tetapan → Peranti ini, cth. Kaunter 1'),
    S('收据和报表都会写是哪一台', 'Receipts and reports show the till', 'Resit dan laporan menunjukkan kaunter'),
  ], MARKET),
  'till-lock': T(['锁定收银', 'Till lock', 'Kunci kaunter'], '/pos/#/pos', [
    S('「锁定收银」：这台电脑只能用收银', 'Lock till: this computer shows only the till', 'Kunci kaunter: komputer ini hanya kaunter', { click: 'button[data-act="till-lock"]' }),
    S('要输入管理员 email 和密码', 'It takes an admin\'s email and password', 'Perlu e-mel dan kata laluan admin', { key: 'Escape' }),
    S('锁了以后报表、设置都打不开；解锁也要管理员密码', 'Locked, reports and settings stay shut; unlocking needs the password too', 'Bila dikunci, laporan dan tetapan ditutup; buka kunci perlu kata laluan'),
  ], MARKET),
  'till-menu': T(['菜单', 'The menu', 'Menu'], '/pos/#/pos', [
    S('左边是菜单：报表、商品、设置', 'On the left, the menu: reports, items, settings', 'Di kiri, menu: laporan, barang, tetapan', { point: '.side nav' }),
    S('按「<」收起菜单，收银画面更大', 'Press < to fold it away for a bigger till', 'Tekan < untuk lipat, kaunter lebih besar', { click: '.side .side-collapse' }),
    S('左上角按钮再打开', 'The top-left button brings it back', 'Butang kiri atas membukanya semula', { click: '[data-help="menu"]' }),
  ], MARKET),
  'till-search': T(['找商品', 'Finding an item', 'Cari barang'], '/pos/#/pos', [
    S('在搜索框打名字，商品马上筛出来', 'Type in the search box: the items narrow down', 'Taip di kotak carian: barang ditapis', { type: ['.reg-bar input[type=search]', 'Kopi'] }),
    S('点图片加进账单', 'Tap the picture to add it', 'Tekan gambar untuk tambah', { click: '.tile >> nth=0' }),
  ], RETAIL),
  'till-categories': T(['分类', 'Categories', 'Kategori'], '/pos/#/pos', [
    S('上面的分类：饮料、杂货、熟食', 'The categories along the top', 'Kategori di atas', { click: '.chips button >> nth=1' }),
    S('点一个分类，只显示那一类的商品', 'Tap one to show only those items', 'Tekan satu untuk tunjuk barang itu sahaja', { click: '.chips button >> nth=0' }),
  ], RETAIL),
  'till-tiles': T(['点图片卖', 'Tap to sell', 'Tekan untuk jual'], '/pos/#/pos', [
    S('点商品图片，就进右边的账单', 'Tap a picture: it goes on the bill on the right', 'Tekan gambar: masuk ke bil di kanan', { click: '.tile >> nth=0' }),
    S('再点一次就多一件', 'Tap again for one more', 'Tekan lagi untuk satu lagi', { click: '.tile >> nth=0' }),
  ], RETAIL),
  'till-lines': T(['改一行', 'Changing a line', 'Ubah baris'], '/pos/#/pos', [
    S('每一行按 + / − 改数量', '+ / − on a line changes the quantity', '+ / − pada baris mengubah kuantiti', { click: '.tile >> nth=1' }),
    S('点那一行：改价钱、折扣、备注（要有权限）', 'Tap the line: price, discount, note (with permission)', 'Tekan baris: harga, diskaun, nota (dengan kebenaran)', { click: '.ticket .line >> nth=0' }),
    S('删除这一行也在这里', 'Remove the line here too', 'Buang baris di sini juga', { key: 'Escape' }),
  ], RETAIL),
  'till-tables': T(['桌位', 'Tables', 'Meja'], '/pos/#/pos', [
    S('按「桌位」看全部桌子', 'Press Tables to see every table', 'Tekan Meja untuk lihat semua meja', { click: '.reg-bar button:has-text("桌位")' }),
    S('有人坐的显示金额；点一张桌开始点单', 'Busy tables show their bill; tap one to order', 'Meja sibuk tunjuk bil; tekan untuk pesan', { click: '.tables button >> nth=2' }),
  ], FNB),
  'till-kitchen': T(['送厨房', 'Kitchen ticket', 'Tiket dapur'], '/pos/#/pos', [
    S('点好菜，按「送厨房」', 'Add the dishes, press Kitchen', 'Tambah hidangan, tekan Dapur', { click: '.tile:has-text("Nasi Lemak")' }),
    S('只印新点的菜，厨房不会重复做', 'Only what is new prints', 'Hanya yang baharu dicetak', { click: '.buttons button:has-text("送厨房")' }),
  ], FNB),
  'till-order-type': T(['堂食 / 外带 / 外送', 'Dine-in, take-away, delivery', 'Makan sini, bungkus, hantar'], '/pos/#/pos', [
    S('上面选堂食、外带或外送', 'Choose dine-in, take-away or delivery at the top', 'Pilih makan sini, bungkus atau hantar di atas', { click: '.orderinfo .seg button >> nth=1' }),
    S('堂食才收服务费', 'Service charge on dine-in only', 'Caj perkhidmatan untuk makan sini sahaja', { click: '.orderinfo .seg button >> nth=0' }),
  ], FNB),
};

// ------------------------------------------------------ the back office

const SALES = { world: { mode: 'RETAIL', withSales: true } };
const R = (sub, title, steps) => [`pos-reports-${sub}`, T(title, `/pos/#/reports/${sub}`, steps, SALES)];

export const PAGES = Object.fromEntries([
  ['pos-cloud', T(['SuXin Cloud 总览', 'SuXin Cloud', 'SuXin Cloud'], '/pos/#/cloud', [
    S('老板一页看全部：今天销售、单数、平均每单', 'The whole business on one page: today\'s sales, receipts, average', 'Seluruh perniagaan: jualan hari ini, resit, purata', { point: '.dash-part' }),
    S('往下看：低库存、没货、仓库待处理', 'Scroll on: low stock, out of stock, the warehouse', 'Tatal: stok rendah, habis, gudang', { scroll: 500 }),
  ], SALES)],
  R('summary', ['销售总结', 'Sales summary', 'Ringkasan jualan'], [
    S('选日期：今天、昨天、这个月', 'Pick the dates: today, yesterday, this month', 'Pilih tarikh: hari ini, semalam, bulan ini', { point: 'input[type=date] >> nth=0' }),
    S('销售额、毛利、单数、平均每单', 'Sales, gross profit, receipts, average', 'Jualan, untung kasar, resit, purata', { point: '.card >> nth=1' }),
    S('按「导出」变 Excel 给会计', 'Export to Excel for the accountant', 'Eksport ke Excel untuk akauntan', { point: 'button:has-text("导出")' }),
  ]),
  R('items', ['按商品', 'By item', 'Ikut barang'], [
    S('每样商品卖了几件、多少钱、赚多少', 'Each item: how many, how much, the profit', 'Setiap barang: berapa, jumlah, untung', { point: 'table.list' }),
    S('按表头可以排序，看最好卖的', 'Tap a heading to sort: best sellers first', 'Tekan tajuk untuk susun', { point: 'table.list th >> nth=2' }),
  ]),
  R('categories', ['按分类', 'By category', 'Ikut kategori'], [
    S('饮料、杂货、熟食，各卖了多少', 'Drinks, groceries, food: each one\'s sales', 'Minuman, runcit, makanan: jualan masing-masing', { point: 'table.list' }),
  ]),
  R('employees', ['按员工', 'By employee', 'Ikut pekerja'], [
    S('每个收银员收了几单、多少钱', 'Each cashier\'s receipts and takings', 'Resit dan kutipan setiap juruwang', { point: 'table.list' }),
    S('作废和退款也分开算', 'Voids and refunds are counted apart', 'Batal dan pulangan dikira berasingan'),
  ]),
  R('payments', ['按付款方式', 'By payment type', 'Ikut jenis bayaran'], [
    S('现金、QR、刷卡、电子钱包各收多少', 'Cash, QR, card, e-wallet: each counted', 'Tunai, QR, kad, e-dompet: dikira', { point: 'table.list' }),
    S('关店时和银行对账用', 'Use it to match the bank at closing', 'Guna untuk padan dengan bank'),
  ]),
  R('receipts', ['收据', 'Receipts', 'Resit'], [
    S('每一张收据：时间、收银员、金额', 'Every receipt: time, cashier, amount', 'Setiap resit: masa, juruwang, jumlah', { point: 'table.list' }),
    S('点一张可以重印或作废；作废要写原因', 'Open one to reprint or void; a void needs a reason', 'Buka untuk cetak semula atau batal; batal perlu sebab', { click: 'table.list tr.click >> nth=0' }),
  ]),
  R('modifiers', ['按加料', 'By modifier', 'Ikut pilihan'], [
    S('加蛋、少糖这些加料，各点了几次', 'Extra egg, less sugar: how often each was chosen', 'Tambah telur, kurang gula: kekerapan', { point: 'table.list' }),
  ]),
  R('discounts', ['按折扣', 'By discount', 'Ikut diskaun'], [
    S('每种折扣用了几次、减了多少钱', 'Each discount: how often and how much', 'Setiap diskaun: kekerapan dan jumlah', { point: 'table.list' }),
  ]),
  R('taxes', ['税务报表', 'Taxes', 'Cukai'], [
    S('每个税率收了多少，不收税的分开列', 'Each tax rate, with tax-free sales apart', 'Setiap kadar cukai, tanpa cukai berasingan', { point: 'table.list' }),
    S('报 SST 时直接用', 'Use it for the SST return', 'Guna untuk penyata SST'),
  ]),
  R('shifts', ['班次报表', 'Shifts', 'Syif'], [
    S('每一班：谁开的、卖多少、短少或多出', 'Each shift: who, sales, short or over', 'Setiap syif: siapa, jualan, kurang atau lebih', { point: 'h1' }),
  ]),
  R('einvoice', ['电子发票', 'E-invoice', 'E-invois'], [
    S('选月份：一般顾客的收据合并成一张电子发票', 'Pick the month: receipts to ordinary buyers become one e-invoice', 'Pilih bulan: resit pembeli biasa jadi satu e-invois', { point: 'input[type=month]' }),
    S('下载 JSON 上传到 MyInvois，或 CSV 给会计', 'Download JSON for MyInvois, or CSV', 'Muat turun JSON untuk MyInvois, atau CSV'),
  ]),
  ['pos-items-list', T(['商品清单', 'Item list', 'Senarai barang'], '/pos/#/items/list', [
    S('全部商品：照片、售价、成本、税', 'Every item: photo, price, cost, tax', 'Semua barang: gambar, harga, kos, cukai', { point: 'table.list' }),
    S('「新增商品」：扫条码，没有就按「生成」', 'Add item: scan the barcode, or Generate one', 'Tambah barang: imbas kod bar, atau Jana', { point: 'button:has-text("新增商品")' }),
    S('「批量设定税」「价格标签」也在这里', 'Set taxes for many and price labels are here too', 'Cukai beramai dan label harga juga di sini', { point: 'button:has-text("价格标签")' }),
  ], RETAIL)],
  ['pos-items-categories', T(['商品分类', 'Categories', 'Kategori'], '/pos/#/items/categories', [
    S('开几个分类：饮料、杂货、熟食，选颜色', 'Make a few categories and pick colours', 'Buat kategori dan pilih warna', { point: 'button.primary' }),
    S('收银画面上面会按分类显示', 'The till shows them along the top', 'Kaunter menunjukkannya di atas'),
  ], RETAIL)],
  ['pos-items-modifiers', T(['加料 / 选项', 'Modifiers', 'Pilihan'], '/pos/#/items/modifiers', [
    S('甜度、加蛋这些选项在这里开', 'Set up sugar level, extra egg and so on here', 'Sediakan tahap gula, tambah telur di sini', { point: 'button.primary' }),
    S('可以设加钱；再到商品里勾要用的', 'They can add a price; tick them on the item', 'Boleh tambah harga; tanda pada barang'),
  ], RETAIL)],
  ['pos-items-discounts', T(['折扣设定', 'Discounts', 'Diskaun'], '/pos/#/items/discounts', [
    S('新增折扣：百分比或固定金额', 'Add a discount: a percentage or an amount', 'Tambah diskaun: peratus atau jumlah', { point: 'button.primary' }),
    S('收银时按「折扣」就能用', 'Use it with Discount at the till', 'Guna dengan Diskaun di kaunter'),
  ], RETAIL)],
  ['pos-inventory-levels', T(['库存数量', 'Stock levels', 'Paras stok'], '/pos/#/inventory/levels', [
    S('每样商品现在有多少，按分店看', 'What each item has now, by branch', 'Baki setiap barang, ikut cawangan', { point: 'table.list' }),
    S('低于补货点的会标出来', 'Below the reorder point is marked', 'Di bawah paras pesan ditanda'),
  ], RETAIL)],
  ['pos-inventory-adjust', T(['调整库存', 'Adjust stock', 'Laras stok'], '/pos/#/inventory/adjust', [
    S('扫商品，选减少、增加或改成实际数量', 'Scan, then less, more or set to actual', 'Imbas, kemudian kurang, tambah atau sebenar', { point: '.card' }),
    S('一定要选原因；每一笔都记录', 'Always a reason; every change is logged', 'Sentiasa sebab; setiap perubahan direkod'),
  ], RETAIL)],
  ['pos-inventory-purchase', T(['采购单', 'Purchase orders', 'Pesanan belian'], '/pos/#/inventory/purchase', [
    S('采购单、收货在 SuXin Warehouse 做', 'Purchase orders and receiving are in SuXin Warehouse', 'Pesanan dan terima barang di SuXin Warehouse', { point: '.card' }),
    S('按这里打开仓库系统，同一个账号', 'Open the warehouse from here, same account', 'Buka gudang dari sini, akaun sama'),
  ], RETAIL)],
  ['pos-inventory-transfers', T(['调货', 'Transfers', 'Pindahan'], '/pos/#/inventory/transfers', [
    S('分店之间调货也在 SuXin Warehouse', 'Transfers between branches are in SuXin Warehouse', 'Pindahan antara cawangan di SuXin Warehouse', { point: '.card' }),
  ], RETAIL)],
  ['pos-inventory-suppliers', T(['供应商', 'Suppliers', 'Pembekal'], '/pos/#/inventory/suppliers', [
    S('供应商资料在 SuXin Warehouse 管理', 'Suppliers are kept in SuXin Warehouse', 'Pembekal diurus di SuXin Warehouse', { point: '.card' }),
  ], RETAIL)],
  ['pos-employees', T(['员工', 'Employees', 'Pekerja'], '/pos/#/employees', [
    S('每个员工的角色和分店', 'Each person\'s role and branch', 'Peranan dan cawangan setiap orang', { point: 'table.list' }),
    S('「新增员工」：名字、email、密码、角色', 'Add employee: name, email, password, role', 'Tambah pekerja: nama, e-mel, kata laluan, peranan', { point: 'button:has-text("新增员工")' }),
    S('员工也可以自己用公司代码加入', 'Staff can also join with the company code', 'Pekerja boleh sertai dengan kod syarikat'),
  ], RETAIL)],
  ['pos-customers', T(['顾客', 'Customers', 'Pelanggan'], '/pos/#/customers', [
    S('顾客清单：电话、积分、来了几次', 'Customers: phone, points, visits', 'Pelanggan: telefon, mata, lawatan', { point: 'table.list' }),
    S('「新增顾客」：名字、电话、会员卡', 'Add customer: name, phone, member card', 'Tambah pelanggan: nama, telefon, kad ahli', { point: 'button:has-text("新增顾客")' }),
    S('要删除资料（PDPA）：打开顾客按删除', 'To remove (PDPA): open them, Remove', 'Untuk buang (PDPA): buka, Buang'),
  ], RETAIL)],
  ['pos-integrations-tokens', T(['访问令牌', 'Access tokens', 'Token akses'], '/pos/#/integrations/tokens', [
    S('别的系统要读你的资料：开一个令牌', 'For another system: create a token', 'Untuk sistem lain: buat token', { point: 'button.primary' }),
    S('令牌只显示一次；不用了按撤销', 'Shown once; revoke it when done', 'Ditunjuk sekali; batalkan bila selesai'),
  ], RETAIL)],
  ['pos-integrations-api', T(['API 说明', 'The API', 'API'], '/pos/#/integrations/api', [
    S('给程序员看：商品、库存、收据、顾客怎样读写', 'For a developer: items, stock, receipts, customers', 'Untuk pembangun: barang, stok, resit, pelanggan', { point: '.card' }),
  ], RETAIL)],
  ['pos-profile', T(['我的 Profile', 'Profile', 'Profil'], '/pos/#/profile', [
    S('你的名字、公司、角色；管理员看到公司代码', 'Your name, company, role; admins see the company code', 'Nama, syarikat, peranan; admin nampak kod syarikat', { point: '.prof >> nth=0' }),
    S('换收银模式：管理员按这里，再输入密码', 'Change the till mode: admins, with the password', 'Tukar mod kaunter: admin, dengan kata laluan', { point: 'button[data-act="change-mode"]' }),
  ], RETAIL)],
  ['pos-settings-features', T(['功能', 'Features', 'Ciri'], '/pos/#/settings/features', [
    S('收银模式、桌位名字、送厨房', 'Till mode, table names, kitchen tickets', 'Mod kaunter, nama meja, tiket dapur', { point: '.card' }),
    S('「收钱前要开班」也在这里开', 'Require a shift before taking money is here too', 'Wajib syif sebelum terima wang juga di sini'),
  ], RETAIL)],
  ['pos-settings-payments', T(['付款方式', 'Payment types', 'Jenis bayaran'], '/pos/#/settings/payments', [
    S('现金、DuitNow QR、刷卡、电子钱包，勾要用的', 'Tick cash, DuitNow QR, card, e-wallet', 'Tanda tunai, DuitNow QR, kad, e-dompet', { point: '.card' }),
    S('QR 和刷卡用银行的机器收，这里只记录', 'QR and card use the bank\'s terminal; this records them', 'QR dan kad guna terminal bank; ini merekod'),
  ], RETAIL)],
  ['pos-settings-taxes', T(['税和服务费', 'Taxes & service charge', 'Cukai & caj'], '/pos/#/settings/taxes', [
    S('注册了 SST 才加税；大部分商品的勾「默认」', 'Add SST only if registered; tick default', 'Tambah SST jika berdaftar; tanda lalai', { point: '.card' }),
    S('服务费：堂食才收', 'Service charge: dine-in only', 'Caj perkhidmatan: makan sini sahaja'),
  ], RETAIL)],
  ['pos-settings-loyalty', T(['会员积分', 'Loyalty', 'Mata ganjaran'], '/pos/#/settings/loyalty', [
    S('每 RM1 得几分、几分可以抵钱', 'Points per ringgit, and what they are worth', 'Mata setiap ringgit, dan nilainya', { point: '.card' }),
  ], RETAIL)],
  ['pos-settings-receipt', T(['收据设定', 'Receipt', 'Resit'], '/pos/#/settings/receipt', [
    S('店名、地址、电话、SST 号码', 'Shop name, address, phone, SST number', 'Nama kedai, alamat, telefon, no. SST', { point: '.card' }),
    S('纸宽 58 或 80mm、底下的谢谢语', 'Paper 58 or 80 mm, the thank-you line', 'Kertas 58 atau 80 mm, ucapan terima kasih'),
  ], RETAIL)],
  ['pos-settings-stores', T(['分店', 'Stores', 'Kedai'], '/pos/#/settings/stores', [
    S('全部分店和仓库', 'Every shop and warehouse', 'Semua kedai dan gudang', { point: 'table.list' }),
    S('管理员按「新增分店」加门店或仓库', 'Admins: Add branch for a shop or warehouse', 'Admin: Tambah cawangan', { point: 'button[data-act="branch-add"]' }),
    S('关闭的分店会保留记录', 'A closed branch keeps its records', 'Cawangan ditutup kekal rekodnya'),
  ], RETAIL)],
  ['pos-settings-device', T(['这台电脑', 'This device', 'Peranti ini'], '/pos/#/settings/device', [
    S('这台收银机属于哪间分店、第几号', 'Which branch and which till this is', 'Cawangan dan nombor kaunter ini', { point: '.card >> nth=0' }),
    S('连接 USB 收据打印机和钱箱', 'Connect a USB receipt printer and drawer', 'Sambung pencetak resit USB dan laci', { scroll: 400 }),
  ], RETAIL)],
  ['pos-settings-notify', T(['通知和机器人', 'Notifications & bot', 'Pemberitahuan & bot'], '/pos/#/settings/notify', [
    S('连接 Telegram：问库存和销售', 'Connect Telegram to ask about stock and sales', 'Sambung Telegram untuk tanya stok dan jualan', { point: 'button[data-act="tg-connect"]' }),
    S('每天早上 8 点：email 或手机通知收报告', 'Every morning at 8: the report by email or notification', 'Setiap pagi jam 8: laporan melalui e-mel atau pemberitahuan', { scroll: 400 }),
  ], RETAIL)],
  ['pos-settings-addons', T(['附加功能', 'Add-ons', 'Tambahan'], '/pos/#/settings/addons', [
    S('你的配套有什么、还可以加什么', 'What your plan has, and what can be added', 'Apa pakej anda ada, dan apa boleh ditambah', { point: '.addon >> nth=0' }),
  ], RETAIL)],

  // ------------------------------------------------------- the warehouse
  ['wh-home', T(['仓库首页', 'Warehouse home', 'Utama gudang'], '/warehouse/', [
    S('今天要做的事：待收货、待审批、在途', 'Today\'s jobs: to receive, to approve, in transit', 'Tugas hari ini: terima, lulus, dalam perjalanan', { point: '.wh-tile >> nth=0' }),
    S('左下「现在在」选你在哪个地点', 'Bottom left: choose where you are', 'Bawah kiri: pilih lokasi anda', { point: 'select >> nth=-1' }),
  ], { world: { branch: 'gudang' } })],
  ['wh-receive', T(['收货', 'Receiving', 'Terima'], '/warehouse/#/receive', [
    S('选这批货的采购单', 'Pick the purchase order for the delivery', 'Pilih pesanan untuk penghantaran', { point: '.wh-card >> nth=0' }),
    S('一样一样扫，坏了的写损坏，按完成', 'Scan each item, note damage, Complete', 'Imbas setiap barang, catat rosak, Selesai'),
  ], { world: { branch: 'gudang' } })],
  ['wh-transfers', T(['调货', 'Transfers', 'Pindahan'], '/warehouse/#/transfers', [
    S('新调货：从哪里送去哪里，扫要送的货', 'New transfer: from, to, scan what goes', 'Pindahan baharu: dari, ke, imbas', { point: 'button.primary' }),
    S('「待我收」：别的地点送来的货', 'To receive: what others sent you', 'Untuk diterima: dihantar kepada anda', { point: '.wh-tabs' }),
  ], { world: { branch: 'gudang' } })],
  ['wh-adjust', T(['调整库存', 'Adjust stock', 'Laras stok'], '/warehouse/#/adjust', [
    S('扫商品，选原因：损坏、过期、丢失、找到', 'Scan, choose a reason: damaged, expired, lost, found', 'Imbas, pilih sebab: rosak, luput, hilang, jumpa', { point: '.wh-scan' }),
    S('之前之后多少、谁改的，全部记录', 'Before, after and who: all kept', 'Sebelum, selepas dan siapa: semua disimpan'),
  ], { world: { branch: 'gudang' } })],
  ['wh-stock', T(['库存', 'Stock', 'Stok'], '/warehouse/#/stock', [
    S('现有、在途、订购中、可用、价值', 'On hand, in transit, on order, available, value', 'Ada, dalam perjalanan, dipesan, tersedia, nilai', { point: 'table.wh-stock' }),
    S('点商品看「为什么是这个数」', 'Open an item to see why it is that number', 'Buka barang untuk lihat sebabnya', { click: 'table.wh-stock tr >> nth=1' }),
  ], { world: { branch: 'gudang' } })],
  ['wh-purchase', T(['采购单', 'Purchase orders', 'Pesanan belian'], '/warehouse/#/purchase', [
    S('草稿、待批准、已下单、已收货', 'Draft, to approve, ordered, received', 'Draf, untuk lulus, dipesan, diterima', { point: '.wh-tabs' }),
    S('补货建议：低于补货点的，自动算要订多少', 'Reorder: how much to order, worked out', 'Tambah stok: berapa perlu dipesan'),
  ], { world: { branch: 'gudang' } })],
  ['wh-online', T(['网购进货', 'Online purchases', 'Belian dalam talian'], '/warehouse/#/online', [
    S('拼多多、淘宝、Shopee、TikTok 的订单贴进来', 'Paste an order from Pinduoduo, Taobao, Shopee, TikTok', 'Tampal pesanan dari Pinduoduo, Taobao, Shopee, TikTok', { point: 'textarea' }),
    S('按「读取订单」，变成采购单', 'Read the order: it becomes a purchase order', 'Baca pesanan: jadi pesanan belian'),
  ], { world: { branch: 'gudang' } })],
  ['wh-suppliers', T(['供应商', 'Suppliers', 'Pembekal'], '/warehouse/#/suppliers', [
    S('供应商：电话、联络人、付款条件', 'Suppliers: phone, contact, terms', 'Pembekal: telefon, hubungan, terma', { point: 'table.list' }),
  ], { world: { branch: 'gudang' } })],
  ['wh-variance', T(['盘点差异', 'Count differences', 'Beza kiraan'], '/warehouse/#/variance', [
    S('每次盘点和账面差多少、值多少钱', 'Each count against the books, and what it is worth', 'Setiap kiraan berbanding buku, dan nilainya', { point: 'table.list' }),
  ], { world: { branch: 'gudang' } })],
  ['wh-places', T(['仓库和分店', 'Places', 'Lokasi'], '/warehouse/#/places', [
    S('每个地点库存分开算；管理员可以新增', 'Each place keeps its own stock; admins add more', 'Setiap lokasi stok sendiri; admin boleh tambah', { point: 'table.list' }),
  ], { world: { branch: 'gudang' } })],
  ['wh-audit', T(['操作记录', 'Audit log', 'Log audit'], '/warehouse/#/audit', [
    S('每一次修改：谁、什么时候、改了什么', 'Every change: who, when, what', 'Setiap perubahan: siapa, bila, apa', { point: 'h1' }),
    S('没有人能改或删', 'Nobody can change or delete them', 'Tiada siapa boleh ubah atau padam'),
  ], { world: { branch: 'gudang' } })],

  // ------------------------------------------- SuXin Count on the web
  ['cnt-list', T(['我的盘点', 'My counts', 'Kiraan saya'], '/count/', [
    S('全部盘点：编号、区域、件数、状态', 'Every count: number, area, items, status', 'Semua kiraan: nombor, kawasan, barang, status', { point: '.cnt-list' }),
    S('按「新盘点」开始', 'New count to start', 'Kiraan baharu untuk mula', { point: 'button:has-text("新盘点")' }),
  ], { world: {} })],
  ['cnt-new', T(['新盘点', 'New count', 'Kiraan baharu'], '/count/#/new', [
    S('选分店，写区域（例如 Rak 3）', 'Pick the branch, write the area (e.g. Rak 3)', 'Pilih cawangan, tulis kawasan (cth. Rak 3)', { type: ['form input >> nth=0', 'Rak 3'] }),
    S('按开始，就可以扫了', 'Start, then scan', 'Mula, kemudian imbas', { point: 'form button.primary' }),
  ], { world: {} })],
  ['cnt-count', T(['盘点中', 'Counting', 'Mengira'], '/count/#/new', [
    S('扫一次就是一个；很多的先输入数量再扫', 'Each scan is one; for many, type the quantity first', 'Setiap imbasan satu; untuk banyak, taip kuantiti dahulu', { type: ['form input >> nth=0', 'Rak 3'], click: 'form button.primary' }),
    S('按数字可以直接改', 'Tap a number to change it', 'Tekan nombor untuk ubah', { click: 'input.scan', scan: 'malt' }),
    S('全部数好按「完成」', 'Finish when everything is counted', 'Selesai bila semua dikira', { point: 'button[data-act="finish"]' }),
  ], { world: {} })],

  // ---------------------------------------------------- the app centre
  ['hub', T(['应用中心', 'The app centre', 'Pusat aplikasi'], '/app/', [
    S('你的配套有的 app 可以打开，没买的锁着', 'The apps in your plan open; the rest are locked', 'Aplikasi dalam pakej anda dibuka; lain dikunci', { point: '.hub-app >> nth=0' }),
    S('每个 app 上面都可以随时切换', 'Switch apps from the top of any app', 'Tukar aplikasi dari atas mana-mana aplikasi'),
  ], { world: {} })],
]);

export const HELP = { ...TILL, ...PAGES };

/** The video of [key]: /videos/help/<key>.webm (filmed by tools/videos/pages.mjs). */
export const helpVideo = (key) => `/videos/help/${key}.webm?v=1`;
