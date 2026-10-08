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
  help: /^\/?(help|start|menu|帮助|说明|菜单|功能|你会什么|你会做什么|你可以做什么|你能做什么|能做什么|可以问什么|怎么用|怎样用|教我|bantuan|tolong|apa boleh|apa awak boleh buat|macam mana guna)\s*[?？!！]*$/i,
  examples: /^\/?(例子|举例|更多例子|更多问题|还可以问什么|还能问什么|其他问题|examples?|more examples|more questions|contoh|lagi contoh|contoh soalan)\s*[?？!！]*$/i,
  greet: /^(你好|您好|哈喽|哈啰|嗨|早|早安|早上好|午安|下午好|晚上好|晚安|在吗|在不在|hi|hello|hey|hai|helo|halo|yo|morning|good (morning|afternoon|evening|night)|selamat (pagi|tengah hari|petang|malam)|salam|assalamualaikum)(\s?(啊|呀|吖|哦|老板|boss|bos|bot|suxin|小助手|助手|there|semua))*\s*[!！~。.?？]*$/i,
  thanks: /^(谢谢|多谢|感谢|谢啦|谢了|thx|thanks|thank you|thank u|ty|tq|terima kasih|好的|好|ok|okay|okok|收到|明白|知道了|了解|noted|baik|baiklah|faham|👍|🙏)(\s?(你|啦|了|哦|喔|lah|ya|bos|boss|very much|so much|banyak))*\s*[!！~。.]*$/i,
  dailyOff: /^\/stop\b|(关掉|关闭|停止|取消|暂停|不要|别再?|不用|stop|turn off|unsubscribe( from)?|pause|matikan|hentikan|berhenti|jangan)\s*(再?发|send|hantar)?\s*((每日|每天|早上|the|daily|morning|harian)\s*)*(的)?\s*(报告|report|laporan)/i,
  dailyOn: /(打开|开启|恢复|重新发|继续发|turn on|resume|subscribe( to)?|hidupkan|sambung semula|teruskan)\s*((每日|每天|早上|the|daily|morning|harian)\s*)*(的)?\s*(报告|report|laporan)/i,
  lang: /^(\/lang\b.*|(请|麻烦)?(说|讲|用|换成?|改成?|转成?|切换到?)\s*(中文|华语|华文|英文|英语|马来文|马来语|国语)\s*(吧|啦|回答|回复|好了)?|(speak|reply in|answer in|use|switch to|change to|cakap|guna|tukar ke|jawab dalam)\s+(english|chinese|malay|bahasa( melayu)?|bm|cina|inggeris|melayu)(\s+please)?|english|english please|中文|bahasa melayu|bahasa)\s*[.!！?？]*$/i,
  whoami: /(我是谁|我的账号|我的帐号|我是哪个|我在哪间公司|我的权限|我的角色|连接了谁|who am i|my account|my role|siapa saya|akaun saya|peranan saya)/i,
  shift: /(开班|关班|交班|班次|谁在收银|谁在看店|谁在顾店|谁上班|谁在班|有人上班|有没有人在|收银机开了|shifts?\b|who is (working|on duty|at the till)|anyone working|syif|siapa (kerja|bertugas|jaga))/i,
  report: /(^\/report\b|报告|报表|总结|report|summary|laporan|ringkasan)/i,
  compare: /(比较|对比|比昨天|比前天|比上个?星期|比上周|比上个?月|多了还是少了|多还是少|差多少|跟昨天比|和昨天比|跟上个?月比|和上个?月比|跟上个?星期比|进步|退步|\bvs\b|compare|compared|than yesterday|than last|better or worse|up or down|banding|berbanding)/i,
  out: /(没有货|没货|卖完|卖光|缺货|断货|零库存|没库存|out of stock|sold out|stok habis|habis stok|kehabisan|tiada stok)/i,
  low: /(^\/low\b|低库存|快没|快卖完|补货|要订|要买货|要进货|不够|low stock|\blow\b|restock|reorder|running out|stok rendah|hampir habis|perlu pesan|stok sikit)/i,
  slow: /(卖不动|卖不出|滞销|没人买|不好卖|最难卖|最差|卖得最少|卖最少|冷门|放很久|放太久|slow.?mov|slow sell|not selling|dead stock|worst sell|least sold|tak laku|kurang laris|tidak laris|tak jual)/i,
  writeoff: /(报损|报废|损坏|坏掉|坏了的|过期丢|丢掉|丢失|write.?offs?|damaged|wastage|rosak|luput|hapus kira|hilang)/i,
  voids: /(作废|取消的单|取消单|退款|退货|退了|\bvoid(s|ed)?\b|refunds?|cancel+ed (sales|receipts|bills)|batal|pulangan|pemulangan|bayaran balik)/i,
  tax: /(税|\bsst\b|\btax(es)?\b|cukai)/i,
  profit: /(赚|利润|毛利|profit|margin|earn|untung)/i,
  busy: /(几点最忙|什么时候最忙|最忙|高峰|几点人最多|几点生意最好|几点最多人|什么时间最多人|哪个时间|busiest|\bbusy\b|peak|rush hour|what time.*most|waktu sibuk|paling sibuk|jam berapa (ramai|sibuk))/i,
  staff: /(谁卖|员工|收银员|哪个人|哪位|cashiers?|staff|employees?|who sold|pekerja|juruwang|siapa jual)/i,
  top: /(最好卖|卖最多|卖得最多|卖得最好|卖得好|热卖|畅销|爆款|最多人买|最受欢迎|\btop\b|best ?sell|popular|most sold|paling laris|laris)/i,
  customers: /(会员|顾客|客人|客户|customers?|members?|pelanggan|ahli)/i,
  value: /(库存价值|库存值|库存总值|货值|存货价值|货总值|货值多少|stock value|inventory value|worth|nilai stok|nilai inventori)/i,
  po: /(采购单|采购|待收货|要收货|进货单|订单还没到|供应商订单|purchase orders?|\bpo\b|\bpos\b(?! system)|supplier|pesanan belian|pembekal)/i,
  receive: /(进了什么|进了多少|进了货|进货|收货|收了什么货|收到什么货|到货|来货|入货|\breceived\b|deliver(ed|ies|y)|goods in|barang masuk|terima barang|stok masuk|stok sampai)/i,
  sales: /(^\/sales\b|卖了|卖多少|卖几|卖出|销售|营业|营收|业绩|生意|收了多少|收入|进账|入账|几单|多少单|单数|每单|平均|客单价|现金|刷卡|收款|二维码|电子钱包|average|sales|sold|sell|revenue|takings|turnover|receipts|business|jualan|terjual|jual|kutipan|tunai|pendapatan|hasil)/i,
  price: /(多少钱|价钱|价格|售价|卖几钱|几钱|几块|price|how much is|how much for|cost of|harga)/i,
  branches: /(分店|门市|店面|几间店|哪些店|几个地方|branch(es)?|outlets?|stores|locations|cawangan|kedai mana)/i,
  stock: /(^\/stock\b|还有多少|还有几|还剩|剩多少|剩几|有多少|有几|剩下|库存|存货|多少|有没有|有货吗|还有吗|stock|how many|left|do we have|any .+ left|\bstok\b|berapa|baki|ada lagi|masih ada)/i,
};

const PERIODS = [
  ['dayBefore', /(前天|day before yesterday|kelmarin)/i],
  ['yesterday', /(昨天|昨日|昨晚|yesterday|semalam)/i],
  ['lastWeek', /(上个?星期|上个?礼拜|上周|last week|previous week|minggu lepas|minggu lalu)/i],
  ['week', /(这个?星期|这个?礼拜|本周|这周|一个星期|一星期|七天|7 ?天|this week|last 7 days|\bweek\b|minggu)/i],
  ['lastMonth', /(上个?月|last month|previous month|bulan lepas|bulan lalu)/i],
  ['month', /(这个月|本月|一个月|这月|this month|\bmonth\b|bulan)/i],
];

/** today, yesterday, dayBefore, week (the last 7 days), lastWeek (the 7 before), month (since the 1st) or lastMonth. */
export function periodOf(text) {
  return (PERIODS.find(([, re]) => re.test(text)) || ['today'])[0];
}

/** The period a comparison is about: it is set against the one before. */
const comparePeriod = (text) => (/月|month|bulan/i.test(text) ? 'month' : /星期|礼拜|周|week|minggu/i.test(text) ? 'week' : 'today');

/** zh, en or ms, from "说中文" / "english please" / "bahasa melayu". */
export const langAsked = (text) => (/中文|华语|华文|chinese|cina|\/lang\s*zh/i.test(text) ? 'zh'
  : /英|english|inggeris|\/lang\s*en/i.test(text) ? 'en' : 'ms');

/** Strips the question words, leaving what is asked about ("Milo 1kg"). */
function subject(text) {
  return text
    .replace(/^\/(stock|price|sales)(@\w+)?/i, '')
    .replace(/几(?![钱块])(个|件|包|瓶|盒|罐|支|条|粒|箱|样|kg|公斤)?|还有没有|还有多少|还有几|还剩多少|还剩|剩多少|剩几|剩下|有多少|有几|有没有|有货吗|库存|存货|多少钱|价钱|价格|售价|卖几钱|几钱|几块|多少|还有|呢|吗|的|啊|[？?！!。,，]/g, ' ')
    .replace(/\b(how many|how much is|how much for|how much|price of|price|cost of|stock|left|do we have|any|have|is|are|of|the|for|got|or not|ah|lah|leh|boss|bos|ok|stok|berapa|baki|lagi|ada|masih|harga)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What is left of a sales question once the time and the selling words are gone: a product, if anything. */
function soldWhat(text) {
  return subject(text
    .replace(/(今天|今日|昨天|昨日|昨晚|前天|这个?星期|这个?礼拜|上个?星期|上个?礼拜|本周|这周|上周|一个?星期|七天|这个?月|本月|上个?月|一个月)/g, ' ')
    .replace(/(卖了|卖出|卖多少|卖几|卖|销售|销量|营业额|营业|营收|业绩|生意|收了|收款|收入|收|进账|入账|几单|多少单|单数|单|现金|刷卡|二维码|电子钱包|平均|每单|客单价|一共|总共|共|了|个|件|包|支|瓶|盒|罐|几|怎样|怎么样|如何|好吗)/g, ' ')
    .replace(/\b(today|yesterday|this|last|week|month|sales|sold|sell|did|we|how|many|much|units?|pcs|revenue|takings|turnover|receipts|business|cash|card|average|bill|ok|or|not|today's|hari ini|hari ni|semalam|minggu|bulan|ini|lepas|jualan|terjual|jual|berapa|unit|kutipan|tunai|kad|pendapatan|hasil)\b/gi, ' '));
}

const ORDER = ['dailyOff', 'dailyOn', 'whoami', 'shift', 'report', 'compare', 'out', 'low', 'slow', 'writeoff', 'voids', 'tax',
  'profit', 'busy', 'customers', 'staff', 'top', 'value', 'po', 'receive'];

/**
 * What a message asks: { kind, period?, query?, guess?, lang? }. Anything
 * not recognised is taken as a product to look up (guess: true), so a
 * plain "Milo" works too. A sales question naming something ("Milo 今天卖了几个")
 * carries it as query; notify.mjs answers for that product when it finds one.
 */
export function parseMessage(raw) {
  const text = String(raw || '').trim();
  const start = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{4,64})$/.exec(text);
  if (start) return { kind: 'link', code: start[1] };
  if (!text || WORDS.help.test(text)) return { kind: 'help' };
  for (const kind of ['examples', 'greet', 'thanks']) if (WORDS[kind].test(text)) return { kind };
  if (WORDS.lang.test(text)) return { kind: 'lang', lang: langAsked(text) };
  const period = periodOf(text);
  for (const kind of ORDER) {
    if (!WORDS[kind].test(text)) continue;
    if (kind === 'compare') return { kind, period: comparePeriod(text) };
    return { kind, period, day: period };
  }
  // "Milo 卖多少钱" is a price; "今天卖了多少钱" is sales.
  if (WORDS.price.test(text) && soldWhat(text)) return { kind: 'price', query: subject(text) };
  if (WORDS.sales.test(text)) {
    const query = soldWhat(text);
    return query ? { kind: 'sales', period, day: period, query } : { kind: 'sales', period, day: period };
  }
  if (WORDS.branches.test(text)) return { kind: 'branches' };
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
      const row = items.get(key) || { barcode: l.barcode || '', name: l.name || key, qtyMilli: 0, sen: 0 };
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

/** [start, end) of a period (see periodOf), in Malaysia time. */
export function periodRange(period, now = Date.now(), offsetMinutes = 480) {
  const day = (n) => dayRange(now, n, offsetMinutes);
  const monthStart = (back) => {
    const d = new Date(now + offsetMinutes * 60_000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1) - offsetMinutes * 60_000;
  };
  if (period === 'yesterday') return day(1);
  if (period === 'dayBefore') return day(2);
  if (period === 'week') return [day(6)[0], day(0)[1]];
  if (period === 'lastWeek') return [day(13)[0], day(6)[0]];
  if (period === 'month') return [monthStart(0), day(0)[1]];
  if (period === 'lastMonth') return [monthStart(1), monthStart(0)];
  return day(0);
}

/** The period before, as long as this one so far: today against yesterday, this month against the same days last month. */
export function previousRange(period, now = Date.now(), offsetMinutes = 480) {
  const [start, end] = periodRange(period, now, offsetMinutes);
  if (period === 'month') {
    const [lastStart, lastEnd] = periodRange('lastMonth', now, offsetMinutes);
    return [lastStart, Math.min(lastEnd, lastStart + (end - start))];
  }
  return [start - (end - start), start];
}

// ----------------------------------------------------------------- words

const T = {
  zh: {
    help: '我是 SuXin 助手。你可以这样问我：\n• Milo 还有多少？ / Milo 多少钱？\n• 今天卖了多少？ 昨天？ 这个星期？ 这个月？\n• 这个月赚多少？\n• 什么最好卖？\n• 有什么没货了？ / 低库存\n• 谁卖最多？\n• 库存价值多少？\n• 有什么采购单要收货？\n• 报告\n发「例子」看更多问题（会员、几点最忙、作废、税、进货、报损、卖不动…）。\n每天早上 8 点我会发营业报告给你。',
    notLinked: '这个 Telegram 还没有连接到 SuXin。请在 SuXin 收银后台 → 设置 → 通知，按「连接 Telegram」。',
    linked: (name, company) => `✅ 已连接：${name} · ${company}\n每天早上 8 点会收到营业报告。发「帮助」看可以问什么。`,
    badCode: '这个连接码不对或已过期（15 分钟内有效）。请在 设置 → 通知 再按一次「连接 Telegram」。',
    noSalesRight: '你的账号不能看销售。请老板在「员工 → 角色」给你看报表的权限。',
    noMatch: (q) => `找不到「${q}」。试试商品名字的一部分，或扫条码后发条码数字。`,
    stockLine: (name) => `📦 ${name}`,
    nowhere: '还没有盘点或进货记录。',
    sales: (day) => ({ yesterday: '昨天', dayBefore: '前天', week: '最近 7 天', lastWeek: '上个星期', month: '这个月', lastMonth: '上个月' }[day] || '今天'),
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
    help: 'I am the SuXin assistant. Ask me:\n• How many Milo? / Milo price?\n• Sales today, yesterday, this week, this month\n• Profit this month\n• Best sellers\n• What is out of stock? / Low stock\n• Who sold most?\n• Stock value\n• Purchase orders to receive\n• Report\nSend "examples" for more (customers, busiest hours, voids, tax, deliveries, write-offs, slow sellers…).\nI send the day\'s report every morning at 8.',
    notLinked: 'This Telegram is not connected to SuXin yet. In the SuXin back office go to Settings → Notifications and press Connect Telegram.',
    linked: (name, company) => `✅ Connected: ${name} · ${company}\nYou will get the report every morning at 8. Send "help" to see what to ask.`,
    badCode: 'That link code is wrong or has expired (15 minutes). Press Connect Telegram again under Settings → Notifications.',
    noSalesRight: 'Your account may not see sales. Ask the owner to give your role the reports permission.',
    noMatch: (q) => `Nothing called "${q}". Try part of the name, or send the barcode number.`,
    stockLine: (name) => `📦 ${name}`,
    nowhere: 'No counts or deliveries recorded yet.',
    sales: (day) => ({ yesterday: 'Yesterday', dayBefore: 'The day before yesterday', week: 'The last 7 days', lastWeek: 'The week before', month: 'This month', lastMonth: 'Last month' }[day] || 'Today'),
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
    help: 'Saya pembantu SuXin. Tanya saya:\n• Berapa stok Milo? / Harga Milo?\n• Jualan hari ini, semalam, minggu ini, bulan ini\n• Untung bulan ini\n• Paling laris\n• Apa stok habis? / Stok rendah\n• Siapa jual paling banyak?\n• Nilai stok\n• Pesanan belian untuk diterima\n• Laporan\nHantar "contoh" untuk lebih (pelanggan, waktu sibuk, batal, cukai, barang masuk, rosak, tak laku…).\nSaya hantar laporan setiap pagi jam 8.',
    notLinked: 'Telegram ini belum disambung ke SuXin. Di pejabat SuXin, pergi ke Tetapan → Pemberitahuan dan tekan Sambung Telegram.',
    linked: (name, company) => `✅ Disambung: ${name} · ${company}\nAnda akan terima laporan setiap pagi jam 8. Hantar "bantuan" untuk lihat apa boleh ditanya.`,
    badCode: 'Kod sambungan salah atau tamat tempoh (15 minit). Tekan Sambung Telegram semula di Tetapan → Pemberitahuan.',
    noSalesRight: 'Akaun anda tidak boleh lihat jualan. Minta pemilik beri kebenaran laporan.',
    noMatch: (q) => `Tiada barang "${q}". Cuba sebahagian nama, atau hantar nombor kod bar.`,
    stockLine: (name) => `📦 ${name}`,
    nowhere: 'Belum ada kiraan atau penghantaran.',
    sales: (day) => ({ yesterday: 'Semalam', dayBefore: 'Kelmarin', week: '7 hari lepas', lastWeek: 'Minggu sebelumnya', month: 'Bulan ini', lastMonth: 'Bulan lepas' }[day] || 'Hari ini'),
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
