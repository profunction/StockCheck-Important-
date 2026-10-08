/**
 * The bot's answers beyond stock, sales and the report (bot.mjs): out of
 * stock, profit, best sellers, sales by cashier, stock value, purchase
 * orders waiting, prices -- and what it says when it does not understand.
 * Pure, tested in answers.test.mjs.
 */
import { qty, rangeLabel, rm, words } from './bot.mjs';

const A = {
  zh: {
    period: { today: '今天', yesterday: '昨天', dayBefore: '前天', week: '最近 7 天', lastWeek: '上个星期', month: '这个月', lastMonth: '上个月' },
    outHead: (n) => `🚫 没货了（${n} 样）`, outNone: '✅ 没有卖完的商品。',
    profitHead: (p, d) => `💹 ${p}的利润（${d}）`, sales: '销售（未含税）', cost: '成本', profit: '毛利', margin: '利润率',
    noCost: '提示：有些商品没有填成本，利润会算多了。在 商品 → 商品清单 填成本。',
    topHead: (p, d) => `🏆 ${p}最好卖（${d}）`, pcs: '件',
    staffHead: (p, d) => `👥 ${p}谁卖最多（${d}）`, receipts: '单',
    valueHead: '📦 库存价值（按成本）', valueTotal: '合计', valueNoCost: (n) => `有 ${n} 样商品没有成本，没算进去。`,
    poHead: (n) => `🧾 等收货的采购单（${n} 张）`, poNone: '✅ 没有等收货的采购单。', poExpected: '预计',
    status: { SUBMITTED: '待批准', APPROVED: '已批准', ORDERED: '已下单', PARTIAL: '部分收到' },
    priceHead: '🏷️ 价钱', noSales: '这段时间没有销售。',
    dontKnow: (q) => `我不太明白「${q}」。可以这样问：\n• Milo 还有多少？\n• 今天 / 这个月卖了多少？\n• 这个月赚多少？\n• 什么最好卖？\n• 有什么没货了？\n发「帮助」看全部。`,
    mailSent: (to) => `📧 已把昨天的报告发到：${to}\n收不到的话看看垃圾邮件。`, mailOff: '邮件还没设置好：Google Cloud 里少了 smtp-user 或 smtp-pass。',
    mailFail: (e) => `📧 发不出去：${e}\n多数是 Gmail 应用专用密码不对，请重新生成再放进 smtp-pass。`, mailAdmin: '只有老板可以发测试邮件。',
    examplesHead: '可以这样问我（中文、English、Bahasa 都可以）：',
    greet: (n) => `你好${n ? ` ${n}` : ''} 👋 想知道什么？\n例如：今天卖了多少？ / Milo 还有多少？ / 有什么没货了？`,
    thanks: '不客气 🙂 有需要随时问我。',
    langSet: '好的，以后用中文回答。',
    dailyOff: '🔕 已关掉每日报告。要再收，发「打开每日报告」。',
    dailyOn: '🔔 已打开每日报告，每天早上 8 点发给你。',
    whoami: (u) => `👤 ${u.name}\n公司：${u.company}\n角色：${u.role}\n地点：${u.places}`, admin: '老板（全部权限）', everywhere: '全部',
    branchesHead: (n) => `🏪 ${n} 个地点`,
    shiftHead: (n) => `🟢 开着的班（${n}）`, shiftNone: '现在没有人开班。', since: '从', float: '备用金',
    compareHead: (p) => `📈 ${p}对比`, now: '这次', before: '上次', change: '变化', profitLine: '毛利',
    busyHead: (p, d) => `⏰ ${p}最忙的时间（${d}）`,
    slowHead: (n) => `🐢 30 天没卖出的商品（${n} 样，还有库存）`, slowNone: '✅ 有库存的商品最近 30 天都有卖出。', left: '剩',
    writeoffHead: (p, d) => `🗑️ ${p}的报损（${d}）`, writeoffNone: '没有报损。',
    receiveHead: (p, d) => `🚚 ${p}进货（${d}）`, receiveNone: '没有进货记录。',
    voidsHead: (p, d) => `↩️ ${p}作废 / 退款（${d}）`, voidsNone: '没有作废或退款的单。', voidsTotal: (n, sen) => `${n} 单，共 ${sen}`,
    taxHead: (p, d) => `🧾 ${p}的税（${d}）`, taxLine: (sen, n) => `收了 ${sen}（${n} 单有税）`, taxNone: '没有收税。',
    custHead: '👥 会员 / 顾客', custCount: (n) => `一共 ${n} 位`, custNew: (p, n) => `${p}新加 ${n} 位`, custTop: '花最多的：', custNone: '还没有会员。',
    itemSold: (name, p, d, q, sen) => `🧾 ${name}\n${p}（${d}）卖了 ${q} · ${sen}`,
    noRight: '你的账号不能看这个。请老板在「员工 → 角色」给你权限。',
  },
  en: {
    period: { today: 'today', yesterday: 'yesterday', dayBefore: 'the day before yesterday', week: 'the last 7 days', lastWeek: 'the week before', month: 'this month', lastMonth: 'last month' },
    outHead: (n) => `🚫 Out of stock (${n})`, outNone: '✅ Nothing is sold out.',
    profitHead: (p, d) => `💹 Profit, ${p} (${d})`, sales: 'Sales (before tax)', cost: 'Cost', profit: 'Gross profit', margin: 'Margin',
    noCost: 'Note: some items have no cost, so the profit is overstated. Add costs under Items → Item list.',
    topHead: (p, d) => `🏆 Best sellers, ${p} (${d})`, pcs: 'pcs',
    staffHead: (p, d) => `👥 Sales by cashier, ${p} (${d})`, receipts: 'receipts',
    valueHead: '📦 Stock value (at cost)', valueTotal: 'Total', valueNoCost: (n) => `${n} items have no cost and are not counted.`,
    poHead: (n) => `🧾 Purchase orders waiting (${n})`, poNone: '✅ No purchase orders waiting.', poExpected: 'expected',
    status: { SUBMITTED: 'to approve', APPROVED: 'approved', ORDERED: 'ordered', PARTIAL: 'part received' },
    priceHead: '🏷️ Prices', noSales: 'No sales in this time.',
    dontKnow: (q) => `I did not understand "${q}". Try:\n• How many Milo?\n• Sales today / this month\n• Profit this month\n• Best sellers\n• What is out of stock?\nSend "help" for everything.`,
    mailSent: (to) => `📧 Yesterday's report was sent to: ${to}\nIf it does not arrive, look in spam.`, mailOff: 'Email is not set up: smtp-user or smtp-pass is missing in Google Cloud.',
    mailFail: (e) => `📧 Could not send: ${e}\nUsually the Gmail app password is wrong; make a new one and put it in smtp-pass.`, mailAdmin: 'Only the owner can send a test email.',
    examplesHead: 'You can ask me (in English, 中文 or Bahasa):',
    greet: (n) => `Hello${n ? ` ${n}` : ''} 👋 What would you like to know?\nFor example: sales today? / how many Milo? / what is out of stock?`,
    thanks: 'You are welcome 🙂 Ask me any time.',
    langSet: 'OK, I will answer in English.',
    dailyOff: '🔕 The daily report is off. Send "turn on daily report" to get it again.',
    dailyOn: '🔔 The daily report is on: every morning at 8.',
    whoami: (u) => `👤 ${u.name}\nCompany: ${u.company}\nRole: ${u.role}\nPlaces: ${u.places}`, admin: 'Owner (everything)', everywhere: 'all',
    branchesHead: (n) => `🏪 ${n} places`,
    shiftHead: (n) => `🟢 Open shifts (${n})`, shiftNone: 'No shift is open right now.', since: 'since', float: 'float',
    compareHead: (p) => `📈 ${p}, compared`, now: 'This time', before: 'Before', change: 'Change', profitLine: 'Gross profit',
    busyHead: (p, d) => `⏰ Busiest hours, ${p} (${d})`,
    slowHead: (n) => `🐢 Not sold in 30 days, still in stock (${n})`, slowNone: '✅ Everything in stock sold in the last 30 days.', left: 'left',
    writeoffHead: (p, d) => `🗑️ Write-offs, ${p} (${d})`, writeoffNone: 'No write-offs.',
    receiveHead: (p, d) => `🚚 Goods received, ${p} (${d})`, receiveNone: 'Nothing received.',
    voidsHead: (p, d) => `↩️ Voids and refunds, ${p} (${d})`, voidsNone: 'No voids or refunds.', voidsTotal: (n, sen) => `${n} receipts, ${sen} in all`,
    taxHead: (p, d) => `🧾 Tax, ${p} (${d})`, taxLine: (sen, n) => `Collected ${sen} (${n} receipts with tax)`, taxNone: 'No tax collected.',
    custHead: '👥 Customers', custCount: (n) => `${n} in all`, custNew: (p, n) => `${n} new, ${p}`, custTop: 'Spent the most:', custNone: 'No customers yet.',
    itemSold: (name, p, d, q, sen) => `🧾 ${name}\nSold ${p} (${d}): ${q} · ${sen}`,
    noRight: 'Your account may not see this. Ask the owner for the permission under Employees → Roles.',
  },
  ms: {
    period: { today: 'hari ini', yesterday: 'semalam', dayBefore: 'kelmarin', week: '7 hari lepas', lastWeek: 'minggu sebelumnya', month: 'bulan ini', lastMonth: 'bulan lepas' },
    outHead: (n) => `🚫 Stok habis (${n})`, outNone: '✅ Tiada barang habis.',
    profitHead: (p, d) => `💹 Untung, ${p} (${d})`, sales: 'Jualan (sebelum cukai)', cost: 'Kos', profit: 'Untung kasar', margin: 'Margin',
    noCost: 'Nota: sesetengah barang tiada kos, jadi untung terlebih. Isi kos di Barang → Senarai barang.',
    topHead: (p, d) => `🏆 Paling laris, ${p} (${d})`, pcs: 'unit',
    staffHead: (p, d) => `👥 Jualan ikut juruwang, ${p} (${d})`, receipts: 'resit',
    valueHead: '📦 Nilai stok (ikut kos)', valueTotal: 'Jumlah', valueNoCost: (n) => `${n} barang tiada kos dan tidak dikira.`,
    poHead: (n) => `🧾 Pesanan belian menunggu (${n})`, poNone: '✅ Tiada pesanan belian menunggu.', poExpected: 'dijangka',
    status: { SUBMITTED: 'untuk lulus', APPROVED: 'diluluskan', ORDERED: 'dipesan', PARTIAL: 'sebahagian diterima' },
    priceHead: '🏷️ Harga', noSales: 'Tiada jualan dalam tempoh ini.',
    dontKnow: (q) => `Saya tidak faham "${q}". Cuba:\n• Berapa stok Milo?\n• Jualan hari ini / bulan ini\n• Untung bulan ini\n• Paling laris\n• Apa stok habis?\nHantar "bantuan" untuk semua.`,
    mailSent: (to) => `📧 Laporan semalam dihantar ke: ${to}\nJika tiada, semak spam.`, mailOff: 'E-mel belum disediakan: smtp-user atau smtp-pass tiada di Google Cloud.',
    mailFail: (e) => `📧 Gagal hantar: ${e}\nBiasanya kata laluan aplikasi Gmail salah; buat yang baru dan masukkan ke smtp-pass.`, mailAdmin: 'Hanya pemilik boleh hantar e-mel ujian.',
    examplesHead: 'Anda boleh tanya (Bahasa, English atau 中文):',
    greet: (n) => `Hai${n ? ` ${n}` : ''} 👋 Apa yang anda mahu tahu?\nContoh: jualan hari ini? / berapa stok Milo? / apa stok habis?`,
    thanks: 'Sama-sama 🙂 Tanya bila-bila masa.',
    langSet: 'Baik, saya akan jawab dalam Bahasa Melayu.',
    dailyOff: '🔕 Laporan harian dimatikan. Hantar "hidupkan laporan harian" untuk terima semula.',
    dailyOn: '🔔 Laporan harian dihidupkan: setiap pagi jam 8.',
    whoami: (u) => `👤 ${u.name}\nSyarikat: ${u.company}\nPeranan: ${u.role}\nTempat: ${u.places}`, admin: 'Pemilik (semua)', everywhere: 'semua',
    branchesHead: (n) => `🏪 ${n} tempat`,
    shiftHead: (n) => `🟢 Syif dibuka (${n})`, shiftNone: 'Tiada syif dibuka sekarang.', since: 'sejak', float: 'apungan',
    compareHead: (p) => `📈 ${p}, berbanding`, now: 'Kali ini', before: 'Sebelum', change: 'Beza', profitLine: 'Untung kasar',
    busyHead: (p, d) => `⏰ Waktu paling sibuk, ${p} (${d})`,
    slowHead: (n) => `🐢 Tidak terjual 30 hari, masih ada stok (${n})`, slowNone: '✅ Semua barang berstok terjual dalam 30 hari.', left: 'tinggal',
    writeoffHead: (p, d) => `🗑️ Hapus kira, ${p} (${d})`, writeoffNone: 'Tiada hapus kira.',
    receiveHead: (p, d) => `🚚 Barang masuk, ${p} (${d})`, receiveNone: 'Tiada barang masuk.',
    voidsHead: (p, d) => `↩️ Batal dan pulangan, ${p} (${d})`, voidsNone: 'Tiada resit batal.', voidsTotal: (n, sen) => `${n} resit, jumlah ${sen}`,
    taxHead: (p, d) => `🧾 Cukai, ${p} (${d})`, taxLine: (sen, n) => `Dikutip ${sen} (${n} resit bercukai)`, taxNone: 'Tiada cukai dikutip.',
    custHead: '👥 Pelanggan', custCount: (n) => `${n} semuanya`, custNew: (p, n) => `${n} baru, ${p}`, custTop: 'Belanja paling banyak:', custNone: 'Belum ada pelanggan.',
    itemSold: (name, p, d, q, sen) => `🧾 ${name}\nTerjual ${p} (${d}): ${q} · ${sen}`,
    noRight: 'Akaun anda tidak boleh lihat ini. Minta pemilik beri kebenaran di Pekerja → Peranan.',
  },
};
const a = (lang) => A[lang] || A.zh;

/** Everything at or below nothing: [outs] is [{ name, place }]. */
export function outText(outs, lang = 'zh', max = 20) {
  const w = a(lang);
  if (!outs.length) return w.outNone;
  const lines = outs.slice(0, max).map((o) => `• ${o.name}${o.place ? ` (${o.place})` : ''}`);
  if (outs.length > max) lines.push(words(lang).more(outs.length - max));
  return [w.outHead(outs.length), ...lines].join('\n');
}

export function profitText(summary, { lang = 'zh', period = 'today', start, end, missingCost = 0 } = {}) {
  const w = a(lang);
  const head = w.profitHead(w.period[period], rangeLabel(start, end));
  if (!summary.receipts) return `${head}\n${w.noSales}`;
  const pct = summary.lineSen ? Math.round((summary.profitSen / summary.lineSen) * 1000) / 10 : 0;
  return [head,
    `${w.sales}: ${rm(summary.lineSen)}`,
    `${w.cost}: ${rm(summary.costSen)}`,
    lang === 'zh' ? `${w.profit}: ${rm(summary.profitSen)}（${w.margin} ${pct}%）` : `${w.profit}: ${rm(summary.profitSen)} (${w.margin} ${pct}%)`,
    missingCost ? w.noCost : '',
  ].filter(Boolean).join('\n');
}

export function topText(summary, { lang = 'zh', period = 'today', start, end, max = 10 } = {}) {
  const w = a(lang);
  const head = w.topHead(w.period[period], rangeLabel(start, end));
  if (!summary.items.length) return `${head}\n${w.noSales}`;
  return [head, ...summary.items.slice(0, max).map((r, i) => `${i + 1}. ${r.name} ×${qty(r.qtyMilli)} · ${rm(r.sen)}`)].join('\n');
}

export function staffText(summary, { lang = 'zh', period = 'today', start, end } = {}) {
  const w = a(lang);
  const head = w.staffHead(w.period[period], rangeLabel(start, end));
  if (!summary.cashiers.length) return `${head}\n${w.noSales}`;
  return [head, ...summary.cashiers.map((c, i) => `${i + 1}. ${c.name}: ${rm(c.sen)} · ${c.receipts} ${w.receipts}`)].join('\n');
}

/** [places] is [{ place, sen }]; [missing] items without a cost. */
export function valueText(places, missing = 0, lang = 'zh') {
  const w = a(lang);
  const total = places.reduce((n, p) => n + p.sen, 0);
  return [w.valueHead, ...places.map((p) => `• ${p.place}: ${rm(p.sen)}`), `${w.valueTotal}: ${rm(total)}`,
    missing ? w.valueNoCost(missing) : ''].filter(Boolean).join('\n');
}

/** [pos] is purchase orders not yet received. */
export function poText(pos, lang = 'zh', max = 15) {
  const w = a(lang);
  if (!pos.length) return w.poNone;
  const day = (ms) => { const d = new Date(ms + 8 * 3600_000); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };
  return [w.poHead(pos.length), ...pos.slice(0, max).map((p) => `• ${p.poNo || p.id} · ${p.supplierName || ''} · ${w.status[p.status] || p.status}`
    + `${p.expectedAt ? ` · ${w.poExpected} ${day(p.expectedAt)}` : ''}`)].join('\n');
}

export function priceText(products, lang = 'zh') {
  const w = a(lang);
  return [w.priceHead, ...products.map((p) => `• ${p.name}: ${rm(p.priceSen || 0)}${p.unit && p.unit !== 'pcs' ? ` / ${p.unit}` : ''}`)].join('\n');
}

export const dontKnow = (q, lang = 'zh') => a(lang).dontKnow(q);
export const noRight = (lang = 'zh') => a(lang).noRight;

// ------------------------------------------------- talking, and the rest

/** A handful of the 300 questions, in the language asked. */
export function examplesText(lang = 'zh') {
  const ex = {
    zh: ['Milo 还有多少？', 'Milo 多少钱？', '今天卖了多少？', '上个月生意', 'Milo 这个月卖了多少', '这个月赚多少？', '今天比昨天怎样',
      '什么最好卖？', '什么卖不动？', '有什么没货了？', '什么要补货', '库存价值多少？', '谁卖最多？', '几点最忙？', '今天有作废的单吗',
      '这个月收了多少税', '今天进了什么货', '这个月报损', '有什么采购单要收货？', '现在谁在收银？', '有多少会员？', '有几间分店',
      '我是谁', '关掉每日报告', '用英文'],
    en: ['How many Milo?', 'Milo price', 'Sales today', 'Sales last month', 'Milo sales this month', 'Profit this month',
      'Compare with yesterday', 'Best sellers', 'Slow moving items', 'What is sold out', 'What should I reorder', 'Stock value',
      'Who sold the most this week', 'Busiest hour', 'Voids today', 'Tax this month', 'Goods received today', 'Write offs this month',
      'Purchase orders', 'Who is working now', 'How many customers', 'Branches', 'Who am I', 'Stop daily report', 'Speak Chinese'],
    ms: ['Berapa stok Milo', 'Harga Milo', 'Jualan hari ini', 'Jualan bulan lepas', 'Jualan Milo bulan ini', 'Untung bulan ini',
      'Banding dengan semalam', 'Paling laris', 'Barang tak laku', 'Stok habis apa', 'Stok rendah', 'Nilai stok', 'Siapa jual paling banyak',
      'Waktu sibuk', 'Resit batal hari ini', 'Cukai bulan ini', 'Barang masuk hari ini', 'Barang rosak bulan ini', 'Pesanan belian',
      'Siapa bertugas sekarang', 'Berapa pelanggan', 'Cawangan', 'Akaun saya', 'Hentikan laporan harian', 'English please'],
  };
  return [a(lang).examplesHead, ...(ex[lang] || ex.zh).map((q) => `• ${q}`)].join('\n');
}

export const greetText = (name, lang = 'zh') => a(lang).greet(name);
export const thanksText = (lang = 'zh') => a(lang).thanks;
export const langText = (lang = 'zh') => a(lang).langSet;
export const dailyText = (on, lang = 'zh') => (on ? a(lang).dailyOn : a(lang).dailyOff);

/** [u] is { name, company, isAdmin, role, places: [names] }. */
export function whoamiText(u, lang = 'zh') {
  const w = a(lang);
  return w.whoami({ name: u.name, company: u.company, role: u.isAdmin ? w.admin : u.role, places: u.places.length ? u.places.join('、') : w.everywhere });
}

export const branchesText = (names, lang = 'zh') => [a(lang).branchesHead(names.length), ...names.map((n) => `• ${n}`)].join('\n');

const clock = (ms) => { const d = new Date(ms + 8 * 3600_000); return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

/** [shifts] are the open ones: { operatorName, branchName, openedAt, initialFloatSen }. */
export function shiftText(shifts, lang = 'zh') {
  const w = a(lang);
  if (!shifts.length) return w.shiftNone;
  return [w.shiftHead(shifts.length), ...shifts.map((s) => `• ${s.operatorName || '?'}${s.branchName ? ` · ${s.branchName}` : ''} · ${w.since} ${clock(s.openedAt)}`
    + `${s.initialFloatSen ? ` · ${w.float} ${rm(s.initialFloatSen)}` : ''}`)].join('\n');
}

const pct = (now, before) => (before ? `${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 1000) / 10}%` : '');

/** This period against the one before: [now] and [before] are summaries with their ranges. */
export function compareText(now, before, { lang = 'zh', period = 'today', showProfit = true } = {}) {
  const w = a(lang);
  const line = (label, s) => (lang === 'zh' ? `${label}（${rangeLabel(s.start, s.end)}）` : `${label} (${rangeLabel(s.start, s.end)})`)
    + `: ${rm(s.totalSen)} · ${s.receipts} ${w.receipts}`;
  const diff = now.totalSen - before.totalSen;
  const arrow = diff > 0 ? '⬆️' : diff < 0 ? '⬇️' : '➡️';
  return [w.compareHead(w.period[period]),
    line(w.now, now),
    line(w.before, before),
    `${arrow} ${w.change}: ${diff >= 0 ? '+' : '-'}${rm(Math.abs(diff))} ${pct(now.totalSen, before.totalSen)}`.trimEnd(),
    showProfit ? `${w.profitLine}: ${rm(now.profitSen)} / ${rm(before.profitSen)}` : '',
  ].filter(Boolean).join('\n');
}

/** The busiest hours, from the sales' times (Malaysia). */
export function busyText(sales, { lang = 'zh', period = 'today', start, end, max = 3 } = {}) {
  const w = a(lang);
  const head = w.busyHead(w.period[period], rangeLabel(start, end));
  const hours = new Map();
  for (const s of sales) {
    if (s.status === 'VOIDED' || !s.createdAt) continue;
    const hr = new Date(s.createdAt + 8 * 3600_000).getUTCHours();
    const h = hours.get(hr) || { hr, n: 0, sen: 0 };
    h.n += 1;
    h.sen += s.totalSen || 0;
    hours.set(hr, h);
  }
  if (!hours.size) return `${head}\n${w.noSales}`;
  const hh = (n) => `${String(n).padStart(2, '0')}:00`;
  return [head, ...[...hours.values()].sort((x, y) => y.n - x.n || y.sen - x.sen).slice(0, max)
    .map((h, i) => `${i + 1}. ${hh(h.hr)}–${hh((h.hr + 1) % 24)} · ${h.n} ${w.receipts} · ${rm(h.sen)}`)].join('\n');
}

/** [items] are { name, onHand, place } in stock but not sold in 30 days. */
export function slowText(items, lang = 'zh', max = 20) {
  const w = a(lang);
  if (!items.length) return w.slowNone;
  const lines = items.slice(0, max).map((i) => `• ${i.name}${i.place ? ` (${i.place})` : ''}: ${w.left} ${qty(i.onHand)}`);
  if (items.length > max) lines.push(words(lang).more(items.length - max));
  return [w.slowHead(items.length), ...lines].join('\n');
}

/** Movements added up by product: [moves] are { productName, barcode, quantityMilli }. */
function byProduct(moves, nameOf) {
  const m = new Map();
  for (const x of moves) {
    const key = x.barcode || x.productName;
    const row = m.get(key) || { name: nameOf(x.barcode) || x.productName || x.barcode || '?', q: 0, notes: new Set() };
    row.q += x.quantityMilli || 0;
    if (x.note) row.notes.add(x.note);
    m.set(key, row);
  }
  return [...m.values()].sort((x, y) => y.q - x.q);
}

export function movesText(kind, moves, { lang = 'zh', period = 'today', start, end, max = 20, nameOf = () => '' } = {}) {
  const w = a(lang);
  const head = (kind === 'writeoff' ? w.writeoffHead : w.receiveHead)(w.period[period], rangeLabel(start, end));
  const rows = byProduct(moves, nameOf);
  if (!rows.length) return `${head}\n${kind === 'writeoff' ? w.writeoffNone : w.receiveNone}`;
  const lines = rows.slice(0, max).map((r) => `• ${r.name} ×${qty(r.q)}${kind === 'writeoff' && r.notes.size ? ` (${[...r.notes].slice(0, 2).join(', ')})` : ''}`);
  if (rows.length > max) lines.push(words(lang).more(rows.length - max));
  return [head, ...lines].join('\n');
}

/** [voided] are the voided sales. */
export function voidsText(voided, { lang = 'zh', period = 'today', start, end, max = 10 } = {}) {
  const w = a(lang);
  const head = w.voidsHead(w.period[period], rangeLabel(start, end));
  if (!voided.length) return `${head}\n${w.voidsNone}`;
  const total = voided.reduce((n, s) => n + (s.totalSen || 0), 0);
  return [head, w.voidsTotal(voided.length, rm(total)), ...voided.slice(0, max).map((s) => `• ${[s.receiptNo, rm(s.totalSen || 0)].filter(Boolean).join(' ')}`
    + `${s.voidedByName ? ` · ${s.voidedByName}` : ''}${s.voidReason ? ` · ${s.voidReason}` : ''}`)].join('\n');
}

export function taxText(sales, { lang = 'zh', period = 'today', start, end } = {}) {
  const w = a(lang);
  const head = w.taxHead(w.period[period], rangeLabel(start, end));
  const taxed = sales.filter((s) => s.status !== 'VOIDED' && s.taxSen);
  if (!taxed.length) return `${head}\n${w.taxNone}`;
  return `${head}\n${w.taxLine(rm(taxed.reduce((n, s) => n + s.taxSen, 0)), taxed.length)}`;
}

/** [customers] are the customer records; [from] starts the period for "new". */
export function customersText(customers, { lang = 'zh', period = 'today', from = 0, max = 5 } = {}) {
  const w = a(lang);
  if (!customers.length) return w.custNone;
  const fresh = customers.filter((c) => (c.createdAt || 0) >= from).length;
  const best = [...customers].sort((x, y) => (y.totalSpentSen || 0) - (x.totalSpentSen || 0)).filter((c) => c.totalSpentSen).slice(0, max);
  return [w.custHead, w.custCount(customers.length), w.custNew(w.period[period], fresh),
    ...(best.length ? [w.custTop, ...best.map((c, i) => `${i + 1}. ${c.name || c.phone || '?'} · ${rm(c.totalSpentSen)} · ${c.visits || 0}×`)] : []),
  ].join('\n');
}

/** One product's sales in a period: [row] is { qtyMilli, sen } (or none). */
export function itemSalesText(product, row, { lang = 'zh', period = 'today', start, end } = {}) {
  const w = a(lang);
  return w.itemSold(product.name || product.barcode, w.period[period], rangeLabel(start, end),
    `${qty(row?.qtyMilli || 0)} ${product.unit || ''}`.trimEnd(), rm(row?.sen || 0));
}

export const mailText = (kind, arg, lang = 'zh') => {
  const w = a(lang);
  return kind === 'sent' ? w.mailSent(arg) : kind === 'fail' ? w.mailFail(arg) : kind === 'admin' ? w.mailAdmin : w.mailOff;
};
