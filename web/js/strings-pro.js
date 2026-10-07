/**
 * Words for shifts, the receipt printer and cash drawer, price labels, the
 * e-invoice, PDPA and plans -- in the site's three languages. Loaded once by
 * main.js; added to the dictionaries in i18n.js.
 */
import { addStrings } from './i18n.js';

const en = {
  // shifts
  noData: 'Nothing in this period.', shift: 'Shift', shiftNone: 'No shift open', shiftOpenSince: 'Shift since', openShift: 'Open shift', closeShift: 'Close shift',
  openingFloat: 'Opening float (cash in the drawer now)', shiftOpened: 'Shift opened', shiftClosed: 'Shift closed',
  shiftNeeded: 'Open a shift first: count the cash in the drawer.', countedCash: 'Cash counted in the drawer',
  expectedCash: 'Expected cash', shortOver: 'Short / over', short: 'Short', over: 'Over',
  cashSales: 'Cash sales', cashIn: 'Cash in', cashOut: 'Cash out', cashMove: 'Cash in / out', voids: 'Voids', printSlip: 'Print shift slip', shiftSlip: 'Shift report',
  floatLabel: 'Opening float', signature: 'Signature', repShifts: 'Shifts', operator: 'Cashier', opened: 'Opened', closedAtLabel: 'Closed',
  stillOpen: 'Open', requireShift: 'Cashiers must open a shift before selling', requireShiftHelp: 'Counts the drawer at the start and end of each shift, and shows what is short or over.',
  closeShiftQ: 'Close this shift? Count the cash in the drawer first.', shiftSummary: 'This shift so far',
  // printer and drawer
  printerTitle: 'Receipt printer', printerBrowser: 'Through the browser (print box)', printerDirect: 'Straight to the printer (opens the cash drawer)',
  printerConnectUsb: 'Connect USB printer', printerConnectSerial: 'Connect serial / Bluetooth printer', printerConnected: 'Connected',
  printerNone: 'No printer connected', printerTest: 'Test print', printerHelp: 'Straight printing works in Chrome or Edge on a computer. The cash drawer plugs into the printer\'s DK port.',
  openDrawer: 'Open drawer', drawerOnCash: 'Open the cash drawer for cash payments', printerForget: 'Disconnect',
  // labels
  labels: 'Price labels', labelSize: 'Label size', copies: 'Copies of each', printLabels: 'Print labels',
  labelsHelp: 'Tick the items, choose the label size, then print on the label printer (one label per page).',
  // e-invoice
  repEinvoice: 'e-Invoice (LHDN)', einvoiceTitle: 'Consolidated e-Invoice for MyInvois',
  einvoiceHelp: 'Sales to the public with no e-invoice of their own go into one consolidated e-invoice a month, sent within 7 days after the month ends. Download it here and submit it in the MyInvois portal (or pass it to your accountant).',
  einvoiceMonth: 'Month', downloadJson: 'Download JSON (MyInvois)', downloadCsv: 'Download CSV', einvoiceNone: 'No sales in this month.',
  einvoiceSeller: 'Your details for the e-invoice', tin: 'Tax ID (TIN)', msic: 'MSIC code', msicName: 'Business activity',
  einvoiceMissing: 'Fill in your TIN and MSIC code under Settings → Receipt first.', receiptsIncluded: 'receipts',
  // PDPA
  pdpaUnsubscribe: 'Remove (PDPA)', pdpaUnsubscribeQ: 'Remove this customer? They are hidden at once and erased for good after 90 days. Within 90 days this can be undone.',
  pdpaRestore: 'Undo removal', pdpaLocked: 'Removed — erased in', days: 'days', pdpaErased: 'erased (PDPA)', exportExcel: 'Export Excel',
  pdpaHelp: 'A customer who asks to be removed is hidden at once and erased for good after 90 days (PDPA 2010).',
  pdpaPurged: 'customers erased after their 90 days',
  // plans
  planNoPos: 'Your plan does not include the POS. It comes with the All-in-One plans or the POS pack.',
  planNoWarehouse: 'Your plan does not include the warehouse system.',
  planNoBranches: 'More branches and warehouses come with the Business and Unlimited plans.',
  tillLimit: 'Your plan allows {n} tills, and they are in use. Remove one under Settings → Device, or upgrade the plan.',
  tills: 'Tills on this plan', removeTill: 'Remove', tillName: 'Till name',
};

const zh = {
  noData: '这段时间没有记录。', shift: '班次', shiftNone: '未开班', shiftOpenSince: '开班于', openShift: '开班', closeShift: '交班',
  openingFloat: '开班备用金（现在钱箱里的现金）', shiftOpened: '已开班', shiftClosed: '已交班',
  shiftNeeded: '请先开班：数一数钱箱里的现金。', countedCash: '钱箱实点现金',
  expectedCash: '应有现金', shortOver: '短少 / 多出', short: '短少', over: '多出',
  cashSales: '现金销售', cashIn: '放入现金', cashOut: '取出现金', cashMove: '现金进出', voids: '作废', printSlip: '打印交班单', shiftSlip: '交班报表',
  floatLabel: '备用金', signature: '签名', repShifts: '交班记录', operator: '收银员', opened: '开班', closedAtLabel: '交班',
  stillOpen: '进行中', requireShift: '收银员要先开班才能收钱', requireShiftHelp: '每班开始和结束都点钱箱，马上知道短少或多出。',
  closeShiftQ: '要交班吗？请先点好钱箱里的现金。', shiftSummary: '本班到现在',
  printerTitle: '收据打印机', printerBrowser: '用浏览器打印（会跳出打印框）', printerDirect: '直接打印（可以自动开钱箱）',
  printerConnectUsb: '连接 USB 打印机', printerConnectSerial: '连接串口 / 蓝牙打印机', printerConnected: '已连接',
  printerNone: '没有连接打印机', printerTest: '测试打印', printerHelp: '直接打印要在电脑上用 Chrome 或 Edge。钱箱插在打印机的 DK 口。',
  openDrawer: '开钱箱', drawerOnCash: '收现金时自动开钱箱', printerForget: '断开',
  labels: '价格标签', labelSize: '标签尺寸', copies: '每样几张', printLabels: '打印标签',
  labelsHelp: '勾选商品，选标签尺寸，再用标签机打印（一页一张）。',
  repEinvoice: '电子发票 (LHDN)', einvoiceTitle: 'MyInvois 合并电子发票',
  einvoiceHelp: '卖给一般顾客、没有另外开电子发票的销售，每个月合并成一张电子发票，在月底后 7 天内提交。在这里下载，再上传到 MyInvois 网站（或交给会计）。',
  einvoiceMonth: '月份', downloadJson: '下载 JSON（MyInvois）', downloadCsv: '下载 CSV', einvoiceNone: '这个月没有销售。',
  einvoiceSeller: '电子发票上的公司资料', tin: '税务号 (TIN)', msic: 'MSIC 行业代码', msicName: '业务性质',
  einvoiceMissing: '请先在「设置 → 收据」填好 TIN 和 MSIC 代码。', receiptsIncluded: '张收据',
  pdpaUnsubscribe: '删除顾客资料 (PDPA)', pdpaUnsubscribeQ: '要删除这位顾客吗？马上隐藏，90 天后永久删除。90 天内可以恢复。',
  pdpaRestore: '恢复', pdpaLocked: '已删除 — 永久删除倒数', days: '天', pdpaErased: '已删除 (PDPA)', exportExcel: '导出 Excel',
  pdpaHelp: '顾客要求删除资料：马上隐藏，90 天后永久删除（个人资料保护法 PDPA 2010）。',
  pdpaPurged: '位顾客满 90 天，已永久删除',
  planNoPos: '你的配套没有收银系统。全功能配套或「收银单独配套」才有。',
  planNoWarehouse: '你的配套没有仓库系统。',
  planNoBranches: '多分店 / 多仓库要 Business 或 Unlimited 配套。',
  tillLimit: '你的配套只可以用 {n} 台收银机，已经用满了。请在「设置 → 本机」移除一台，或升级配套。',
  tills: '这个配套的收银机', removeTill: '移除', tillName: '收银机名称',
};

const ms = {
  noData: 'Tiada rekod dalam tempoh ini.', shift: 'Syif', shiftNone: 'Tiada syif dibuka', shiftOpenSince: 'Syif sejak', openShift: 'Buka syif', closeShift: 'Tutup syif',
  openingFloat: 'Wang apungan (tunai dalam laci sekarang)', shiftOpened: 'Syif dibuka', shiftClosed: 'Syif ditutup',
  shiftNeeded: 'Buka syif dahulu: kira tunai dalam laci.', countedCash: 'Tunai dikira dalam laci',
  expectedCash: 'Tunai sepatutnya', shortOver: 'Kurang / lebih', short: 'Kurang', over: 'Lebih',
  cashSales: 'Jualan tunai', cashIn: 'Tunai masuk', cashOut: 'Tunai keluar', cashMove: 'Tunai masuk / keluar', voids: 'Batal', printSlip: 'Cetak slip syif', shiftSlip: 'Laporan syif',
  floatLabel: 'Wang apungan', signature: 'Tandatangan', repShifts: 'Syif', operator: 'Juruwang', opened: 'Dibuka', closedAtLabel: 'Ditutup',
  stillOpen: 'Dibuka', requireShift: 'Juruwang mesti buka syif sebelum menjual', requireShiftHelp: 'Kira laci pada awal dan akhir setiap syif, dan tunjuk kurang atau lebih.',
  closeShiftQ: 'Tutup syif ini? Kira tunai dalam laci dahulu.', shiftSummary: 'Syif ini setakat ini',
  printerTitle: 'Pencetak resit', printerBrowser: 'Melalui pelayar (kotak cetak)', printerDirect: 'Terus ke pencetak (buka laci tunai)',
  printerConnectUsb: 'Sambung pencetak USB', printerConnectSerial: 'Sambung pencetak bersiri / Bluetooth', printerConnected: 'Bersambung',
  printerNone: 'Tiada pencetak', printerTest: 'Cetak ujian', printerHelp: 'Cetak terus berfungsi dalam Chrome atau Edge pada komputer. Laci tunai dipasang pada port DK pencetak.',
  openDrawer: 'Buka laci', drawerOnCash: 'Buka laci tunai untuk bayaran tunai', printerForget: 'Putuskan',
  labels: 'Label harga', labelSize: 'Saiz label', copies: 'Salinan setiap satu', printLabels: 'Cetak label',
  labelsHelp: 'Tanda barang, pilih saiz label, kemudian cetak pada pencetak label (satu label sehalaman).',
  repEinvoice: 'e-Invois (LHDN)', einvoiceTitle: 'e-Invois disatukan untuk MyInvois',
  einvoiceHelp: 'Jualan kepada orang awam tanpa e-invois sendiri disatukan dalam satu e-invois sebulan, dihantar dalam 7 hari selepas bulan berakhir. Muat turun di sini dan hantar di portal MyInvois (atau beri kepada akauntan).',
  einvoiceMonth: 'Bulan', downloadJson: 'Muat turun JSON (MyInvois)', downloadCsv: 'Muat turun CSV', einvoiceNone: 'Tiada jualan bulan ini.',
  einvoiceSeller: 'Butiran anda untuk e-invois', tin: 'No. cukai (TIN)', msic: 'Kod MSIC', msicName: 'Aktiviti perniagaan',
  einvoiceMissing: 'Isi TIN dan kod MSIC di Tetapan → Resit dahulu.', receiptsIncluded: 'resit',
  pdpaUnsubscribe: 'Padam (PDPA)', pdpaUnsubscribeQ: 'Padam pelanggan ini? Disembunyikan serta-merta dan dipadam terus selepas 90 hari. Boleh dibatalkan dalam 90 hari.',
  pdpaRestore: 'Batal padam', pdpaLocked: 'Dipadam — dihapus dalam', days: 'hari', pdpaErased: 'dihapus (PDPA)', exportExcel: 'Eksport Excel',
  pdpaHelp: 'Pelanggan yang minta dipadam disembunyikan serta-merta dan dihapus terus selepas 90 hari (PDPA 2010).',
  pdpaPurged: 'pelanggan dihapus selepas 90 hari',
  planNoPos: 'Pelan anda tidak termasuk POS. Ia ada dalam pelan Semua-dalam-Satu atau pek POS.',
  planNoWarehouse: 'Pelan anda tidak termasuk sistem gudang.',
  planNoBranches: 'Cawangan dan gudang tambahan ada dalam pelan Business dan Unlimited.',
  tillLimit: 'Pelan anda membenarkan {n} kaunter dan semuanya digunakan. Buang satu di Tetapan → Peranti, atau naik taraf pelan.',
  tills: 'Kaunter pada pelan ini', removeTill: 'Buang', tillName: 'Nama kaunter',
};

addStrings({ en, zh, ms });
