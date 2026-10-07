/**
 * Step-by-step guides for the three products, in the site's three
 * languages. Shown on the till's and the warehouse's "How to use" pages and
 * on /guide/ (which the phone app links to). Videos are in web/videos/,
 * filmed by tools/videos/record.mjs; their captions are Chinese with a line
 * of English.
 */
const V = (name) => `/videos/${name}.webm`;

export const POS_GUIDE = {
  zh: {
    intro: '跟着下面做，一个下午就能开始收银。每一段都有短片示范。',
    sections: [
      { id: 'start', title: '开始使用', video: V('pos-1-start'), steps: [
        '电脑或平板用 Chrome 打开收银系统，用 JEXO Count app 的同一个账号登录。',
        '第一次打开会问你的店是哪一种：餐饮、超市 / 迷你市场、店面零售。选一个。',
        '设置 → 税和服务费：注册了 SST 才加税，大部分商品收的那个勾「默认」。',
        '设置 → 收据：店名、地址、电话、SST 号码、纸宽（58 或 80mm）。',
        '设置 → 付款方式：现金、DuitNow QR、刷卡、电子钱包，也可以自己加。',
        '地址栏右边按「安装」，桌面就有 JEXO POS 的图标。',
      ], tip: '没有网络照样可以收银，网络回来会自动上传。' },
      { id: 'items', title: '商品和照片', video: V('pos-2-items'), steps: [
        '商品 → 分类：先开几个分类（饮料、杂货、熟食）。',
        '商品 → 商品清单 → 新增商品：扫条码，没有条码就按「生成」。',
        '填名称、售价、成本、分类，按「选择照片」上传或拍照。',
        '米、糖、鸡蛋等不收税：按「批量设定税」，选分类，全选，税全部不勾，套用。',
        '餐厅：商品 → 加料 / 选项（甜度、加蛋），再到商品里勾。',
        '想先试试：按「加载示范商品」，有 13 样有图片的商品；试完一键删除。',
      ] },
      { id: 'retail', title: '店面零售收银', video: V('pos-3-retail'), steps: [
        '点商品图片，或用扫码枪扫，商品就进账单。',
        '每一行按 + / − 改数量；点那一行可以改价钱、折扣、备注（要有权限）。',
        '按「顾客」选会员，或扫会员卡 / NFC 卡。',
        '按「收款」→ 选付款方式 → 输入收到多少（或按快捷金额）。',
        '现金自动四舍五入到 5 仙；找钱显示出来，收据自动打印。',
      ] },
      { id: 'market', title: '超市收银', video: V('pos-4-market'), steps: [
        '超市模式：大扫码框，一直扫就好；账单是清单，总数很大。',
        '同样的东西几件：输入 3* 再扫，或按「数量 ×」。',
        '「查价」：扫一下看价钱，不会卖出。',
        '「快捷商品」：没有条码的面包、菜，点图片加进去。',
        '「挂单」先放着，服务下一位；「取单」拿回来继续。',
      ] },
      { id: 'fnb', title: '餐饮点单', video: V('pos-5-fnb'), steps: [
        '按「桌位」选桌，或在上面选堂食 / 外带 / 外送。',
        '点菜：有加料的会问甜度、加蛋等。',
        '按「送厨房」：只印新点的菜。',
        '按「存单」，客人吃完再从「桌位」打开结账。',
        '堂食才收服务费；收款可以分开付。',
      ] },
      { id: 'reports', title: '报表、作废和导出', video: V('pos-6-reports'), steps: [
        '报表 → 销售总结：今天卖了多少、毛利、单数。',
        '按商品、分类、员工、付款方式、加料、折扣、税，各有一页。',
        '收据：点一张可以重印；作废要写原因，记录不会被删除。',
        '每一页都可以按「导出」变成 Excel 给会计。',
      ] },
      { id: 'hardware', title: '扫码枪、打印机、NFC', steps: [
        'USB 扫码枪：插上就能用，不用装软件。',
        '收据打印机（58 / 80mm 热敏）：先装好驱动，第一次打印时选它，页边距选「无」。',
        '没有扫码枪：按扫码框旁边的相机，用电脑或手机镜头扫。',
        'Android 手机用 Chrome 开收银系统，可以感应 NFC 会员卡和标签。',
      ] },
    ],
  },
  en: {
    intro: 'Follow these and you can be selling the same afternoon. Each part has a short video.',
    sections: [
      { id: 'start', title: 'Getting started', video: V('pos-1-start'), steps: [
        'Open the POS in Chrome on a computer or tablet and sign in with your JEXO Count app account.',
        'The first time, it asks what kind of shop you are: restaurant, supermarket / mini market, or retail shop.',
        'Settings → Taxes: add SST only if you are registered; tick "default" for the rate most items carry.',
        'Settings → Receipt: shop name, address, phone, SST number, paper width (58 or 80 mm).',
        'Settings → Payment types: cash, DuitNow QR, card, e-wallet, or your own.',
        'Press "Install" at the right of the address bar for a JEXO POS icon on the desktop.',
      ], tip: 'It keeps selling without internet and uploads when the connection returns.' },
      { id: 'items', title: 'Items and photos', video: V('pos-2-items'), steps: [
        'Items → Categories: make a few (drinks, groceries, food).',
        'Items → Item list → Add item: scan the barcode, or press Generate if it has none.',
        'Name, price, cost, category; Choose photo to upload or take one.',
        'Rice, sugar, eggs and other tax-free goods: Set taxes for many items, pick the category, tick all, untick every tax, apply.',
        'Restaurants: Items → Modifiers (sugar level, extra egg), then tick them on the item.',
        'To try first: Try sample items adds 13 items with pictures; remove them in one go later.',
      ] },
      { id: 'retail', title: 'Retail checkout', video: V('pos-3-retail'), steps: [
        'Tap a picture or scan with the scanner; the item goes on the bill.',
        '+ / − on a line changes the quantity; tap the line to change price, discount or note (with permission).',
        'Customer picks a member, or scan their member card or NFC card.',
        'Charge → payment type → amount received (or a quick amount).',
        'Cash is rounded to the 5 sen; the change is shown and the receipt prints.',
      ] },
      { id: 'market', title: 'Supermarket checkout', video: V('pos-4-market'), steps: [
        'Supermarket mode: a big scan box — just keep scanning; the bill is a list with a big total.',
        'Several of the same: type 3* then scan, or press Qty ×.',
        'Price check: scan to see the price without selling.',
        'Quick items: tap bread or vegetables that have no barcode.',
        'Hold a bill to serve the next customer; Recall it to carry on.',
      ] },
      { id: 'fnb', title: 'Restaurant ordering', video: V('pos-5-fnb'), steps: [
        'Tables to pick a table, or choose dine-in / take-away / delivery at the top.',
        'Add dishes; ones with modifiers ask for sugar level, extra egg and so on.',
        'Kitchen prints only what is new.',
        'Save, and open the table again from Tables to take payment.',
        'Service charge on dine-in only; payment can be split.',
      ] },
      { id: 'reports', title: 'Reports, voids and export', video: V('pos-6-reports'), steps: [
        'Reports → Summary: today’s sales, gross profit and receipts.',
        'By item, category, employee, payment type, modifier, discount and tax — one page each.',
        'Receipts: open one to reprint; a void needs a reason and is never deleted.',
        'Export any page to Excel for the accountant.',
      ] },
      { id: 'hardware', title: 'Scanner, printer, NFC', steps: [
        'USB barcode scanner: plug it in, nothing to install.',
        'Receipt printer (58 / 80 mm thermal): install its driver, choose it the first time you print, margins "None".',
        'No scanner: press the camera next to the scan box to use the computer’s or phone’s camera.',
        'On an Android phone in Chrome, the POS reads NFC member cards and tags.',
      ] },
    ],
  },
  ms: {
    intro: 'Ikut langkah di bawah dan anda boleh mula menjual pada petang yang sama. Setiap bahagian ada video pendek.',
    sections: [
      { id: 'start', title: 'Mula guna', video: V('pos-1-start'), steps: [
        'Buka POS dengan Chrome di komputer atau tablet, log masuk dengan akaun aplikasi JEXO Count.',
        'Kali pertama, ia bertanya jenis kedai: restoran, pasar raya / pasar mini, atau kedai runcit.',
        'Tetapan → Cukai: tambah SST hanya jika berdaftar; tandakan "lalai" untuk kadar kebanyakan barang.',
        'Tetapan → Resit: nama kedai, alamat, telefon, no. SST, lebar kertas (58 atau 80 mm).',
        'Tetapan → Jenis bayaran: tunai, DuitNow QR, kad, e-dompet, atau sendiri.',
        'Tekan "Pasang" di hujung bar alamat untuk ikon JEXO POS di desktop.',
      ], tip: 'Ia terus menjual tanpa internet dan memuat naik bila talian kembali.' },
      { id: 'items', title: 'Barang dan gambar', video: V('pos-2-items'), steps: [
        'Barang → Kategori: buat beberapa (minuman, runcit, makanan).',
        'Barang → Senarai barang → Tambah: imbas kod bar, atau tekan Jana jika tiada.',
        'Nama, harga, kos, kategori; Pilih gambar untuk muat naik atau ambil gambar.',
        'Beras, gula, telur dan barang tanpa cukai: Tetapkan cukai beramai, pilih kategori, tanda semua, nyahtanda semua cukai, guna.',
        'Restoran: Barang → Pilihan (tahap gula, tambah telur), kemudian tandakan pada barang.',
        'Untuk mencuba: Cuba barang contoh menambah 13 barang bergambar; buang sekali gus kemudian.',
      ] },
      { id: 'retail', title: 'Jualan kedai runcit', video: V('pos-3-retail'), steps: [
        'Tekan gambar atau imbas; barang masuk ke bil.',
        '+ / − pada baris menukar kuantiti; tekan baris untuk tukar harga, diskaun atau nota (dengan kebenaran).',
        'Pelanggan memilih ahli, atau imbas kad ahli atau kad NFC.',
        'Bayar → jenis bayaran → jumlah diterima (atau jumlah pantas).',
        'Tunai dibundarkan ke 5 sen; baki ditunjukkan dan resit dicetak.',
      ] },
      { id: 'market', title: 'Jualan pasar raya', video: V('pos-4-market'), steps: [
        'Mod pasar raya: kotak imbas besar — imbas terus; bil ialah senarai dengan jumlah besar.',
        'Beberapa yang sama: taip 3* kemudian imbas, atau tekan Kuantiti ×.',
        'Semak harga: imbas untuk lihat harga tanpa menjual.',
        'Barang pantas: tekan roti atau sayur yang tiada kod bar.',
        'Tahan bil untuk melayan pelanggan seterusnya; Panggil untuk sambung.',
      ] },
      { id: 'fnb', title: 'Pesanan restoran', video: V('pos-5-fnb'), steps: [
        'Meja untuk pilih meja, atau pilih makan sini / bungkus / hantar di atas.',
        'Tambah hidangan; yang ada pilihan akan bertanya tahap gula, tambah telur dan lain-lain.',
        'Dapur mencetak hanya yang baharu.',
        'Simpan, dan buka meja semula dari Meja untuk bayaran.',
        'Caj perkhidmatan untuk makan sini sahaja; bayaran boleh berpecah.',
      ] },
      { id: 'reports', title: 'Laporan, batal dan eksport', video: V('pos-6-reports'), steps: [
        'Laporan → Ringkasan: jualan hari ini, untung kasar dan bilangan resit.',
        'Ikut barang, kategori, pekerja, jenis bayaran, pilihan, diskaun dan cukai — satu halaman setiap satu.',
        'Resit: buka untuk cetak semula; pembatalan perlukan sebab dan tidak pernah dipadam.',
        'Eksport mana-mana halaman ke Excel untuk akauntan.',
      ] },
      { id: 'hardware', title: 'Pengimbas, pencetak, NFC', steps: [
        'Pengimbas kod bar USB: pasang sahaja, tiada perisian.',
        'Pencetak resit (58 / 80 mm terma): pasang pemacunya, pilih kali pertama mencetak, margin "Tiada".',
        'Tiada pengimbas: tekan kamera di sebelah kotak imbas untuk guna kamera komputer atau telefon.',
        'Di telefon Android dengan Chrome, POS membaca kad ahli dan tag NFC.',
      ] },
    ],
  },
};

export const WAREHOUSE_GUIDE = {
  zh: {
    intro: '仓库系统和收银、JEXO Count app 用同一套商品和库存。货进、货出、货在哪里，都在这里做。',
    sections: [
      { id: 'setup', title: '开始设定', steps: [
        '手机或电脑用 Chrome 打开仓库系统，用同一个账号登录。手机上按「安装」变成 app。',
        '管理员：仓库和分店 → 新增地点 → 类型选「仓库」。',
        '在 JEXO Count app 的「角色」给员工权限：收货、调货、调整要「记录进出货」。',
        '开采购单要「开采购单和管理供应商」；批准要「批准采购单」。',
        '左下「现在在」选你人在哪个仓库或门店。',
      ], tip: '工人用手机：下面五个大按钮 —— 首页、收货、调货、库存、更多。' },
      { id: 'purchase', title: '采购单和补货', video: V('wh-1-purchase'), steps: [
        '采购单 → 补货建议：低于补货点的商品，系统建议订多少（补到「最多存」）。',
        '按「生成采购单草稿」，每个常用供应商一张。',
        '或「新采购单」：选供应商、送到哪里，扫商品，填数量和单价。',
        '没有审批权限的人按「提交审批」；老板按「批准」。',
        '批准后按「确认下单」，再按「复制发 WhatsApp」发给供应商。',
      ] },
      { id: 'online', title: '网购进货（拼多多、淘宝、Shopee、TikTok、Lazada）', steps: [
        '在购物 app 打开订单，长按文字 → 全选 → 复制（或复制订单邮件）。',
        '仓库系统 → 网购进货：选平台，把订单贴进去，按「读取订单」。',
        '核对：每一样配对到你的商品（系统会猜，下次同一样会记得）；新东西按「新增商品」；赠品勾「不入库」。',
        '人民币订单填今天的汇率；运费可以算进成本。按「保存采购单」。',
        '包裹到了：收货 → 扫包裹上的运单号 → 一样一样扫 → 完成收货，库存才增加。',
      ], tip: '这些平台没有开放买家订单接口，所以是复制贴上，不是自动拉取；同一张订单贴两次会被挡下。' },
      { id: 'receive', title: '收货', video: V('wh-2-receive'), steps: [
        '收货 → 选这批货的采购单（没有采购单也可以收）。',
        '填送货单号，然后一样一样扫；同一样扫几次就是几件。',
        '点那一行：填损坏和退回。损坏的不进库存，退回的采购单会继续等。',
        '全部刚好就按「全部照单收到」。',
        '按「完成收货」：库存马上增加，收银和 app 都看得到。',
      ] },
      { id: 'transfer', title: '调货（仓库 ↔ 门店）', video: V('wh-3-transfer'), steps: [
        '调货 → 新调货：从哪里、送去哪里，扫要送的货。',
        '按「发货」：发出的地点马上扣库存，货变成「在途」。',
        '收货的地点：调货 →「待我收」→ 打开，扫到了什么。',
        '少了的会记成「运输差异」，按「确认收到」。',
        '发错了可以「取消调货」，货会退回发出的地点。',
      ] },
      { id: 'stock', title: '库存和调整', video: V('wh-4-stock'), steps: [
        '库存：每样商品现有、在途、订购中、可用、价值；可以只看低库存或没货。',
        '点商品：「为什么是 X？」—— 最后盘点，加上之后每一笔进出。',
        '在商品页设补货点、最多存、常用供应商、成本。',
        '调整库存：扫商品，选减少 / 增加 / 改成实际数量，一定要选原因。',
      ] },
      { id: 'check', title: '盘点差异和操作记录', video: V('wh-5-check'), steps: [
        '盘点在 JEXO Count app 做；完成后这里会看到和账面差多少、值多少钱。',
        '点一次盘点，看哪些商品短少，再点商品查每一笔进出。',
        '操作记录：每一次收货、调货、调整、审批都在，没有人能改或删。',
      ] },
    ],
  },
  en: {
    intro: 'The warehouse system shares items and stock with the till and the JEXO Count app. Goods in, goods out, and where everything is — all here.',
    sections: [
      { id: 'setup', title: 'Setting up', steps: [
        'Open the warehouse system in Chrome on a phone or computer and sign in with the same account. On a phone, press Install to make it an app.',
        'Admin: Warehouses & branches → Add a place → type Warehouse.',
        'In the JEXO Count app’s roles, give staff "Record goods in/out" to receive, transfer and adjust.',
        'Raising purchase orders needs "Raise purchase orders"; approving needs "Approve purchase orders".',
        'Bottom left, "Working at": choose the warehouse or shop you are in.',
      ], tip: 'Workers on a phone get five big buttons along the bottom: Home, Receive, Transfers, Stock, More.' },
      { id: 'purchase', title: 'Purchase orders and reorder', video: V('wh-1-purchase'), steps: [
        'Purchase orders → Reorder: items below their reorder point, with how much to order (up to the maximum).',
        'Make draft purchase orders: one per usual supplier.',
        'Or New purchase order: supplier, deliver to, scan items, quantity and unit cost.',
        'Without approval rights, press Send for approval; the owner presses Approve.',
        'Once approved, mark it ordered and Copy for WhatsApp to send to the supplier.',
      ] },
      { id: 'online', title: 'Online purchases (Pinduoduo, Taobao, Shopee, TikTok, Lazada)', steps: [
        'In the shopping app open the order, press and hold the text, Select all, Copy (or copy the order email).',
        'Warehouse → Online purchases: pick the platform, paste the order, press Read the order.',
        'Check it: match each item to one of your products (a best guess is offered, and remembered next time); New product for something new; tick Not stock for free gifts.',
        'For orders in yuan, enter today\'s rate; shipping can go into the cost. Press Save purchase order.',
        'When the parcel arrives: Receive → scan the tracking number on the label → scan the items → Complete. Only then does stock go up.',
      ], tip: 'These platforms have no way for another program to read a buyer\'s orders, so it is copy and paste, not automatic; the same order pasted twice is refused.' },
      { id: 'receive', title: 'Receiving', video: V('wh-2-receive'), steps: [
        'Receive → pick the purchase order for the delivery (or receive without one).',
        'Enter the delivery note number, then scan each item; scanning twice is two.',
        'Tap a line for damaged and sent-back goods. Damaged is not stocked; the order still waits for what was sent back.',
        'All as ordered? Press Everything arrived as ordered.',
        'Complete receiving: stock goes up at once for the till and the app.',
      ] },
      { id: 'transfer', title: 'Transfers (warehouse ↔ shop)', video: V('wh-3-transfer'), steps: [
        'Transfers → New transfer: from, to, and scan what goes.',
        'Dispatch: stock leaves the sending place at once and is in transit.',
        'At the other place: Transfers → To receive → open it and scan what arrived.',
        'Anything missing is kept as a transit difference; press Receive.',
        'Sent by mistake? Cancel transfer returns the goods to the sender.',
      ] },
      { id: 'stock', title: 'Stock and adjustments', video: V('wh-4-stock'), steps: [
        'Stock: on hand, in transit, on order, available and value for each item; filter low or out of stock.',
        'Open an item: "Why is it X?" — the last count plus every movement since.',
        'Set the reorder point, maximum, usual supplier and cost on the item.',
        'Adjust stock: scan, choose less / more / set to actual, and always a reason.',
      ] },
      { id: 'check', title: 'Count differences and the audit log', video: V('wh-5-check'), steps: [
        'Counts are made in the JEXO Count app; here you see how far each was from the books, and what it is worth.',
        'Open a count to see what is short, then open an item for every movement.',
        'Audit log: every receiving, transfer, adjustment and approval — nobody can change or delete them.',
      ] },
    ],
  },
  ms: {
    intro: 'Sistem gudang berkongsi barang dan stok dengan POS dan aplikasi JEXO Count. Barang masuk, keluar, dan di mana semuanya — semua di sini.',
    sections: [
      { id: 'setup', title: 'Persediaan', steps: [
        'Buka sistem gudang dengan Chrome di telefon atau komputer, log masuk dengan akaun yang sama. Di telefon, tekan Pasang.',
        'Admin: Gudang & cawangan → Tambah lokasi → jenis Gudang.',
        'Dalam peranan aplikasi JEXO Count, beri pekerja "Rekod barang masuk/keluar" untuk terima, pindah dan laras.',
        'Membuat pesanan belian perlukan "Buat pesanan belian"; meluluskan perlukan "Luluskan pesanan belian".',
        'Bawah kiri, "Bekerja di": pilih gudang atau kedai anda.',
      ], tip: 'Pekerja di telefon dapat lima butang besar di bawah: Utama, Terima, Pindahan, Stok, Lagi.' },
      { id: 'purchase', title: 'Pesanan belian dan tambah stok', video: V('wh-1-purchase'), steps: [
        'Pesanan belian → Tambah stok: barang di bawah paras, dengan berapa perlu dipesan (hingga maksimum).',
        'Buat draf pesanan: satu untuk setiap pembekal biasa.',
        'Atau Pesanan baharu: pembekal, hantar ke, imbas barang, kuantiti dan kos seunit.',
        'Tanpa hak kelulusan, tekan Hantar untuk kelulusan; pemilik tekan Luluskan.',
        'Selepas diluluskan, tandakan sudah dipesan dan Salin untuk WhatsApp kepada pembekal.',
      ] },
      { id: 'online', title: 'Belian dalam talian (Pinduoduo, Taobao, Shopee, TikTok, Lazada)', steps: [
        'Dalam aplikasi beli-belah buka pesanan, tekan lama teks, Pilih semua, Salin (atau salin e-mel pesanan).',
        'Gudang → Belian dalam talian: pilih platform, tampal pesanan, tekan Baca pesanan.',
        'Semak: padankan setiap barang dengan barang anda (tekaan diberi, dan diingati lain kali); Barang baharu untuk yang baru; tanda Bukan stok untuk hadiah percuma.',
        'Untuk pesanan dalam yuan, masukkan kadar hari ini; kos penghantaran boleh dimasukkan ke kos. Tekan Simpan pesanan belian.',
        'Bila bungkusan sampai: Terima → imbas nombor penjejakan pada label → imbas barang → Selesai. Barulah stok bertambah.',
      ], tip: 'Platform ini tidak membenarkan program lain membaca pesanan pembeli, jadi ia salin dan tampal, bukan automatik; pesanan yang sama ditampal dua kali ditolak.' },
      { id: 'receive', title: 'Terima barang', video: V('wh-2-receive'), steps: [
        'Terima → pilih pesanan belian untuk penghantaran (atau terima tanpa PO).',
        'Isi no. nota hantaran, kemudian imbas setiap barang; imbas dua kali ialah dua.',
        'Tekan baris untuk barang rosak dan dipulangkan. Rosak tidak masuk stok; pesanan masih menunggu yang dipulangkan.',
        'Semua seperti dipesan? Tekan Semua tiba seperti dipesan.',
        'Selesai terima: stok naik serta-merta untuk POS dan aplikasi.',
      ] },
      { id: 'transfer', title: 'Pindahan (gudang ↔ kedai)', video: V('wh-3-transfer'), steps: [
        'Pindahan → Pindahan baharu: dari, ke, dan imbas barang.',
        'Hantar: stok terus keluar dari lokasi penghantar dan dalam perjalanan.',
        'Di lokasi lain: Pindahan → Untuk diterima → buka dan imbas apa yang tiba.',
        'Yang hilang dicatat sebagai beza perjalanan; tekan Terima.',
        'Tersilap hantar? Batal pindahan memulangkan barang ke penghantar.',
      ] },
      { id: 'stock', title: 'Stok dan pelarasan', video: V('wh-4-stock'), steps: [
        'Stok: ada, dalam perjalanan, dipesan, tersedia dan nilai setiap barang; tapis rendah atau habis.',
        'Buka barang: "Kenapa X?" — kiraan terakhir dan setiap pergerakan selepasnya.',
        'Tetapkan paras tambah, maksimum, pembekal biasa dan kos pada barang.',
        'Laras stok: imbas, pilih kurang / tambah / tetapkan sebenar, dan sentiasa sebab.',
      ] },
      { id: 'check', title: 'Beza kiraan dan log audit', video: V('wh-5-check'), steps: [
        'Kiraan dibuat dalam aplikasi JEXO Count; di sini anda lihat bezanya dengan buku dan nilainya.',
        'Buka kiraan untuk lihat yang kurang, kemudian buka barang untuk setiap pergerakan.',
        'Log audit: setiap penerimaan, pindahan, pelarasan dan kelulusan — tiada siapa boleh ubah atau padam.',
      ] },
    ],
  },
};

export const APP_GUIDE = {
  zh: {
    intro: 'JEXO Count 是 Android 手机盘点 app。下面的短片是步骤卡，一步一步说明。',
    sections: [
      { id: 'count', title: '手机盘点', video: V('app-1-count'), steps: [
        '「盘点」→ 新盘点，选模板和区域。',
        '用镜头扫条码，输入数到多少；也可以说「五个鸡蛋」，或用 NFC 标签。',
        '按完成，马上看到短少或多出。',
        '「历史」里可以导出 Excel、CSV 或打印。',
      ] },
      { id: 'stock', title: '库存和进出货', video: V('app-2-stock'), steps: [
        '「库存」页：现在有多少 = 最后盘点 + 之后进出。',
        '用 Excel / CSV 导入进货和销售，或连接 Loyverse 自动同步。',
        'JEXO POS 卖出，库存马上减少；设补货点就会提醒。',
      ] },
      { id: 'team', title: '员工、分店和权限', video: V('app-3-team'), steps: [
        '第一个注册的人是管理员；员工用公司代码加入。',
        '「我的」→ 角色：设定谁能盘点、看全部、改库存、用收银和仓库。',
        '分店和仓库分开算；操作记录保留每一次修改。',
      ] },
    ],
  },
  en: {
    intro: 'JEXO Count is the Android stock-take app. The short videos are step cards that walk through each job.',
    sections: [
      { id: 'count', title: 'Counting with the phone', video: V('app-1-count'), steps: [
        'Stock tab → new count; pick a template and an area.',
        'Scan barcodes with the camera and enter how many; or say "five eggs", or use NFC tags.',
        'Finish to see what is short or over at once.',
        'Export Excel or CSV, or print, from History.',
      ] },
      { id: 'stock', title: 'Stock, goods in and out', video: V('app-2-stock'), steps: [
        'On hand tab: on hand = last count + goods in and out since.',
        'Import deliveries and sales from Excel / CSV, or connect Loyverse to sync.',
        'Sales at JEXO POS take stock off at once; set reorder points for reminders.',
      ] },
      { id: 'team', title: 'Staff, branches and permissions', video: V('app-3-team'), steps: [
        'The first to register is the admin; staff join with the company code.',
        'Profile tab → Roles: who may count, see everything, change stock, use the till and the warehouse.',
        'Branches and warehouses are kept apart; the audit log keeps every change.',
      ] },
    ],
  },
  ms: {
    intro: 'JEXO Count ialah aplikasi kira stok Android. Video pendek ialah kad langkah untuk setiap tugas.',
    sections: [
      { id: 'count', title: 'Kira stok dengan telefon', video: V('app-1-count'), steps: [
        'Tab Stok → kiraan baharu; pilih templat dan kawasan.',
        'Imbas kod bar dengan kamera dan isi kuantiti; atau sebut "lima telur", atau guna tag NFC.',
        'Selesai untuk lihat kurang atau lebih serta-merta.',
        'Eksport Excel atau CSV, atau cetak, dari Sejarah.',
      ] },
      { id: 'stock', title: 'Stok, barang masuk dan keluar', video: V('app-2-stock'), steps: [
        'Tab Baki stok: baki = kiraan terakhir + masuk dan keluar sejak itu.',
        'Import penghantaran dan jualan dari Excel / CSV, atau sambung Loyverse.',
        'Jualan di JEXO POS menolak stok serta-merta; tetapkan paras tambah untuk peringatan.',
      ] },
      { id: 'team', title: 'Pekerja, cawangan dan kebenaran', video: V('app-3-team'), steps: [
        'Yang pertama mendaftar ialah admin; pekerja masuk dengan kod syarikat.',
        'Profil → Peranan: siapa boleh kira, lihat semua, ubah stok, guna POS dan gudang.',
        'Cawangan dan gudang berasingan; log audit menyimpan setiap perubahan.',
      ] },
    ],
  },
};
