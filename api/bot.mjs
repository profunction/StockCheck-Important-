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
  help: /^\/?(help|start|帮助|说明|bantuan|tolong)$/i,
  report: /(^\/report\b|报告|报表|report|laporan)/i,
  low: /(^\/low\b|低库存|缺货|补货|没货|low stock|\blow\b|stok rendah|hampir habis|habis)/i,
  sales: /(^\/sales\b|卖了|销售|营业额|生意|sales|sold|jualan|terjual)/i,
  yesterday: /(昨天|昨日|yesterday|semalam)/i,
  stock: /(^\/stock\b|还有多少|还剩|剩多少|有多少|库存|多少|stock|how many|\bstok\b|berapa|baki)/i,
};

/** Strips the question words, leaving what is asked about ("Milo 1kg"). */
function subject(text) {
  return text
    .replace(/^\/stock(@\w+)?/i, '')
    .replace(/还有多少|还剩多少|还剩|剩多少|有多少|库存|多少|还有|呢|吗|[？?！!。,，]/g, ' ')
    .replace(/\b(how many|stock|left|do we have|have|is|are|of|the|stok|berapa|baki|lagi|ada)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What a message asks: { kind: 'link', code } | 'help' | 'report' | 'low'
 * | { kind: 'sales', day: 'today' | 'yesterday' } | { kind: 'stock', query }.
 * Anything else is taken as a product to look up.
 */
export function parseMessage(raw) {
  const text = String(raw || '').trim();
  const start = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{4,64})$/.exec(text);
  if (start) return { kind: 'link', code: start[1] };
  if (!text || WORDS.help.test(text)) return { kind: 'help' };
  if (WORDS.report.test(text)) return { kind: 'report', day: WORDS.yesterday.test(text) ? 'yesterday' : 'today' };
  if (WORDS.low.test(text)) return { kind: 'low' };
  if (WORDS.sales.test(text)) return { kind: 'sales', day: WORDS.yesterday.test(text) ? 'yesterday' : 'today' };
  const query = WORDS.stock.test(text) ? subject(text) : text.replace(/[？?！!。]/g, '').trim();
  return query ? { kind: 'stock', query } : { kind: 'help' };
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

const dateLabel = (start, offsetMinutes = 480) => {
  const d = new Date(start + offsetMinutes * 60_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
};

// ------------------------------------------------------------- summaries

/** One day's sales: total, receipts, average, voids, by payment type and the best sellers. */
export function summarize(sales) {
  const done = sales.filter((s) => s.status !== 'VOIDED');
  const byMethod = {};
  const items = new Map();
  let total = 0;
  for (const s of done) {
    total += s.totalSen || 0;
    for (const p of s.payments || []) byMethod[p.method] = (byMethod[p.method] || 0) + (p.amountSen || 0);
    // What was handed back came out of the cash.
    if (s.changeSen) byMethod.CASH = (byMethod.CASH || 0) - s.changeSen;
    for (const l of s.lines || []) {
      const key = l.barcode || l.name;
      const row = items.get(key) || { name: l.name || key, qtyMilli: 0, sen: 0 };
      row.qtyMilli += l.qtyMilli || 0;
      row.sen += l.lineTotalSen || 0;
      items.set(key, row);
    }
  }
  return {
    totalSen: total,
    receipts: done.length,
    averageSen: done.length ? Math.round(total / done.length) : 0,
    voided: sales.length - done.length,
    byMethod,
    top: [...items.values()].sort((a, b) => b.qtyMilli - a.qtyMilli || b.sen - a.sen).slice(0, 5),
  };
}

// ----------------------------------------------------------------- words

const T = {
  zh: {
    help: '我是 SuXin 助手。可以问我：\n• Milo 还有多少？\n• 今天卖了多少？ / 昨天卖了多少？\n• 低库存\n• 报告\n每天早上 8 点我会发营业报告给你。',
    notLinked: '这个 Telegram 还没有连接到 SuXin。请在 SuXin 收银后台 → 设置 → 通知，按「连接 Telegram」。',
    linked: (name, company) => `✅ 已连接：${name} · ${company}\n每天早上 8 点会收到营业报告。发「帮助」看可以问什么。`,
    badCode: '这个连接码不对或已过期（15 分钟内有效）。请在 设置 → 通知 再按一次「连接 Telegram」。',
    noSalesRight: '你的账号不能看销售。请老板在「员工 → 角色」给你看报表的权限。',
    noMatch: (q) => `找不到「${q}」。试试商品名字的一部分，或扫条码后发条码数字。`,
    stockLine: (name) => `📦 ${name}`,
    nowhere: '还没有盘点或进货记录。',
    sales: (day) => (day === 'yesterday' ? '昨天' : '今天'),
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
    help: 'I am the SuXin assistant. Ask me:\n• How many Milo?\n• Sales today / sales yesterday\n• Low stock\n• Report\nI send the day\'s report every morning at 8.',
    notLinked: 'This Telegram is not connected to SuXin yet. In the SuXin back office go to Settings → Notifications and press Connect Telegram.',
    linked: (name, company) => `✅ Connected: ${name} · ${company}\nYou will get the report every morning at 8. Send "help" to see what to ask.`,
    badCode: 'That link code is wrong or has expired (15 minutes). Press Connect Telegram again under Settings → Notifications.',
    noSalesRight: 'Your account may not see sales. Ask the owner to give your role the reports permission.',
    noMatch: (q) => `Nothing called "${q}". Try part of the name, or send the barcode number.`,
    stockLine: (name) => `📦 ${name}`,
    nowhere: 'No counts or deliveries recorded yet.',
    sales: (day) => (day === 'yesterday' ? 'Yesterday' : 'Today'),
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
    help: 'Saya pembantu SuXin. Tanya saya:\n• Berapa stok Milo?\n• Jualan hari ini / jualan semalam\n• Stok rendah\n• Laporan\nSaya hantar laporan setiap pagi jam 8.',
    notLinked: 'Telegram ini belum disambung ke SuXin. Di pejabat SuXin, pergi ke Tetapan → Pemberitahuan dan tekan Sambung Telegram.',
    linked: (name, company) => `✅ Disambung: ${name} · ${company}\nAnda akan terima laporan setiap pagi jam 8. Hantar "bantuan" untuk lihat apa boleh ditanya.`,
    badCode: 'Kod sambungan salah atau tamat tempoh (15 minit). Tekan Sambung Telegram semula di Tetapan → Pemberitahuan.',
    noSalesRight: 'Akaun anda tidak boleh lihat jualan. Minta pemilik beri kebenaran laporan.',
    noMatch: (q) => `Tiada barang "${q}". Cuba sebahagian nama, atau hantar nombor kod bar.`,
    stockLine: (name) => `📦 ${name}`,
    nowhere: 'Belum ada kiraan atau penghantaran.',
    sales: (day) => (day === 'yesterday' ? 'Semalam' : 'Hari ini'),
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

export function salesText(summary, { lang = 'zh', day = 'today', start = Date.now() } = {}) {
  const w = words(lang);
  const head = w.salesHead(w.sales(day), dateLabel(start));
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
