/**
 * Words on the website, in the three languages the app speaks.
 * A key missing in one language falls back to English, then to the key.
 */
import { local } from './dom.js';

export const LANGS = [['zh', '中文'], ['en', 'English'], ['ms', 'Bahasa Melayu']];

const en = {
  // shell & sign in
  signIn: 'Sign in', signInHint: 'Use the same email and password as the Stock Check app.', email: 'Email', password: 'Password',
  forgotPassword: 'Forgot password?', enterEmailFirst: 'Type your email first.', resetSent: 'Password reset email sent.',
  signOut: 'Sign out', loading: 'Loading…', branch: 'Branch', mainShop: 'Main shop',
  errWrongPassword: 'Wrong email or password.', errTooMany: 'Too many tries. Wait a minute and try again.',
  errNetwork: 'No internet connection.', errNoCompany: 'This account is not part of a company yet. Sign up in the Stock Check app first.',
  errInactive: 'This account has been switched off by your admin.', errNoPosPermission: 'Your role has no POS permissions. Ask your admin to switch them on under Employees → Access rights.',
  errPage: 'This page could not open', errLoad: 'Could not load',
  navRegister: 'Register', navReports: 'Reports', navItems: 'Items', navInventory: 'Inventory', navEmployees: 'Employees', navSettings: 'Settings',
  repSummary: 'Sales summary', repItems: 'Sales by item', repCategories: 'Sales by category', repEmployees: 'Sales by employee',
  repPayments: 'Sales by payment type', repReceipts: 'Receipts', repModifiers: 'Sales by modifier', repDiscounts: 'Discounts', repTaxes: 'Taxes',
  itemList: 'Item list', itemCategories: 'Categories', itemModifiers: 'Modifiers', itemDiscounts: 'Discounts',
  setFeatures: 'Features', setPayments: 'Payment types', setTaxes: 'Taxes & service charge', setReceipt: 'Receipt', setStores: 'Stores', setDevice: 'This device',
  // register
  searchProducts: 'Search name, barcode or SKU', scanHere: 'Scan or type a barcode, then Enter', offlineNote: 'Offline — sales are kept on this computer and sent when the internet is back.',
  tables: 'Tables', openTickets: 'Open tickets', all: 'All', noMatch: 'Nothing matches.', noProductsYet: 'No items yet. Add them under Items → Item list.',
  noPrice: 'Set price', notFound: 'Not found', enterPrice: 'Price', errAmount: 'Enter an amount like 12.50.', errQty: 'Enter a quantity above 0.',
  weight: 'Weight', ok: 'OK', cancel: 'Cancel', required: 'required', choose: 'Choose', add: 'Add',
  subtotal: 'Subtotal', serviceCharge: 'Service charge', tax: 'Tax', included: 'incl.', total: 'Total', discount: 'Discount',
  sendKitchen: 'Kitchen', saveTicket: 'Save', clear: 'Clear', charge: 'Charge', emptyTicket: 'Scan or tap an item to start.',
  savedTicket: 'Saved ticket', table: 'Table', quantity: 'Quantity', unitPrice: 'Unit price', lineDiscount: 'Item discount', note: 'Note',
  notePlaceholder: 'Less sugar, no onion…', alreadySent: 'Already sent to the kitchen.', remove: 'Remove', save: 'Save', apply: 'Apply',
  deleteTicketQ: 'Delete this saved ticket?', clearTicketQ: 'Clear this sale?', delete: 'Delete', ticketSaved: 'Ticket saved.',
  sentKitchen: 'Sent to the kitchen.', unsavedTicketQ: 'Save the current sale as a ticket first?', free: 'Free', close: 'Close',
  itemsCount: 'items', noOpenTickets: 'No open tickets.', kitchenTicket: 'KITCHEN',
  order_RETAIL: 'Retail', order_DINE_IN: 'Dine in', order_TAKEAWAY: 'Take away', order_DELIVERY: 'Delivery',
  // pay
  completeSale: 'Complete sale', exact: 'Exact', due: 'Due', change: 'Change', rounding: 'Rounding', addPayment: 'Add',
  errOverpay: 'Only cash can be more than the amount due.', errSaleNotSaved: 'The server refused sale', paid: 'Paid', printReceipt: 'Print receipt', newSale: 'New sale',
  receiptNo: 'Receipt', date: 'Date', cashier: 'Cashier', orderType: 'Type', customer: 'Customer', voided: 'VOIDED',
  CASH: 'Cash', QR: 'DuitNow QR', CARD: 'Card', EWALLET: 'E-wallet', TRANSFER: 'Bank transfer',
  // items
  allCategories: 'All categories', noCategory: 'No category', noName: '(no name)', inactive: 'Off', showingFirst500: 'Showing the first 500 — search to narrow down.',
  addItem: 'Add item', editItem: 'Edit item', name: 'Name', category: 'Category', price: 'Price', cost: 'Cost', unit: 'Unit', barcode: 'Barcode',
  scanOrType: 'Scan or type', priceBlankHint: 'Blank = ask at the till', altBarcodes: 'Other barcodes', altBarcodesHint: 'Comma between codes',
  generate: 'Generate', choosePhoto: 'Choose photo', removePhoto: 'Remove photo', errPhoto: 'That picture could not be read.',
  errBarcode: 'A barcode is needed. Use Generate for items without one.', errBarcodeSlash: 'A barcode cannot contain “/”.',
  errName: 'A name is needed.', errBarcodeTaken: 'That barcode already belongs to another item.', errBelongsTo: 'already belongs to',
  saved: 'Saved.', trackStock: 'Track stock (untick for dishes made to order)', activeForSale: 'Available for sale', deleteItemQ: 'Delete this item? Its sales history stays.',
  addCategory: 'Add category', editCategory: 'Edit category', noCategoriesYet: 'No categories yet.',
  addModifier: 'Add modifier', editModifier: 'Edit modifier', modifierNameHint: 'e.g. Size, Sugar level, Add-ons', optionName: 'Option', addOption: 'Add option',
  modRequired: 'Must choose at least one', modMultiple: 'Can choose more than one', errModifier: 'A name and at least one option are needed.',
  modifiersHelp: 'Modifiers are options asked when an item is sold, like size or extra egg. Attach them to items in the item list.',
  noModifiersYet: 'No modifiers yet.', addDiscount: 'Add discount', editDiscount: 'Edit discount', percent: 'Percentage', amount: 'Amount',
  type: 'Type', value: 'Value', errDiscount: 'Give a name and a value (1–100% or an amount).', noDiscountsYet: 'No discounts yet.',
  // reports
  allBranches: 'All branches', allEmployees: 'All employees', today: 'Today', yesterday: 'Yesterday', last7: '7 days', last30: '30 days',
  exportCsv: 'Export', ownSalesOnly: 'Showing your own sales. Reports for everyone need the “View sales reports” permission.',
  noSalesInPeriod: 'No sales in this period.', grossSales: 'Gross sales', discounts: 'Discounts', netSales: 'Net sales', grossProfit: 'Gross profit',
  receiptsCount: 'Receipts', averageSale: 'Average sale', voidedSales: 'Voided', profitNote: '* Some items have no cost set, so profit counts them as free.',
  hour: 'Hour', qtySold: 'Qty sold', employee: 'Employee', paymentType: 'Payment type', transactions: 'Transactions', modifier: 'Modifier', option: 'Option',
  timesUsed: 'Times used', taxableSales: 'Taxable sales', status: 'Status', voidedBy: 'Voided by', voidSale: 'Void sale', reason: 'Reason',
  voidReasonHint: 'Wrong item, customer changed mind…', voidExplain: 'The receipt stays on record, marked VOIDED, and the stock goes back.',
  errReason: 'Give a reason.', voidConfirm: 'Void this sale? This cannot be undone.', saleVoided: 'Sale voided.',
  // settings
  settingsReadOnly: 'Only someone with “Manage prices, products and register settings” can change these.',
  businessType: 'Type of business', mode_RETAIL: 'Retail / supermarket / warehouse', mode_FNB: 'Restaurant / café (F&B)', mode_BOTH: 'Both',
  modeHelp: 'Restaurant mode adds tables, dine-in / take-away, kitchen tickets and service charge.', kitchenTicketOpt: 'Print kitchen tickets',
  tableNames: 'Tables', tableNamesHelp: 'Comma between names, e.g. 1, 2, 3, A1, Bar.', customPayments: 'Other payment types',
  errNoPayment: 'Choose at least one payment type.', taxName: 'Tax name', taxRate: 'Rate (%)', taxMode: 'Prices', pricesInclude: 'Prices already include tax',
  pricesExclude: 'Tax is added on top', serviceChargeRate: 'Service charge (%)', serviceChargeHelp: 'Charged on dine-in only. 0 to switch off.',
  errPercent: 'Rates are between 0 and 100.', shopName: 'Shop name', regNo: 'Company reg. no.', sstNo: 'SST no.', address: 'Address', phone: 'Phone',
  receiptFooter: 'Receipt footer', paperWidth: 'Paper width', autoPrint: 'Print the receipt after every sale',
  storesHelp: 'Branches are added in the Stock Check app (Profile → Branches). Each till sells for one branch, chosen under This device.',
  closed: 'Closed', thisTill: 'This till', tillBranch: 'This till sells for', printerSetup: 'Receipt printer',
  printerSteps: 'Install the printer\'s driver on this computer and print a test page from Windows.\nMake it the default printer.\nIn the print box, choose paper size 80 mm (or 58 mm) and no margins, and tick “Headers and footers” off.\nFor printing without the print box every time, start Chrome with --kiosk-printing (ask us, we will set it up).',
  scannerSetup: 'Barcode scanner', scannerHelp: 'A USB scanner works by itself: plug it in and scan on the Register page. It types the barcode and presses Enter.',
  // inventory & employees
  inventoryHelp: 'Goods received and stock written off here are added to the stock levels in the Stock Check app. Sales from the register come off automatically.',
  stockAdjustment: 'Stock adjustment', product: 'Item', noteRefHint: 'Supplier / DO number / reason', recentMovements: 'Last 30 days',
  source: 'Source', noStockPermission: 'Recording stock needs the “Record goods in/out” permission.',
  move_RECEIVE: 'Goods received', move_WRITE_OFF: 'Write-off', move_SALE: 'Sale', move_REFUND: 'Return',
  employeesHelp: 'Staff sign in with the same account as the Stock Check app. Add new staff in the app: Profile → Users.',
  employeeList: 'Employee list', accessRights: 'Access rights', role: 'Role',
  perm_POS_SELL: 'Use the register', perm_POS_VOID: 'Void sales', perm_POS_MANAGE: 'Manage items & settings', perm_POS_REPORTS: 'View reports',
};

const zh = {
  signIn: '登录', signInHint: '用 Stock Check app 的同一个 email 和密码。', email: 'Email', password: '密码',
  forgotPassword: '忘记密码？', enterEmailFirst: '先输入 email。', resetSent: '已发送重设密码的 email。',
  signOut: '退出登录', loading: '加载中…', branch: '分店', mainShop: '总店',
  errWrongPassword: 'Email 或密码不对。', errTooMany: '试太多次了，等一分钟再试。', errNetwork: '没有网络。',
  errNoCompany: '这个账号还没有加入公司，请先在 Stock Check app 注册。', errInactive: '这个账号已被管理员停用。',
  errNoPosPermission: '你的角色没有收银权限。请管理员在「员工 → 权限」打开。', errPage: '这个页面打不开', errLoad: '读取失败',
  navRegister: '收银', navReports: '报表', navItems: '商品', navInventory: '库存管理', navEmployees: '员工', navSettings: '设置',
  repSummary: '销售总结', repItems: '按商品', repCategories: '按分类', repEmployees: '按员工', repPayments: '按付款方式',
  repReceipts: '收据', repModifiers: '按加料', repDiscounts: '折扣', repTaxes: '税',
  itemList: '商品清单', itemCategories: '分类', itemModifiers: '加料 / 选项', itemDiscounts: '折扣',
  setFeatures: '功能', setPayments: '付款方式', setTaxes: '税和服务费', setReceipt: '收据', setStores: '分店', setDevice: '这台电脑',
  searchProducts: '搜索名称、条码或 SKU', scanHere: '扫条码或输入条码后按 Enter', offlineNote: '没有网络 — 销售会先存在这台电脑，网络回来后自动上传。',
  tables: '桌位', openTickets: '未结单', all: '全部', noMatch: '找不到。', noProductsYet: '还没有商品。到「商品 → 商品清单」新增。',
  noPrice: '未定价', notFound: '找不到商品', enterPrice: '价格', errAmount: '请输入金额，例如 12.50。', errQty: '请输入大于 0 的数量。',
  weight: '重量', ok: '确定', cancel: '取消', required: '必选', choose: '请选择', add: '加入',
  subtotal: '小计', serviceCharge: '服务费', tax: '税', included: '已含', total: '总计', discount: '折扣',
  sendKitchen: '送厨房', saveTicket: '存单', clear: '清除', charge: '收款', emptyTicket: '扫条码或点商品开始。',
  savedTicket: '已存的单', table: '桌', quantity: '数量', unitPrice: '单价', lineDiscount: '单项折扣', note: '备注',
  notePlaceholder: '少糖、不要葱…', alreadySent: '已经送去厨房了。', remove: '删除', save: '保存', apply: '套用',
  deleteTicketQ: '删除这张存单？', clearTicketQ: '清除这单？', delete: '删除', ticketSaved: '已存单。',
  sentKitchen: '已送厨房。', unsavedTicketQ: '先把现在这单存起来？', free: '空', close: '关闭',
  itemsCount: '样', noOpenTickets: '没有未结单。', kitchenTicket: '厨房单',
  order_RETAIL: '零售', order_DINE_IN: '堂食', order_TAKEAWAY: '外带', order_DELIVERY: '外送',
  completeSale: '完成交易', exact: '刚好', due: '还欠', change: '找钱', rounding: '四舍五入', addPayment: '加入',
  errOverpay: '只有现金可以多付（找钱）。', errSaleNotSaved: '服务器拒绝了这笔销售', paid: '已付款', printReceipt: '打印收据', newSale: '下一单',
  receiptNo: '收据号', date: '日期', cashier: '收银员', orderType: '类型', customer: '顾客', voided: '已作废',
  CASH: '现金', QR: 'DuitNow QR', CARD: '刷卡', EWALLET: '电子钱包', TRANSFER: '银行转账',
  allCategories: '所有分类', noCategory: '没有分类', noName: '（没有名字）', inactive: '停售', showingFirst500: '只显示前 500 个，请用搜索。',
  addItem: '新增商品', editItem: '编辑商品', name: '名称', category: '分类', price: '售价', cost: '成本', unit: '单位', barcode: '条码',
  scanOrType: '扫描或输入', priceBlankHint: '留空 = 收银时才输入', altBarcodes: '其他条码', altBarcodesHint: '多个条码用逗号隔开',
  generate: '自动生成', choosePhoto: '选择照片', removePhoto: '删除照片', errPhoto: '这张照片读取不了。',
  errBarcode: '需要条码。没有条码的商品按「自动生成」。', errBarcodeSlash: '条码不能有「/」。',
  errName: '需要名称。', errBarcodeTaken: '这个条码已经是别的商品的。', errBelongsTo: '已经属于',
  saved: '已保存。', trackStock: '追踪库存（现做的菜不用勾）', activeForSale: '可以卖', deleteItemQ: '删除这个商品？以前的销售记录会保留。',
  addCategory: '新增分类', editCategory: '编辑分类', noCategoriesYet: '还没有分类。',
  addModifier: '新增加料', editModifier: '编辑加料', modifierNameHint: '例如：大小、甜度、加料', optionName: '选项', addOption: '加选项',
  modRequired: '一定要选一个', modMultiple: '可以选多个', errModifier: '需要名称和至少一个选项。',
  modifiersHelp: '加料 / 选项是卖商品时要问的，例如大小、加蛋。在商品清单里把它们加到商品上。',
  noModifiersYet: '还没有加料。', addDiscount: '新增折扣', editDiscount: '编辑折扣', percent: '百分比', amount: '金额',
  type: '类型', value: '数值', errDiscount: '请填名称和数值（1–100% 或金额）。', noDiscountsYet: '还没有折扣。',
  allBranches: '所有分店', allEmployees: '所有员工', today: '今天', yesterday: '昨天', last7: '7 天', last30: '30 天',
  exportCsv: '导出', ownSalesOnly: '只显示你自己的销售。看全部需要「查看销售报表」权限。',
  noSalesInPeriod: '这段时间没有销售。', grossSales: '总销售额', discounts: '折扣', netSales: '净销售额', grossProfit: '毛利',
  receiptsCount: '单数', averageSale: '平均每单', voidedSales: '作废', profitNote: '* 有些商品没有填成本，毛利把它们当作成本 0。',
  hour: '时段', qtySold: '卖出数量', employee: '员工', paymentType: '付款方式', transactions: '笔数', modifier: '加料', option: '选项',
  timesUsed: '使用次数', taxableSales: '应税金额', status: '状态', voidedBy: '作废人', voidSale: '作废这单', reason: '原因',
  voidReasonHint: '打错商品、顾客不要了…', voidExplain: '收据会保留，标记为「已作废」，库存会加回去。',
  errReason: '请写原因。', voidConfirm: '确定作废？作废后不能恢复。', saleVoided: '已作废。',
  settingsReadOnly: '只有有「管理价格、商品和收银设置」权限的人可以改。',
  businessType: '生意类型', mode_RETAIL: '零售 / 超市 / 仓库', mode_FNB: '餐厅 / 咖啡店（餐饮）', mode_BOTH: '两种都有',
  modeHelp: '餐饮模式会多出桌位、堂食 / 外带、厨房单和服务费。', kitchenTicketOpt: '打印厨房单',
  tableNames: '桌位', tableNamesHelp: '用逗号隔开，例如 1, 2, 3, A1, 吧台。', customPayments: '其他付款方式',
  errNoPayment: '至少选一种付款方式。', taxName: '税的名称', taxRate: '税率 (%)', taxMode: '价格', pricesInclude: '价格已经含税',
  pricesExclude: '税另外加', serviceChargeRate: '服务费 (%)', serviceChargeHelp: '只有堂食收。0 = 不收。',
  errPercent: '比率要在 0 到 100 之间。', shopName: '店名', regNo: '公司注册号', sstNo: 'SST 号码', address: '地址', phone: '电话',
  receiptFooter: '收据底部文字', paperWidth: '纸宽', autoPrint: '每单完成后自动打印收据',
  storesHelp: '分店在 Stock Check app 里新增（我的 → 分店）。每台收银机属于一间分店，在「这台电脑」里选。',
  closed: '已关闭', thisTill: '这台收银机', tillBranch: '这台收银机属于', printerSetup: '收据打印机',
  printerSteps: '在这台电脑安装打印机的驱动程序，先从 Windows 打印测试页。\n把它设为默认打印机。\n打印窗口里选纸张 80 mm（或 58 mm）、边距「无」，并取消「页眉和页脚」。\n要不跳出打印窗口直接打印：用 --kiosk-printing 启动 Chrome（我们可以帮你设定）。',
  scannerSetup: '条码扫描枪', scannerHelp: 'USB 扫描枪插上就能用：在「收银」页面直接扫。它会自动输入条码再按 Enter。',
  inventoryHelp: '这里记录的进货和报损，会加进 Stock Check app 的库存数量。收银卖出的会自动扣掉。',
  stockAdjustment: '库存调整', product: '商品', noteRefHint: '供应商 / 送货单号 / 原因', recentMovements: '最近 30 天',
  source: '来源', noStockPermission: '记录库存需要「记录进货/出货」权限。',
  move_RECEIVE: '进货', move_WRITE_OFF: '报损', move_SALE: '卖出', move_REFUND: '退货',
  employeesHelp: '员工用 Stock Check app 的同一个账号登录。新员工在 app 里新增：我的 → 用户管理。',
  employeeList: '员工名单', accessRights: '权限', role: '角色',
  perm_POS_SELL: '可以收银', perm_POS_VOID: '可以作废', perm_POS_MANAGE: '管理商品和设置', perm_POS_REPORTS: '看报表',
};

const ms = {
  signIn: 'Log masuk', signInHint: 'Guna e-mel dan kata laluan yang sama dengan aplikasi Stock Check.', password: 'Kata laluan',
  forgotPassword: 'Lupa kata laluan?', signOut: 'Log keluar', loading: 'Memuatkan…', branch: 'Cawangan', mainShop: 'Kedai utama',
  errWrongPassword: 'E-mel atau kata laluan salah.', errNetwork: 'Tiada sambungan internet.',
  navRegister: 'Kaunter', navReports: 'Laporan', navItems: 'Barang', navInventory: 'Inventori', navEmployees: 'Pekerja', navSettings: 'Tetapan',
  repSummary: 'Ringkasan jualan', repItems: 'Jualan ikut barang', repCategories: 'Jualan ikut kategori', repEmployees: 'Jualan ikut pekerja',
  repPayments: 'Jualan ikut cara bayaran', repReceipts: 'Resit', repModifiers: 'Jualan ikut pilihan', repDiscounts: 'Diskaun', repTaxes: 'Cukai',
  itemList: 'Senarai barang', itemCategories: 'Kategori', itemModifiers: 'Pilihan tambahan', itemDiscounts: 'Diskaun',
  setFeatures: 'Ciri', setPayments: 'Cara bayaran', setTaxes: 'Cukai & caj perkhidmatan', setReceipt: 'Resit', setStores: 'Kedai', setDevice: 'Peranti ini',
  searchProducts: 'Cari nama, kod bar atau SKU', scanHere: 'Imbas atau taip kod bar, kemudian Enter', tables: 'Meja', openTickets: 'Bil terbuka',
  all: 'Semua', notFound: 'Tidak dijumpai', cancel: 'Batal', add: 'Tambah', subtotal: 'Jumlah kecil', serviceCharge: 'Caj perkhidmatan',
  tax: 'Cukai', total: 'Jumlah', discount: 'Diskaun', sendKitchen: 'Dapur', saveTicket: 'Simpan', clear: 'Kosongkan', charge: 'Bayar',
  emptyTicket: 'Imbas atau tekan barang untuk mula.', table: 'Meja', quantity: 'Kuantiti', unitPrice: 'Harga seunit', note: 'Nota',
  remove: 'Buang', save: 'Simpan', delete: 'Padam', close: 'Tutup', free: 'Kosong',
  order_RETAIL: 'Runcit', order_DINE_IN: 'Makan sini', order_TAKEAWAY: 'Bungkus', order_DELIVERY: 'Penghantaran',
  completeSale: 'Selesai', exact: 'Tepat', due: 'Baki', change: 'Baki wang', rounding: 'Pembundaran', paid: 'Dibayar',
  printReceipt: 'Cetak resit', newSale: 'Jualan baru', receiptNo: 'Resit', date: 'Tarikh', cashier: 'Juruwang', voided: 'DIBATALKAN',
  CASH: 'Tunai', QR: 'DuitNow QR', CARD: 'Kad', EWALLET: 'E-dompet', TRANSFER: 'Pindahan bank',
  addItem: 'Tambah barang', editItem: 'Ubah barang', name: 'Nama', category: 'Kategori', price: 'Harga', cost: 'Kos', unit: 'Unit', barcode: 'Kod bar',
  generate: 'Jana', choosePhoto: 'Pilih gambar', saved: 'Disimpan.', trackStock: 'Jejak stok', activeForSale: 'Boleh dijual',
  today: 'Hari ini', yesterday: 'Semalam', exportCsv: 'Eksport', grossSales: 'Jualan kasar', discounts: 'Diskaun', netSales: 'Jualan bersih',
  grossProfit: 'Untung kasar', receiptsCount: 'Resit', averageSale: 'Purata jualan', voidedSales: 'Dibatalkan', employee: 'Pekerja',
  paymentType: 'Cara bayaran', voidSale: 'Batal jualan', reason: 'Sebab', shopName: 'Nama kedai', address: 'Alamat', phone: 'Telefon',
  mode_RETAIL: 'Runcit / pasar raya / gudang', mode_FNB: 'Restoran / kafe (F&B)', mode_BOTH: 'Kedua-duanya',
  move_RECEIVE: 'Barang masuk', move_WRITE_OFF: 'Hapus kira', move_SALE: 'Jualan', move_REFUND: 'Pulangan',
  perm_POS_SELL: 'Guna kaunter', perm_POS_VOID: 'Batal jualan', perm_POS_MANAGE: 'Urus barang & tetapan', perm_POS_REPORTS: 'Lihat laporan',
  // Translated in one go when Malay was found falling back to English.
  email: "E-mel", enterEmailFirst: "Taip e-mel anda dahulu.", resetSent: "E-mel set semula kata laluan telah dihantar.",
  errTooMany: "Terlalu banyak cubaan. Tunggu seminit dan cuba lagi.", errNoCompany: "Akaun ini belum menyertai mana-mana syarikat. Daftar dalam aplikasi Stock Check dahulu.", errInactive: "Akaun ini telah dimatikan oleh admin anda.",
  errNoPosPermission: "Peranan anda tiada kebenaran POS. Minta admin hidupkan di Pekerja → Hak akses.", errPage: "Halaman ini tidak dapat dibuka", errLoad: "Tidak dapat dimuatkan",
  offlineNote: "Luar talian — jualan disimpan dalam komputer ini dan dihantar apabila internet kembali.", noMatch: "Tiada yang sepadan.", noProductsYet: "Belum ada barang. Tambah di Barang → Senarai barang.",
  noPrice: "Tetapkan harga", enterPrice: "Harga", errAmount: "Masukkan jumlah seperti 12.50.",
  errQty: "Masukkan kuantiti lebih daripada 0.", weight: "Berat", ok: "OK",
  required: "wajib", choose: "Pilih", included: "termasuk",
  savedTicket: "Tiket disimpan", lineDiscount: "Diskaun barang", notePlaceholder: "Kurang manis, tanpa bawang…",
  alreadySent: "Sudah dihantar ke dapur.", apply: "Guna", deleteTicketQ: "Padam tiket yang disimpan ini?",
  clearTicketQ: "Kosongkan jualan ini?", ticketSaved: "Tiket disimpan.", sentKitchen: "Dihantar ke dapur.",
  unsavedTicketQ: "Simpan jualan semasa sebagai tiket dahulu?", itemsCount: "barang", noOpenTickets: "Tiada tiket terbuka.",
  kitchenTicket: "DAPUR", addPayment: "Tambah", errOverpay: "Hanya tunai boleh melebihi jumlah yang perlu dibayar.",
  errSaleNotSaved: "Pelayan menolak jualan", orderType: "Jenis", customer: "Pelanggan",
  allCategories: "Semua kategori", noCategory: "Tiada kategori", noName: "(tiada nama)",
  inactive: "Tutup", showingFirst500: "Menunjukkan 500 pertama — cari untuk kecilkan senarai.", scanOrType: "Imbas atau taip",
  priceBlankHint: "Kosong = tanya di kaunter", altBarcodes: "Kod bar lain", altBarcodesHint: "Koma antara kod",
  removePhoto: "Buang foto", errPhoto: "Gambar itu tidak dapat dibaca.", errBarcode: "Kod bar diperlukan. Guna Jana untuk barang tanpa kod bar.",
  errBarcodeSlash: "Kod bar tidak boleh mengandungi “/”.", errName: "Nama diperlukan.", errBarcodeTaken: "Kod bar itu sudah milik barang lain.",
  errBelongsTo: "sudah milik", deleteItemQ: "Padam barang ini? Sejarah jualannya kekal.", addCategory: "Tambah kategori",
  editCategory: "Ubah kategori", noCategoriesYet: "Belum ada kategori.", addModifier: "Tambah pengubah",
  editModifier: "Ubah pengubah", modifierNameHint: "cth. Saiz, Tahap manis, Tambahan", optionName: "Pilihan",
  addOption: "Tambah pilihan", modRequired: "Mesti pilih sekurang-kurangnya satu", modMultiple: "Boleh pilih lebih daripada satu",
  errModifier: "Nama dan sekurang-kurangnya satu pilihan diperlukan.", modifiersHelp: "Pengubah ialah pilihan yang ditanya semasa barang dijual, seperti saiz atau tambah telur. Lekatkan pada barang di senarai barang.", noModifiersYet: "Belum ada pengubah.",
  addDiscount: "Tambah diskaun", editDiscount: "Ubah diskaun", percent: "Peratus",
  amount: "Jumlah", type: "Jenis", value: "Nilai",
  errDiscount: "Beri nama dan nilai (1–100% atau jumlah).", noDiscountsYet: "Belum ada diskaun.", allBranches: "Semua cawangan",
  allEmployees: "Semua pekerja", last7: "7 hari", last30: "30 hari",
  ownSalesOnly: "Menunjukkan jualan anda sendiri. Laporan untuk semua perlukan kebenaran “Lihat laporan jualan”.", noSalesInPeriod: "Tiada jualan dalam tempoh ini.", profitNote: "* Sesetengah barang tiada kos, jadi untung mengiranya sebagai percuma.",
  hour: "Jam", qtySold: "Kuantiti dijual", transactions: "Transaksi",
  modifier: "Pengubah", option: "Pilihan", timesUsed: "Kali digunakan",
  taxableSales: "Jualan bercukai", status: "Status", voidedBy: "Dibatalkan oleh",
  voidReasonHint: "Salah barang, pelanggan ubah fikiran…", voidExplain: "Resit kekal dalam rekod, ditanda BATAL, dan stok dikembalikan.", errReason: "Beri sebab.",
  voidConfirm: "Batalkan jualan ini? Tidak boleh diundur.", saleVoided: "Jualan dibatalkan.", settingsReadOnly: "Hanya yang ada kebenaran “Urus harga, produk dan tetapan kaunter” boleh mengubah ini.",
  kitchenTicketOpt: "Cetak tiket dapur", tableNames: "Meja", tableNamesHelp: "Koma antara nama, cth. 1, 2, 3, A1, Bar.",
  customPayments: "Jenis bayaran lain", errNoPayment: "Pilih sekurang-kurangnya satu jenis bayaran.", taxName: "Nama cukai",
  taxRate: "Kadar (%)", taxMode: "Harga", pricesInclude: "Harga sudah termasuk cukai",
  pricesExclude: "Cukai ditambah di atas harga", serviceChargeRate: "Caj perkhidmatan (%)", serviceChargeHelp: "Dikenakan untuk makan di sini sahaja. 0 untuk matikan.",
  errPercent: "Kadar antara 0 dan 100.", regNo: "No. pendaftaran syarikat", sstNo: "No. SST",
  receiptFooter: "Kaki resit", paperWidth: "Lebar kertas", autoPrint: "Cetak resit selepas setiap jualan",
  storesHelp: "Cawangan ditambah dalam aplikasi Stock Check (Profil → Cawangan). Setiap kaunter menjual untuk satu cawangan, dipilih di Peranti ini.", closed: "Ditutup", thisTill: "Kaunter ini",
  tillBranch: "Kaunter ini menjual untuk", printerSetup: "Pencetak resit", printerSteps: "Pasang pemacu pencetak pada komputer ini dan cetak halaman ujian dari Windows.\nJadikan ia pencetak lalai.\nDalam kotak cetak, pilih saiz kertas 80 mm (atau 58 mm) tanpa margin, dan matikan “Pengepala dan pengaki”.\nUntuk cetak tanpa kotak cetak setiap kali, buka Chrome dengan --kiosk-printing (tanya kami, kami tetapkan).",
  scannerSetup: "Pengimbas kod bar", scannerHelp: "Pengimbas USB berfungsi sendiri: pasang dan imbas di halaman Kaunter. Ia menaip kod bar dan tekan Enter.", inventoryHelp: "Barang diterima dan stok dihapus kira di sini ditambah ke paras stok dalam aplikasi Stock Check. Jualan dari kaunter ditolak secara automatik.",
  stockAdjustment: "Pelarasan stok", product: "Barang", noteRefHint: "Pembekal / no. DO / sebab",
  recentMovements: "30 hari lepas", source: "Sumber", noStockPermission: "Merekod stok perlukan kebenaran “Rekod barang masuk/keluar”.",
  employeesHelp: "Pekerja log masuk dengan akaun yang sama seperti aplikasi Stock Check. Tambah pekerja baharu dalam aplikasi: Profil → Pengguna.", employeeList: "Senarai pekerja", accessRights: "Hak akses",
  role: "Peranan", nfcOn: "NFC hidup — sentuh tag atau kad ahli pada belakang peranti ini.", nfcError: "NFC tidak tersedia",
  nfcUnreadable: "Tag itu tidak dapat dibaca. Pegang diam dan cuba lagi.", holdNfc: "Pegang pada belakang telefon atau tablet.", bindNfc: "Sentuh tag NFC untuk barang ini",
  memberCardHint: "Imbas atau sentuh kad; beberapa dengan koma", errCamera: "Kamera tidak dapat dibuka. Benarkan laman web ini menggunakan kamera.", errCameraScan: "Pelayar ini tidak boleh imbas dengan kamera. Guna pengimbas USB atau Chrome.",
  intApi: "API", searchCustomers: "Cari nama atau telefon", noCustomersYet: "Belum ada pelanggan.",
  visits: "Lawatan", totalSpent: "Jumlah belanja", lastVisit: "Lawatan terakhir",
  deleteCustomerQ: "Padam pelanggan ini? Resit lama kekal.", loyaltyOffNote: "Mata ganjaran dimatikan. Hidupkan di Tetapan → Kesetiaan.", errNotEnoughPoints: "Mata tidak cukup.",
  pointsEarned: "Mata diperoleh", pointsUsed: "Mata digunakan", pointsBalance: "Baki mata",
  loyaltyOn: "Pelanggan kumpul mata", pointsPerRinggit: "Mata bagi setiap RM 1 dibelanja", pointValueSen: "Nilai satu mata (sen)",
  minRedeemPoints: "Mata minimum sebelum boleh digunakan", loyaltyHelp: "Contoh: 1 mata setiap RM 1 dan satu mata bernilai 1 sen memberi 1% pulangan. Mata diperoleh atas jumlah dibayar, bukan yang dibayar dengan mata.", levelsHelp: "Kiraan terakhir tambah barang masuk, tolak jualan dan barang keluar sejak itu — angka yang sama seperti aplikasi Stock Check.",
  refresh: "Muat semula", lowStock: "Stok rendah", stockValue: "Nilai stok (ikut kos)",
  lastCount: "Kiraan terakhir", inSince: "Masuk sejak", outSince: "Keluar sejak",
  neverCounted: "Belum pernah dikira", addSupplier: "Tambah pembekal", editSupplier: "Ubah pembekal",
  noSuppliersYet: "Belum ada pembekal.", poNo: "No. PO", newPo: "Pesanan belian baharu",
  noPosYet: "Belum ada pesanan belian.", purchaseOrder: "Pesanan belian", deliverTo: "Hantar ke",
  po_DRAFT: "Draf", po_ORDERED: "Dipesan", po_PARTIAL: "Sebahagian diterima",
  po_RECEIVED: "Diterima", po_CANCELLED: "Dibatalkan", saveDraft: "Simpan draf",
  markOrdered: "Tanda sudah dipesan", cancelPo: "Batal pesanan", deletePoQ: "Padam draf ini?",
  updateCost: "Kemas kini kos setiap barang ke harga pesanan ini", received: "Diterima.", print: "Cetak",
  errNoLines: "Tambah sekurang-kurangnya satu barang.", transferNo: "No. pindahan", fromBranch: "Dari",
  toBranch: "Ke", newTransfer: "Pindahan baharu", noTransfersYet: "Belum ada pindahan.",
  tr_DRAFT: "Draf", tr_SENT: "Dalam perjalanan", tr_RECEIVED: "Diterima",
  sendTransfer: "Hantar", receiveTransfer: "Tanda diterima", sent: "Dihantar.",
  errSameBranch: "Dari dan Ke mesti cawangan berbeza.", transfersNeedBranches: "Pindahan memindahkan stok antara cawangan. Tambah cawangan dalam aplikasi Stock Check dahulu.", errNameEmail: "Nama dan e-mel diperlukan.",
  errPassword6: "Kata laluan perlu sekurang-kurangnya 6 aksara.", errEmailUsed: "E-mel itu sudah ada akaun.", employeeCreated: "Pekerja ditambah",
  giveTheseDetails: "Beri butiran ini untuk log masuk ke aplikasi dan laman web ini:", canChangePassword: "Mereka boleh tukar kata laluan selepas log masuk.", addToken: "Tambah token akses",
  tokenNameHint: "cth. Shopify, sistem perakaunan", noTokensYet: "Belum ada token akses.", token: "Token",
  createdBy: "Dibuat oleh", lastUsed: "Terakhir digunakan", revoke: "Batalkan",
  revokeTokenQ: "Batalkan token ini? Apa-apa yang menggunakannya akan berhenti serta-merta.", tokenCreated: "Token akses dibuat", tokenShownOnce: "Salin sekarang — ia ditunjukkan sekali ini sahaja dan tidak boleh dilihat lagi.",
  copied: "Disalin.", tokensHelp: "Token akses membenarkan sistem lain — kedai dalam talian, program perakaunan — membaca dan mengemas kini barang, stok, resit dan pelanggan anda melalui API Pos Stock Check.", adminOnly: "Hanya admin syarikat boleh mengurus token akses.",
  apiIntro: "API Pos Stock Check ialah API REST JSON. Setiap permintaan membawa token akses yang dibuat di Integrasi → Token akses.", apiBase: "Alamat", apiAuth: "Kebenaran",
  apiExample: "Contoh", apiItems: "Semua barang dengan harga, kos, kategori dan foto", apiItem: "Satu barang mengikut kod bar",
  apiItemsPost: "Cipta atau kemas kini barang", apiInventory: "Stok semasa bagi setiap barang dan kedai", apiInventoryPost: "Tetapkan stok (stock_after) atau tambah barang diterima",
  apiReceipts: "Resit jualan, terbaru dahulu, dengan kursor untuk lagi", apiCustomers: "Pelanggan dan mata mereka", apiCustomersPost: "Cipta atau kemas kini pelanggan",
  apiCategories: "Kategori", apiStores: "Kedai (cawangan)", apiNotes: "Senarai memulangkan sehingga 250 sekali dengan \"cursor\" untuk halaman seterusnya. Wang dalam sen (RM 15.90 = 1590) dan kuantiti ialah nombor biasa.",
};

// ------------------------------------------- customers, inventory, API
Object.assign(en, {
  installApp: 'Install as app',
  nfcOn: 'NFC on — tap a tag or member card on the back of this device.', nfcError: 'NFC is not available', nfcUnreadable: 'That tag could not be read. Hold it still and try again.', tapNfc: 'Tap the NFC card or tag', holdNfc: 'Hold it against the back of the phone or tablet.', bindNfc: 'Tap the NFC tag for this item', memberCard: 'Member card', memberCardHint: 'Scan or tap the card; several with commas',
  scanCamera: 'Scan with camera', pointCamera: 'Point the camera at the barcode', errCamera: 'The camera could not be opened. Allow this website to use the camera.', errCameraScan: 'This browser cannot scan with the camera. Use a USB scanner or Chrome.',
  navCustomers: 'Customers', navIntegrations: 'Integrations', setLoyalty: 'Loyalty',
  invLevels: 'Stock levels', invAdjust: 'Stock adjustments', invPurchase: 'Purchase orders', invTransfers: 'Transfer orders', invSuppliers: 'Suppliers',
  intTokens: 'Access tokens', intApi: 'API',
  // customers & loyalty
  addCustomer: 'Add customer', searchCustomers: 'Search name or phone', noCustomersYet: 'No customers yet.', points: 'points',
  visits: 'Visits', totalSpent: 'Total spent', lastVisit: 'Last visit', deleteCustomerQ: 'Delete this customer? Their past receipts stay.',
  loyaltyOffNote: 'Loyalty points are off. Turn them on under Settings → Loyalty.', POINTS: 'Points',
  errNotEnoughPoints: 'Not enough points for that.', pointsEarned: 'Points earned', pointsUsed: 'Points used', pointsBalance: 'Points balance',
  loyaltyOn: 'Customers collect points', pointsPerRinggit: 'Points per RM 1 spent', pointValueSen: 'One point is worth (sen)',
  minRedeemPoints: 'Points needed before they can be used',
  loyaltyHelp: 'Example: 1 point per RM 1 and a point worth 1 sen gives 1% back. Points are earned on what is paid, not on what is paid with points.',
  // inventory
  levelsHelp: 'Last count plus goods in, minus sales and goods out since — the same figures as the Stock Check app.',
  refresh: 'Refresh', lowStock: 'Low stock', stockValue: 'Stock value (at cost)', lastCount: 'Last count', inSince: 'In since',
  outSince: 'Out since', onHand: 'On hand', neverCounted: 'Never counted',
  addSupplier: 'Add supplier', editSupplier: 'Edit supplier', noSuppliersYet: 'No suppliers yet.', supplier: 'Supplier',
  poNo: 'PO no.', newPo: 'New purchase order', noPosYet: 'No purchase orders yet.', purchaseOrder: 'Purchase order', deliverTo: 'Deliver to',
  po_DRAFT: 'Draft', po_ORDERED: 'Ordered', po_PARTIAL: 'Partly received', po_RECEIVED: 'Received', po_CANCELLED: 'Cancelled',
  saveDraft: 'Save draft', markOrdered: 'Mark as ordered', receiveGoods: 'Receive goods', cancelPo: 'Cancel order', deletePoQ: 'Delete this draft?',
  updateCost: 'Update each item\'s cost to this order\'s price', received: 'Received.', print: 'Print', errNoLines: 'Add at least one item.',
  transferNo: 'Transfer no.', fromBranch: 'From', toBranch: 'To', newTransfer: 'New transfer', noTransfersYet: 'No transfers yet.',
  tr_DRAFT: 'Draft', tr_SENT: 'On the way', tr_RECEIVED: 'Received', sendTransfer: 'Send', receiveTransfer: 'Mark received',
  sent: 'Sent.', errSameBranch: 'From and To must be different branches.', transfersNeedBranches: 'Transfers move stock between branches. Add branches in the Stock Check app first.',
  move_TRANSFER_OUT: 'Sent to branch', move_TRANSFER_IN: 'From branch',
  // employees
  addEmployee: 'Add employee', create: 'Create', errNameEmail: 'A name and an email are needed.', errPassword6: 'The password needs at least 6 characters.',
  errEmailUsed: 'That email already has an account.', employeeCreated: 'Employee added', giveTheseDetails: 'Give them these details to sign in, to the app and to this website:',
  canChangePassword: 'They can change the password after signing in.',
  // integrations
  addToken: 'Add access token', tokenNameHint: 'e.g. Shopify, accounting system', noTokensYet: 'No access tokens yet.', token: 'Token',
  createdBy: 'Created by', lastUsed: 'Last used', revoke: 'Revoke', revokeTokenQ: 'Revoke this token? Anything using it stops working at once.',
  tokenCreated: 'Access token created', tokenShownOnce: 'Copy it now — it is shown only this once and cannot be seen again.', copy: 'Copy', copied: 'Copied.', done: 'Done',
  tokensHelp: 'An access token lets another system — an online shop, an accounting program — read and update your items, stock, receipts and customers through the Pos Stock Check API.',
  adminOnly: 'Only the company admin can manage access tokens.',
  apiIntro: 'The Pos Stock Check API is a JSON REST API. Every request carries an access token made under Integrations → Access tokens.',
  apiBase: 'Address', apiAuth: 'Authorisation', apiExample: 'Examples',
  apiItems: 'All items with price, cost, category and photo', apiItem: 'One item by barcode', apiItemsPost: 'Create or update items',
  apiInventory: 'Stock on hand per item and store', apiInventoryPost: 'Set stock (stock_after) or add goods received',
  apiReceipts: 'Sales receipts, newest first, with a cursor for more', apiCustomers: 'Customers and their points', apiCustomersPost: 'Create or update customers',
  apiCategories: 'Categories', apiStores: 'Stores (branches)',
  apiNotes: 'Lists return up to 250 at a time with a "cursor" for the next page. Money is in sen (RM 15.90 = 1590) and quantities are plain numbers.',
});
Object.assign(zh, {
  installApp: '安装成 App',
  nfcOn: 'NFC 已开启 — 把标签或会员卡贴近这台机器背面。', nfcError: '这台机器不能用 NFC', nfcUnreadable: '读不到这个标签，请拿稳再试一次。', tapNfc: '请感应 NFC 卡或标签', holdNfc: '贴近手机或平板的背面。', bindNfc: '感应这个商品的 NFC 标签', memberCard: '会员卡', memberCardHint: '扫描或感应会员卡；多张用逗号隔开',
  scanCamera: '用镜头扫描', pointCamera: '把条码对准镜头', errCamera: '打不开镜头。请允许这个网站使用相机。', errCameraScan: '这个浏览器不能用镜头扫描，请用 USB 扫码枪或 Chrome。',
  navCustomers: '顾客', navIntegrations: '整合', setLoyalty: '会员积分',
  invLevels: '库存数量', invAdjust: '库存调整', invPurchase: '采购单', invTransfers: '调货单', invSuppliers: '供应商',
  intTokens: '访问令牌', intApi: 'API',
  addCustomer: '新增顾客', searchCustomers: '搜索名字或电话', noCustomersYet: '还没有顾客。', points: '分',
  visits: '来店次数', totalSpent: '总消费', lastVisit: '最后来店', deleteCustomerQ: '删除这位顾客？以前的收据会保留。',
  loyaltyOffNote: '会员积分还没开启。到「设置 → 会员积分」打开。', POINTS: '积分',
  errNotEnoughPoints: '积分不够。', pointsEarned: '获得积分', pointsUsed: '使用积分', pointsBalance: '积分余额',
  loyaltyOn: '顾客可以累积积分', pointsPerRinggit: '每消费 RM 1 得几分', pointValueSen: '1 分值多少（仙）',
  minRedeemPoints: '至少几分才可以用',
  loyaltyHelp: '例子：每 RM 1 得 1 分，1 分值 1 仙 = 回馈 1%。积分只按付的钱计算，用积分付的部分不再给积分。',
  levelsHelp: '上次盘点的数量，加上之后的进货、减去之后的卖出和出货 — 跟 Stock Check app 的数字一样。',
  refresh: '刷新', lowStock: '库存不足', stockValue: '库存价值（按成本）', lastCount: '上次盘点', inSince: '之后进',
  outSince: '之后出', onHand: '现有', neverCounted: '从未盘点',
  addSupplier: '新增供应商', editSupplier: '编辑供应商', noSuppliersYet: '还没有供应商。', supplier: '供应商',
  poNo: '采购单号', newPo: '新采购单', noPosYet: '还没有采购单。', purchaseOrder: '采购单', deliverTo: '送到',
  po_DRAFT: '草稿', po_ORDERED: '已下单', po_PARTIAL: '部分到货', po_RECEIVED: '已到货', po_CANCELLED: '已取消',
  saveDraft: '存草稿', markOrdered: '确认下单', receiveGoods: '收货', cancelPo: '取消采购单', deletePoQ: '删除这张草稿？',
  updateCost: '用这张单的价格更新商品成本', received: '已收货。', print: '打印', errNoLines: '至少加一样商品。',
  transferNo: '调货单号', fromBranch: '从', toBranch: '到', newTransfer: '新调货单', noTransfersYet: '还没有调货单。',
  tr_DRAFT: '草稿', tr_SENT: '运送中', tr_RECEIVED: '已收到', sendTransfer: '发出', receiveTransfer: '确认收到',
  sent: '已发出。', errSameBranch: '「从」和「到」要是不同分店。', transfersNeedBranches: '调货是在分店之间搬货。请先在 Stock Check app 新增分店。',
  move_TRANSFER_OUT: '调出', move_TRANSFER_IN: '调入',
  addEmployee: '新增员工', create: '建立', errNameEmail: '需要名字和 email。', errPassword6: '密码至少 6 个字。',
  errEmailUsed: '这个 email 已经有账号了。', employeeCreated: '已新增员工', giveTheseDetails: '把这些资料给员工，app 和这个网站都用它登录：',
  canChangePassword: '员工登录后可以自己改密码。',
  addToken: '新增访问令牌', tokenNameHint: '例如：Shopify、会计软件', noTokensYet: '还没有访问令牌。', token: '令牌',
  createdBy: '建立人', lastUsed: '最后使用', revoke: '撤销', revokeTokenQ: '撤销这个令牌？用它的系统会马上不能用。',
  tokenCreated: '已建立访问令牌', tokenShownOnce: '现在就复制 — 只会显示这一次，之后看不到。', copy: '复制', copied: '已复制。', done: '完成',
  tokensHelp: '访问令牌让其他系统（网店、会计软件）通过 Pos Stock Check API 读取和更新你的商品、库存、收据和顾客。',
  adminOnly: '只有公司管理员可以管理访问令牌。',
  apiIntro: 'Pos Stock Check API 是 JSON REST API。每个请求都要带「整合 → 访问令牌」建立的令牌。',
  apiBase: '网址', apiAuth: '授权', apiExample: '例子',
  apiItems: '全部商品（价格、成本、分类、照片）', apiItem: '按条码查一个商品', apiItemsPost: '新增或更新商品',
  apiInventory: '每个商品在每间店的库存', apiInventoryPost: '设定库存（stock_after）或记录进货',
  apiReceipts: '销售收据，最新的在前，用 cursor 拿下一页', apiCustomers: '顾客和积分', apiCustomersPost: '新增或更新顾客',
  apiCategories: '分类', apiStores: '分店',
  apiNotes: '列表一次最多 250 笔，用 "cursor" 拿下一页。金额单位是仙（RM 15.90 = 1590），数量是普通数字。',
});
Object.assign(ms, {
  installApp: 'Pasang sebagai aplikasi',
  memberCard: 'Kad ahli', tapNfc: 'Sentuh kad atau tag NFC',
  scanCamera: 'Imbas dengan kamera', pointCamera: 'Halakan kamera ke kod bar',
  navCustomers: 'Pelanggan', navIntegrations: 'Integrasi', setLoyalty: 'Kesetiaan', invLevels: 'Paras stok', invAdjust: 'Pelarasan stok',
  invPurchase: 'Pesanan belian', invTransfers: 'Pindahan stok', invSuppliers: 'Pembekal', intTokens: 'Token akses',
  addCustomer: 'Tambah pelanggan', points: 'mata', POINTS: 'Mata ganjaran', supplier: 'Pembekal', receiveGoods: 'Terima barang',
  addEmployee: 'Tambah pekerja', create: 'Cipta', copy: 'Salin', done: 'Selesai', onHand: 'Ada',
  move_TRANSFER_OUT: 'Dihantar ke cawangan', move_TRANSFER_IN: 'Dari cawangan',
});


// Taxes per item.
Object.assign(en, {
  taxes: 'Taxes', addTax: '+ Add a tax', taxDefault: 'Charge on items not set one by one',
  taxesHelp: 'Each item can carry its own taxes. Tick "Charge on items not set one by one" for the tax most items have; items made in the phone app, from Loyverse or an import get it. To make an item tax-free, open it under Items and untick every tax, or use "Set taxes for many items".',
  noTaxes: 'No taxes set. Every item is sold tax-free.', errTaxName: 'Give each tax a name.',
  itemTaxes: 'Taxes on this item', itemTaxesHelp: 'Untick all = this item is tax-free.',
  taxFree: 'Tax-free', taxFreeItems: 'Tax-free items', taxFreeSales: 'Tax-free sales',
  bulkTaxes: 'Set taxes for many items', bulkTaxesHelp: 'Choose the taxes, tick the items, then apply. Untick every tax to make the ticked items tax-free.',
  setTaxesTo: 'Set these items to', selectShown: 'Tick all shown', clearTicks: 'Untick all', applyToN: 'Apply to', itemsTicked: 'items ticked',
  taxesApplied: 'Taxes updated', taxCol: 'Tax',
});

Object.assign(zh, {
  taxes: '税', addTax: '+ 加一个税', taxDefault: '没有单独设定的商品也收（默认）',
  taxesHelp: '每个商品可以有自己的税。大部分商品都收的那个税，勾「默认」；手机 app、Loyverse、Excel 导入进来的商品会自动用默认的税。某样商品不收税：到「商品」打开它，把税全部取消勾选，或用「批量设定税」。',
  noTaxes: '还没有设定税，全部商品都不收税。', errTaxName: '每个税都要有名称。',
  itemTaxes: '这个商品收的税', itemTaxesHelp: '全部不勾 = 这个商品不收税。',
  taxFree: '免税', taxFreeItems: '不收税的商品', taxFreeSales: '不收税的销售',
  bulkTaxes: '批量设定税', bulkTaxesHelp: '先选税，再勾商品，然后按「套用」。税全部不勾 = 勾到的商品变成不收税。',
  setTaxesTo: '把这些商品设成', selectShown: '全选（显示的）', clearTicks: '全部取消', applyToN: '套用到', itemsTicked: '样商品已勾',
  taxesApplied: '税已更新', taxCol: '税',
});

Object.assign(ms, {
  taxes: 'Cukai', addTax: '+ Tambah cukai', taxDefault: 'Kenakan pada barang yang tidak ditetapkan satu-satu',
  taxesHelp: 'Setiap barang boleh ada cukai sendiri. Tandakan "lalai" untuk cukai yang dikenakan pada kebanyakan barang. Untuk barang tanpa cukai, buka barang itu dan nyahtanda semua cukai, atau guna "Tetapkan cukai beramai".',
  noTaxes: 'Tiada cukai. Semua barang dijual tanpa cukai.', errTaxName: 'Beri nama untuk setiap cukai.',
  itemTaxes: 'Cukai untuk barang ini', itemTaxesHelp: 'Nyahtanda semua = barang tanpa cukai.',
  taxFree: 'Tanpa cukai', taxFreeItems: 'Barang tanpa cukai', taxFreeSales: 'Jualan tanpa cukai',
  bulkTaxes: 'Tetapkan cukai beramai', bulkTaxesHelp: 'Pilih cukai, tandakan barang, kemudian guna. Nyahtanda semua cukai untuk jadikan barang tanpa cukai.',
  setTaxesTo: 'Tetapkan barang ini kepada', selectShown: 'Tanda semua', clearTicks: 'Nyahtanda semua', applyToN: 'Guna pada', itemsTicked: 'barang ditanda',
  taxesApplied: 'Cukai dikemas kini', taxCol: 'Cukai',
});


// Till modes, the supermarket screen and the sign-in page.
Object.assign(en, {
  modeTitle: 'What kind of shop is this?', modeSub: 'Pick the one closest to how you sell. The till is laid out for it; change it any time under Settings → Features.',
  modeName_FNB: 'Restaurant & café', modeName_SUPERMARKET: 'Supermarket & mini market', modeName_RETAIL: 'Retail shop',
  modeDesc_FNB: 'Restaurants, cafés, kopitiam, drinks stalls.', modeDesc_SUPERMARKET: 'Supermarkets, mini markets, grocery shops: scan after scan, fast checkout.', modeDesc_RETAIL: 'Clothing, hardware, stationery, phone shops: tap items by picture.',
  modePts_FNB: 'Tables and saved bills|Modifiers: sugar level, extra egg|Kitchen tickets|Dine-in / take-away / delivery|Service charge',
  modePts_SUPERMARKET: 'Big scan box, keep scanning|Type 3* then scan = 3 pieces|Price check, quick items (veg, bread)|Weighed items|Hold and recall bills',
  modePts_RETAIL: 'Item pictures by category|Members and points|Discounts|Saved bills|Barcode and NFC',
  modeCurrent: 'In use', modeSaved: 'Till mode set.', businessType: 'Till mode',
  modeHelp: 'All three share the same items, stock, receipts and reports; only the till screen changes.',
  qtyX: 'Qty ×', priceCheck: 'Price check', quickKeys: 'Quick items', hold: 'Hold', recall: 'Recall', member: 'Member',
  itemsShort: 'pcs', lastScanned: 'LAST SCANNED', scanToCheck: 'Scan an item to see its price.',
  qtyPrompt: 'How many of the next item?', qtyHint: 'Tip: type 3* in the scan box, then scan, to sell 3.',
  signInTagline: 'Count stock on your phone. Sell at the counter. One set of numbers.',
  signFeat1: 'Scan to sell; stock updates at once', signFeat2: 'For restaurants, supermarkets and shops', signFeat3: 'Keeps selling without internet',
  signFoot: 'Pos Stock Check · Malaysia',
});
Object.assign(zh, {
  modeTitle: '你的店是哪一种？', modeSub: '选一个最像你做生意的方式，收银画面会照它排好。之后随时可以在「设置 → 功能」改。',
  modeName_FNB: '餐饮', modeName_SUPERMARKET: '超市 / 迷你市场', modeName_RETAIL: '店面零售',
  modeDesc_FNB: '餐厅、咖啡店、kopitiam、饮料店。', modeDesc_SUPERMARKET: '超市、迷你市场、杂货店：一直扫码，结账快。', modeDesc_RETAIL: '服装、五金、文具、手机店：看图片点商品。',
  modePts_FNB: '桌位和存单|加料：甜度、加蛋|送厨房单|堂食 / 外带 / 外送|服务费',
  modePts_SUPERMARKET: '大扫码框，一直扫|输入 3* 再扫 = 3 件|查价、快捷商品（菜、面包）|称重商品|挂单 / 取单',
  modePts_RETAIL: '商品图片和分类|会员和积分|折扣|存单|条码和 NFC',
  modeCurrent: '使用中', modeSaved: '收银模式已设定。', businessType: '收银模式',
  modeHelp: '三种模式用同一套商品、库存、收据和报表，只是收银画面不一样。',
  qtyX: '数量 ×', priceCheck: '查价', quickKeys: '快捷商品', hold: '挂单', recall: '取单', member: '会员',
  itemsShort: '件', lastScanned: '刚扫的', scanToCheck: '扫一下商品，看价钱。',
  qtyPrompt: '下一件要几个？', qtyHint: '小技巧：在扫码框输入 3* 再扫，就是 3 件。',
  signInTagline: '手机盘点，柜台收银，同一套库存。',
  signFeat1: '扫码收银，库存马上更新', signFeat2: '餐饮、超市、店面都适用', signFeat3: '没网络照样收银',
  signFoot: 'Pos Stock Check · 马来西亚',
});
Object.assign(ms, {
  modeTitle: 'Kedai jenis apa?', modeSub: 'Pilih yang paling sesuai dengan cara anda menjual. Boleh ditukar bila-bila masa di Tetapan → Ciri.',
  modeName_FNB: 'Restoran & kafe', modeName_SUPERMARKET: 'Pasar raya & pasar mini', modeName_RETAIL: 'Kedai runcit',
  modeDesc_FNB: 'Restoran, kafe, kopitiam, gerai minuman.', modeDesc_SUPERMARKET: 'Pasar raya, pasar mini, kedai runcit: imbas terus, bayar cepat.', modeDesc_RETAIL: 'Pakaian, perkakasan, alat tulis, kedai telefon: tekan gambar barang.',
  modePts_FNB: 'Meja dan bil disimpan|Pilihan: tahap gula, tambah telur|Tiket dapur|Makan sini / bungkus / hantar|Caj perkhidmatan',
  modePts_SUPERMARKET: 'Kotak imbas besar|Taip 3* kemudian imbas = 3 unit|Semak harga, barang pantas|Barang ditimbang|Tahan dan panggil bil',
  modePts_RETAIL: 'Gambar barang ikut kategori|Ahli dan mata|Diskaun|Bil disimpan|Kod bar dan NFC',
  modeCurrent: 'Sedang diguna', modeSaved: 'Mod kaunter ditetapkan.', businessType: 'Mod kaunter',
  modeHelp: 'Ketiga-tiga mod berkongsi barang, stok, resit dan laporan yang sama; hanya skrin kaunter berbeza.',
  qtyX: 'Kuantiti ×', priceCheck: 'Semak harga', quickKeys: 'Barang pantas', hold: 'Tahan', recall: 'Panggil', member: 'Ahli',
  itemsShort: 'unit', lastScanned: 'TERAKHIR DIIMBAS', scanToCheck: 'Imbas barang untuk lihat harga.',
  qtyPrompt: 'Berapa unit barang seterusnya?', qtyHint: 'Tip: taip 3* di kotak imbas, kemudian imbas, untuk jual 3.',
  signInTagline: 'Kira stok di telefon. Jual di kaunter. Satu set angka.',
  signFeat1: 'Imbas untuk jual; stok dikemas kini serta-merta', signFeat2: 'Untuk restoran, pasar raya dan kedai', signFeat3: 'Terus menjual tanpa internet',
  signFoot: 'Pos Stock Check · Malaysia',
});


Object.assign(en, { movedToWarehouse: 'Purchase orders, receiving, transfers and suppliers are now in the warehouse system — same login, same stock, with approval and in-transit tracking.', openWarehouse: 'Open the warehouse system', posGuide: 'How to use', whApp: 'Warehouse system' });
Object.assign(zh, { movedToWarehouse: '采购单、收货、调货和供应商已经搬到仓库系统 —— 同一个账号、同一套库存，还多了审批和在途追踪。', openWarehouse: '打开仓库系统', posGuide: '使用教程', whApp: '仓库系统' });
Object.assign(ms, { movedToWarehouse: 'Pesanan belian, penerimaan, pindahan dan pembekal kini dalam sistem gudang — log masuk dan stok yang sama, dengan kelulusan dan stok dalam perjalanan.', openWarehouse: 'Buka sistem gudang', posGuide: 'Cara guna', whApp: 'Sistem gudang' });


Object.assign(en, { addSamples: 'Try sample items', removeSamples: 'Remove sample items', removeSamplesQ: 'Remove every sample item? Your own items stay.', samplesAdded: '13 sample items with pictures added', deleted: 'Deleted' });
Object.assign(zh, { addSamples: '加载示范商品', removeSamples: '删除示范商品', removeSamplesQ: '删除全部示范商品？你自己的商品不会动。', samplesAdded: '已加入 13 样有图片的示范商品', deleted: '已删除' });
Object.assign(ms, { addSamples: 'Cuba barang contoh', removeSamples: 'Buang barang contoh', removeSamplesQ: 'Buang semua barang contoh? Barang anda sendiri kekal.', samplesAdded: '13 barang contoh bergambar ditambah', deleted: 'Dipadam' });

const DICTS = { en, zh, ms };

function detect() {
  const saved = local.get('pos.lang', null);
  if (saved && DICTS[saved]) return saved;
  const nav = (navigator.language || 'en').toLowerCase();
  if (nav.startsWith('zh')) return 'zh';
  if (nav.startsWith('ms')) return 'ms';
  return 'en';
}

let lang = detect();
document.documentElement.lang = lang;

export const getLang = () => lang;
export function setLang(next) {
  lang = DICTS[next] ? next : 'en';
  local.set('pos.lang', lang);
}

/** More strings from another part of the site (the warehouse app): { en: {...}, zh: {...}, ms: {...} }. */
export function addStrings(packs) {
  for (const [code, dict] of Object.entries(packs)) Object.assign(DICTS[code] || {}, dict);
}

export function t(key) {
  return DICTS[lang][key] ?? en[key] ?? key;
}

/** CASH -> "Cash"/"现金"; a payment type the shop typed itself shows as typed. */
export function paymentLabel(method) {
  return DICTS[lang][method] ?? en[method] ?? method;
}
