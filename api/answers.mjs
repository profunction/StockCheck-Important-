/**
 * The bot's answers beyond stock, sales and the report (bot.mjs): out of
 * stock, profit, best sellers, sales by cashier, stock value, purchase
 * orders waiting, prices -- and what it says when it does not understand.
 * Pure, tested in answers.test.mjs.
 */
import { qty, rangeLabel, rm, words } from './bot.mjs';

const A = {
  zh: {
    period: { today: '今天', yesterday: '昨天', week: '最近 7 天', month: '这个月' },
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
    noRight: '你的账号不能看这个。请老板在「员工 → 角色」给你权限。',
  },
  en: {
    period: { today: 'today', yesterday: 'yesterday', week: 'the last 7 days', month: 'this month' },
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
    noRight: 'Your account may not see this. Ask the owner for the permission under Employees → Roles.',
  },
  ms: {
    period: { today: 'hari ini', yesterday: 'semalam', week: '7 hari lepas', month: 'bulan ini' },
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
