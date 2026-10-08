/**
 * What the SuXin bot understands and what it says: questions typed into
 * Telegram ("Milo 还有多少？", "今天卖了多少", "low stock"), and the daily
 * report sent by Telegram, email and phone notification. Pure -- no
 * database, no network -- so it is tested in bot.test.mjs; notify.mjs does
 * the reading and the sending.
 *
 * Money is in sen, quantities in thousandths, as everywhere else.
 */

// ------------------------------------------------------------- questions

const WORDS = {
  help: /^\/?(help|start|帮助|说明|你会什么|你可以做什么|bantuan|tolong|apa boleh)$/i,
  report: /(^\/report\b|报告|报表|总结|report|summary|laporan|ringkasan)/i,
  out: /(没有货|没货|卖完|卖光|缺货|断货|零库存|没库存|out of stock|sold out|stok habis|habis stok|kehabisan|tiada stok)/i,
  low: /(^\/low\b|低库存|快没|快卖完|补货|要订|要买货|不够|low stock|\blow\b|restock|reorder|stok rendah|hampir habis|perlu pesan)/i,
  profit: /(赚|利润|毛利|profit|margin|earn|untung)/i,
  top: /(最好卖|卖最多|卖得最好|卖得好|热卖|畅销|最多人买|top|best ?sell|popular|most sold|paling laris|laris)/i,
  staff: /(谁卖|员工|收银员|哪个人|哪位|cashier|staff|employee|who sold|pekerja|juruwang|siapa jual)/i,
  value: /(库存价值|库存值|货值|货值多少|存货价值|stock value|inventory value|worth|nilai stok|nilai inventori)/i,
  po: /(采购单|采购|待收货|要收货|进货单|供应商订单|purchase order|\bpo\b|supplier|pesanan belian|pembekal)/i,
  sales: /(^\/sales\b|卖了|卖多少|销售|营业|营业额|生意|收了多少|收入|几单|现金|刷卡|收款|sales|sold|revenue|takings|receipts|jualan|terjual|kutipan|tunai)/i,
  price: /(多少钱|价钱|价格|售价|卖几钱|几钱|price|how much is|harga)/i,
  stock: /(^\/stock\b|还有多少|还剩|剩多少|有多少|剩下|库存|多少|stock|how many|left|\bstok\b|berapa|baki)/i,
};

const PERIODS = [
  ['yesterday', /(昨天|昨日|yesterday|semalam)/i],
  ['week', /(这个星期|这星期|这礼拜|本周|这周|一个星期|一星期|七天|7 ?天|this week|last 7 days|\bweek\b|minggu)/i],
  ['month', /(这个月|本月|一个月|this month|\bmonth\b|bulan)/i],
];

/** today, yesterday, week (the last 7 days) or month (since the 1st). */
export function periodOf(text) {
  return (PERIODS.find(([, re]) => re.test(text)) || ['today'])[0];
}

/** Strips the question words, leaving what is asked about ("Milo 1kg"). */
function subject(text) {
  return text
    .replace(/^\/(stock|price)(@\w+)?/i, '')
    .replace(/还有多少|还剩多少|还剩|剩多少|剩下|有多少|库存|多少钱|价钱|价格|售价|卖几钱|几钱|多少|还有|呢|吗|的|[？?！!。,，]/g, ' ')
    .replace(/\b(how many|how much is|how much|price of|price|stock|left|do we have|have|is|are|of|the|stok|berapa|baki|lagi|ada|harga)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What a message asks: { kind, period?, query?, guess? }. kind is link,
 * help, report, out, low, profit, top, staff, value, po, sales, price or
 * stock; period is today, yesterday, week or month. Anything else is taken
 * as a product to look up (guess: true), so a plain "Milo" works too.
 */
export function parseMessage(raw) {
  const text = String(raw || '').trim();
  const start = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{4,64})$/.exec(text);
  if (start) return { kind: 'link', code: start[1] };
  if (!text || WORDS.help.test(text)) return { kind: 'help' };
  const period = periodOf(text);
  for (const kind of ['report', 'out', 'low', 'profit', 'staff', 'top', 'value', 'po', 'sales']) {
    if (WORDS[kind].test(text)) return { kind, period, day: period };
  }
  if (WORDS.price.test(text)) return { kind: 'price', query: subject(text) };
  if (WORDS.stock.test(text)) {
    const query = subject(text);
    return query ? { kind: 'stock', query } : { kind: 'help' };
  }
  const query = text.replace(/[？?！!。]/g, '').trim();
  return query ? { kind: 'stock', query, guess: true } : { kind: 'help' };
}

/** Products matching [query]: the barcode exactly, else every word in the name. At most [max]. */
export function findProducts(products, query, max = 5) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const exact = products.filter((p) => String(p.barcode || '').toLowerCase() === q || String(p.sku || '').toLowerCase() === q);
  if (exact.length) return exact.slice(0, max);
  const words = q.split(/\s+/).filter(Boolean);
  const hits = products.filter((p) => {
    const name = String(p.name || '').toLowerCase();
    return words.every((w) => name.includes(w));
  });
  // Shortest name first: "Milo" finds "Milo 1kg" before "Milo 3 in 1 Kotak 18 x 33g".
  return hits.sort((a, b) => String(a.name).length - String(b.name).length).slice(0, max);
}

// --------------------------------------------------------------- numbers

export function rm(sen) {
  const n = Math.round(Number(sen) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}RM ${whole}.${String(abs % 100).padStart(2, '0')}`;
}

export function qty(milli) {
  const n = (Number(milli) || 0) / 1000;
  return String(Math.round(n * 1000) / 1000);
}

/** [start, end) of the day [daysAgo] before [now], in Malaysia time (UTC+8). */
export function dayRange(now, daysAgo = 0, offsetMinutes = 480) {
  const shifted = new Date(now + offsetMinutes * 60_000);
  const startShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - daysAgo);
  const start = startShifted - offsetMinutes * 60_000;
  return [start, start + 86_400_000];
}

/** "8/10/2026", or "2/10/2026 – 8/10/2026" for more than one day. */
export const rangeLabel = (start, end = 0) => (end && end - start > 86_400_000
  ? `${dateLabel(start)} – ${dateLabel(end - 1)}` : dateLabel(start));

export const dateLabel = (start, offsetMinutes = 480) => {
  const d = new Date(start + offsetMinutes * 60_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
};

// ------------------------------------------------------------- summaries

/** One day's sales: total, receipts, average, voids, by payment type and the best sellers. */
export function summarize(sales) {
  const done = sales.filter((s) => s.status !== 'VOIDED');
  const byMethod = {};
  const items = new Map();
  const cashiers = new Map();
  let total = 0;
  let cost = 0;
  for (const s of done) {
    total += s.totalSen || 0;
    for (const p of s.payments || []) byMethod[p.method] = (byMethod[p.method] || 0) + (p.amountSen || 0);
    // What was handed back came out of the cash.
    if (s.changeSen) byMethod.CASH = (byMethod.CASH || 0) - s.changeSen;
    const who = s.cashierName || s.cashierUid || '?';
    const c = cashiers.get(who) || { name: who, sen: 0, receipts: 0 };
    c.sen += s.totalSen || 0;
    c.receipts += 1;
    cashiers.set(who, c);
    for (const l of s.lines || []) {
      const key = l.barcode || l.name;
      const row = items.get(key) || { name: l.name || key, qtyMilli: 0, sen: 0 };
      row.qtyMilli += l.qtyMilli || 0;
      row.sen += l.lineTotalSen || 0;
      items.set(key, row);
      cost += Math.round(((l.costSen || 0) * (l.qtyMilli || 0)) / 1000);
    }
  }
  const sold = [...items.values()].sort((a, b) => b.qtyMilli - a.qtyMilli || b.sen - a.sen);
  // Profit before tax: what the lines came to, less what they cost.
  const lineSen = sold.reduce((n, r) => n + r.sen, 0);
  return {
    totalSen: total,
    receipts: done.length,
    averageSen: done.length ? Math.round(total / done.length) : 0,
    voided: sales.length - done.length,
    byMethod,
    top: sold.slice(0, 5),
    items: sold,
    lineSen,
    costSen: cost,
    profitSen: lineSen - cost,
    cashiers: [...cashiers.values()].sort((a, b) => b.sen - a.sen),
  };
}

/** [start, end) of today, yesterday, the last 7 days, or this month (Malaysia time). */
export function periodRange(period, now = Date.now(), offsetMinutes = 480) {
  if (period === 'yesterday') return dayRange(now, 1, offsetMinutes);
  if (period === 'week') return [dayRange(now, 6, offsetMinutes)[0], dayRange(now, 0, offsetMinutes)[1]];
  if (period === 'month') {
    const d = new Date(now + offsetMinutes * 60_000);
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - offsetMinutes * 60_000;
    return [start, dayRange(now, 0, offsetMinutes)[1]];
  }
  return dayRange(now, 0, offsetMinutes);
}

// ----------------------------------------------------------------- words

const T = {
  zh: {
    help: '我是 SuXin 助手。你可以这样问我：\n• Milo 还有多少？ / Milo 多少钱？\n• 今天卖了多少？ 昨天？ 这个星期？ 这个月？\n• 这个月赚多少？\n• 什么最好卖？\n• 有什么没货了？ / 低库存\n• 谁卖最多？\n• 库存价值多少？\n• 有什么采购单要收货？\n• 报告\n每天早上 8 点我会发营业报告给你。',
    notLinked: '这个 Telegram 还没有连接到 SuXin。请在 SuXin 收银后台 → 设置 → 通知，按「连接 Telegram」。',
    linked: (name, company) => `✅ 已连接：${name} · ${company}\n每天早上 8 点会收到营业报告。发「帮助」看可以问什么。`,
    badCode: '这个连接码不对或已过期（15 分钟内有效）。请在 设置 → 通知 再按一次「连接 Telegram」。',
    noSalesRight: '你的账号不能看销售。请老板在「员工 → 角色」给你看报表的权限。',
    noMatch: (q) => `找不到「${q}」。试试商品名字的一部分，或扫条码后发条码数字。`,
    stockLine: (name) => `📦 ${name}`,
    nowhere: '还没有盘点或进货记录。',
    sales: (day) => ({ yesterday: '昨天', week: '最近 7 天', month: '这个月' }[day] || '今天'),
    salesHead: (label, date) => `💰 ${label}（${date}）`,
    total: '营业额', receipts: '单', average: '平均每单', voided: '作废', top: '最好卖',
    noSales: '没有销售。',
    lowHead: (n) => `⚠️ 低库存 ${n} 样`,
    lowNone: '✅ 没有低库存的商品。',
    left: '剩', reorderAt: '补货点',
    reportHead: (company, date) => `📊 SuXin 每日报告 · ${company}\n${date}`,
    methods: { CASH: '现金', QR: 'DuitNow QR', CARD: '刷卡', EWALLET: '电子钱包' },
    more: (n) => `…还有 ${n} 样`,
  },
  en: {
    help: 'I am the SuXin assistant. Ask me:\n• How many Milo? / Milo price?\n• Sales today, yesterday, this week, this month\n• Profit this month\n• Best sellers\n• What is out of stock? / Low stock\n• Who sold most?\n• Stock value\n• Purchase orders to receive\n• Report\nI send the day\'s report every morning at 8.',
    notLinked: 'This Telegram is not connected to SuXin yet. In the SuXin back office go to Settings → Notifications and press Connect Telegram.',
    linked: (name, company) => `✅ Connected: ${name} · ${company}\nYou will get the report every morning at 8. Send "help" to see what to ask.`,
    badCode: 'That link code is wrong or has expired (15 minutes). Press Connect Telegram again under Settings → Notifications.',
    noSalesRight: 'Your account may not see sales. Ask the owner to give your role the reports permission.',
    noMatch: (q) => `Nothing called "${q}". Try part of the name, or send the barcode number.`,
    stockLine: (name) => `📦 ${name}`,
    nowhere: 'No counts or deliveries recorded yet.',
    sales: (day) => ({ yesterday: 'Yesterday', week: 'The last 7 days', month: 'This month' }[day] || 'Today'),
    salesHead: (label, date) => `💰 ${label} (${date})`,
    total: 'Sales', receipts: 'receipts', average: 'average', voided: 'Voided', top: 'Best sellers',
    noSales: 'No sales.',
    lowHead: (n) => `⚠️ ${n} items low`,
    lowNone: '✅ Nothing is low.',
    left: 'left', reorderAt: 'reorder at',
    reportHead: (company, date) => `📊 SuXin daily report · ${company}\n${date}`,
    methods: { CASH: 'Cash', QR: 'DuitNow QR', CARD: 'Card', EWALLET: 'E-wallet' },
    more: (n) => `…and ${n} more`,
  },
  ms: {
    help: 'Saya pembantu SuXin. Tanya saya:\n• Berapa stok Milo? / Harga Milo?\n• Jualan hari ini, semalam, minggu ini, bulan ini\n• Untung bulan ini\n• Paling laris\n• Apa stok habis? / Stok rendah\n• Siapa jual paling banyak?\n• Nilai stok\n• Pesanan belian untuk diterima\n• Laporan\nSaya hantar laporan setiap pagi jam 8.',
    notLinked: 'Telegram ini belum disambung ke SuXin. Di pejabat SuXin, pergi ke Tetapan → Pemberitahuan dan tekan Sambung Telegram.',
    linked: (name, company) => `✅ Disambung: ${name} · ${company}\nAnda akan terima laporan setiap pagi jam 8. Hantar "bantuan" untuk lihat apa boleh ditanya.`,
    badCode: 'Kod sambungan salah atau tamat tempoh (15 minit). Tekan Sambung Telegram semula di Tetapan → Pemberitahuan.',
    noSalesRight: 'Akaun anda tidak boleh lihat jualan. Minta pemilik beri kebenaran laporan.',
    noMatch: (q) => `Tiada barang "${q}". Cuba sebahagian nama, atau hantar nombor kod bar.`,
    stockLine: (name) => `📦 ${name}`,
    nowhere: 'Belum ada kiraan atau penghantaran.',
    sales: (day) => ({ yesterday: 'Semalam', week: '7 hari lepas', month: 'Bulan ini' }[day] || 'Hari ini'),
    salesHead: (label, date) => `💰 ${label} (${date})`,
    total: 'Jualan', receipts: 'resit', average: 'purata', voided: 'Batal', top: 'Paling laris',
    noSales: 'Tiada jualan.',
    lowHead: (n) => `⚠️ ${n} barang stok rendah`,
    lowNone: '✅ Tiada stok rendah.',
    left: 'tinggal', reorderAt: 'paras pesan',
    reportHead: (company, date) => `📊 Laporan harian SuXin · ${company}\n${date}`,
    methods: { CASH: 'Tunai', QR: 'DuitNow QR', CARD: 'Kad', EWALLET: 'E-dompet' },
    more: (n) => `…dan ${n} lagi`,
  },
};

/** The language to answer in, from Telegram's or the account's language code. */
export const langOf = (code) => {
  const c = String(code || '').toLowerCase();
  if (c.startsWith('zh')) return 'zh';
  if (c.startsWith('ms') || c.startsWith('id')) return 'ms';
  if (c.startsWith('en')) return 'en';
  return 'zh';
};
export const words = (lang) => T[lang] || T.zh;

export function salesText(summary, { lang = 'zh', day = 'today', start = Date.now(), end = 0 } = {}) {
  const w = words(lang);
  const head = w.salesHead(w.sales(day), rangeLabel(start, end));
  if (!summary.receipts) return `${head}\n${w.noSales}${summary.voided ? `\n${w.voided}: ${summary.voided}` : ''}`;
  const methods = Object.entries(summary.byMethod).filter(([, v]) => v)
    .map(([m, v]) => `${w.methods[m] || m} ${rm(v)}`).join(' · ');
  const top = summary.top.map((r, i) => `${i + 1}. ${r.name} ×${qty(r.qtyMilli)}`).join('\n');
  return [
    head,
    lang === 'zh'
      ? `${w.total}：${rm(summary.totalSen)}（${summary.receipts} ${w.receipts}，${w.average} ${rm(summary.averageSen)}）`
      : `${w.total}: ${rm(summary.totalSen)} (${summary.receipts} ${w.receipts}, ${w.average} ${rm(summary.averageSen)})`,
    methods,
    summary.voided ? `${w.voided}: ${summary.voided}` : '',
    top ? `${w.top}:\n${top}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Stock of [products] at each place: [levelsByBranch] is { branchId: level[] }
 * (ledger.js), [placeName] names a branch id.
 */
export function stockText(products, levelsByBranch, placeName, lang = 'zh') {
  const w = words(lang);
  return products.map((p) => {
    const rows = Object.entries(levelsByBranch).map(([b, list]) => {
      const l = list.find((x) => (x.barcode || x.key) === p.barcode);
      return l ? `  ${placeName(b)}: ${qty(l.onHand)} ${p.unit || l.unit || ''}`.trimEnd() : null;
    }).filter(Boolean);
    return [w.stockLine(p.name || p.barcode), ...(rows.length ? rows : [`  ${w.nowhere}`])].join('\n');
  }).join('\n\n');
}

/** Low stock across every place: [lows] is [{ name, onHand, reorderLevel, place }]. */
export function lowText(lows, lang = 'zh', max = 15) {
  const w = words(lang);
  if (!lows.length) return w.lowNone;
  const lines = lows.slice(0, max).map((l) => `• ${l.name}${l.place ? ` (${l.place})` : ''}: ${w.left} ${qty(l.onHand)}, ${w.reorderAt} ${qty(l.reorderLevel)}`);
  if (lows.length > max) lines.push(w.more(lows.length - max));
  return [w.lowHead(lows.length), ...lines].join('\n');
}

/** The morning report: yesterday's sales and what is low now. */
export function reportText({ company, summary, lows, start, lang = 'zh', showSales = true }) {
  const w = words(lang);
  return [
    w.reportHead(company || '', dateLabel(start)),
    showSales ? salesText(summary, { lang, day: 'yesterday', start }).split('\n').slice(1).join('\n') : '',
    lowText(lows, lang, 10),
  ].filter(Boolean).join('\n\n');
}

/** The notification's short form: one line each. */
export function reportPush({ summary, lows, lang = 'zh', showSales = true }) {
  const w = words(lang);
  const title = lang === 'zh' ? 'SuXin 每日报告' : lang === 'ms' ? 'Laporan harian SuXin' : 'SuXin daily report';
  const sales = showSales ? `${w.total} ${rm(summary.totalSen)} · ${summary.receipts} ${w.receipts}` : '';
  const low = lows.length ? w.lowHead(lows.length) : w.lowNone;
  return { title, body: [sales, low].filter(Boolean).join('\n') };
}
