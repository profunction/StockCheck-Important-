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
};

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

export function t(key) {
  return DICTS[lang][key] ?? en[key] ?? key;
}

/** CASH -> "Cash"/"现金"; a payment type the shop typed itself shows as typed. */
export function paymentLabel(method) {
  return DICTS[lang][method] ?? en[method] ?? method;
}
