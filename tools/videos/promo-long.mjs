/**
 * The long marketing films (60 s and more), filmed from the real system in
 * the pretend shop (world.mjs): a hook, then everything a shop owner cares
 * about, fast -- selling, customers ordering by QR code, Pinduoduo
 * purchases from a screenshot, expiry warnings, the morning Telegram
 * report, the boss's reports and the warehouse -- and the offer.
 *
 *   promo-4-long-zh     9:16, Chinese with Malay    TikTok, Reels, Shorts, Xiaohongshu
 *   promo-5-long-bm     9:16, Malay with English    TikTok, Reels, Shorts
 *   promo-6-long-wide   16:9, Chinese with Malay    YouTube, Facebook, website
 *
 *   node tools/videos/promo-long.mjs [name ...]
 *
 * Two things cannot happen inside a film and are stood in for, as in the
 * tests: the screenshot-reading service answers with the order on the
 * screenshot, and the QR-ordering API runs here, on the shop's own data.
 * The Telegram card shows the real report text (api/bot.mjs reportText).
 */
import { item, world } from './world.mjs';
import { film, SIZE } from './studio.mjs';
import { selfOrdering } from '../../api/selforder.mjs';
import { reportText, summarize } from '../../api/bot.mjs';

const SITE = 'stockcheck-fb58e.web.app';
const PHONE = { width: 540, height: 960 };
const W = 'workspaces/w1/';
const DAY = 86_400_000;
const CODE = 'PromoQr2026AB';
const NAVY = 'linear-gradient(160deg,#0b1b2b,#12385a 60%,#0f4c4a)';
const RED = 'linear-gradient(160deg,#5a0d16,#b3122a 70%,#e8473b)';
const TEAL = 'linear-gradient(160deg,#063c3a,#0b7a6f 60%,#2fd3b9)';
const GOLD = 'linear-gradient(160deg,#3d2a00,#a86b00 60%,#ffc233)';

/** The shop: a supermarket at Ipoh, QR ordering on, milk running out of date. */
function shop() {
  const w = world({ mode: 'SUPERMARKET', withSales: true });
  Object.assign(w.set[`${W}pos/settings`], {
    tin: 'C21234567080', msic: '47111', msicName: 'Kedai runcit',
    selfOrder: { enabled: true, dineIn: false, takeaway: true, message: '欢迎光临！Selamat datang!', codes: { ipoh: CODE } },
  });
  const day = (n) => new Date(Date.now() + n * DAY + 8 * 3600_000).toISOString().slice(0, 10);
  const recv = (id, pic, qty, expiry, ago) => {
    w.set[`${W}movements/${id}`] = {
      barcode: item(pic).barcode, productName: item(pic).name, branchId: 'ipoh', type: 'RECEIVE', quantityMilli: qty * 1000,
      at: Date.now() - ago * DAY, source: 'WAREHOUSE', reference: `GRN-${id}`, expiry, createdByName: 'Siti', createdAt: Date.now() - ago * DAY,
    };
  };
  recv('ex1', 'milk', 12, day(4), 20);
  recv('ex2', 'bread', 8, day(2), 3);
  recv('ex3', 'eggs', 30, day(9), 6);
  return w;
}

/** The QR-ordering API, on a copy of the shop's data kept here. */
function memDb(seed) {
  const store = new Map(Object.entries(structuredClone(seed.set)));
  let n = 0;
  const docRef = (path) => ({
    id: path.split('/').pop(), path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (d) => { store.set(path, structuredClone(d)); },
    collection: (name) => colRef(`${path}/${name}`),
  });
  const colRef = (path) => ({
    doc: (id) => docRef(`${path}/${id || `qr${Date.now()}${String(++n).padStart(6, '0')}`}`),
    get: async () => ({ docs: [...store].filter(([k]) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/')).map(([k, v]) => ({ id: k.split('/').pop(), data: () => v })) }),
  });
  return {
    store,
    collection: (name) => colRef(name),
    runTransaction: async (fn) => { const writes = []; await fn({ get: (r) => r.get(), set: (r, d) => writes.push(r.set(d)) }); await Promise.all(writes); },
  };
}

// ------------------------------------------------------------ the effects

const FX = `
  @keyframes pk-in{0%{transform:scale(1.35);opacity:0;filter:blur(6px)}60%{transform:scale(.97);opacity:1;filter:blur(0)}100%{transform:scale(1)}}
  @keyframes pk-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}40%{transform:translateX(9px)}60%{transform:translateX(-6px)}80%{transform:translateX(4px)}}
  @keyframes pk-pop{0%{transform:translateY(40px) scale(.9);opacity:0}100%{transform:none;opacity:1}}
  #pk{position:fixed;inset:0;z-index:99997;display:grid;place-items:center;text-align:center;color:#fff;pointer-events:none;
      font:900 64px/1.18 "Noto Sans CJK SC","Noto Sans SC",sans-serif;padding:0 28px;letter-spacing:.01em}
  #pk>div{animation:pk-in .45s cubic-bezier(.2,.9,.3,1.2) both}
  #pk.shake>div{animation:pk-in .35s both, pk-shake .5s .35s both}
  #pk small{display:block;font-size:.42em;font-weight:600;opacity:.92;margin-top:16px;line-height:1.35}
  #pk em{display:inline-block;font-style:normal;color:#ffd166}
  #pk .tag{display:inline-block;font-size:.3em;font-weight:800;letter-spacing:.18em;background:rgba(255,255,255,.16);border-radius:999px;padding:6px 16px;margin-bottom:18px}
  #tg{position:fixed;z-index:99996;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,90vw);background:#17212b;color:#e9eef3;border-radius:18px;
      box-shadow:0 30px 80px rgba(0,0,0,.55);font:500 16px/1.45 system-ui,"Noto Sans CJK SC",sans-serif;overflow:hidden;animation:pk-pop .5s both}
  #tg .bar{display:flex;align-items:center;gap:10px;background:#232e3c;padding:12px 16px;font-weight:700}
  #tg .bar i{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#2fd3b9,#12385a);display:grid;place-items:center;font-style:normal;font-weight:900}
  #tg .msg{margin:14px;background:#2b5278;border-radius:14px 14px 4px 14px;padding:12px 14px;white-space:pre-wrap;max-height:62vh;overflow:hidden}
  #tg .time{text-align:right;font-size:12px;opacity:.6;margin-top:4px}`;

const fx = (page) => page.evaluate((css) => { if (!document.getElementById('pk-style')) { const s = document.createElement('style'); s.id = 'pk-style'; s.textContent = css; document.head.append(s); } }, FX);

/** A full-screen punch card: big words, a colour, a shake for bad news. */
async function punch(page, x, html, { bg = NAVY, ms = 1600, shake = false, say = '', en = '', bm = false } = {}) {
  await fx(page);
  // On a Malay film the words are Malay: spoken as Malay too.
  x.cue(say || html, en, 0, bm ? (say || html) : '');
  await page.evaluate(([h, b, s]) => {
    document.getElementById('pk')?.remove();
    const d = document.createElement('div'); d.id = 'pk'; d.style.background = b; if (s) d.className = 'shake';
    d.innerHTML = `<div>${h}</div>`; document.body.append(d);
    const cap = document.getElementById('demo-cap'); if (cap) cap.innerHTML = '';
  }, [html, bg, shake]);
  await x.wait(ms);
}
const unpunch = (page) => page.evaluate(() => document.getElementById('pk')?.remove());

/** A Telegram chat with the morning report in it. */
async function telegramCard(page, x, text, ms) {
  await fx(page);
  await page.evaluate((t) => {
    document.getElementById('tg')?.remove();
    const d = document.createElement('div'); d.id = 'tg';
    d.innerHTML = '<div class="bar"><i>S</i><div>SuXin Bot<div style="font-size:12px;font-weight:500;opacity:.6">bot</div></div></div><div class="msg"></div>';
    d.querySelector('.msg').textContent = t;
    const time = document.createElement('div'); time.className = 'time'; time.textContent = '08:00 ✓✓'; d.querySelector('.msg').append(time);
    document.body.append(d);
  }, text);
  await x.wait(ms);
  await page.evaluate(() => document.getElementById('tg')?.remove());
}

/** Smaller captions on a phone-shaped frame, and the punch cards to fit. */
const phoneStyle = (page) => page.addStyleTag({ content: `
  #demo-cap{font-size:20px!important;padding:9px 16px!important;bottom:18px!important;max-width:94%!important}
  #demo-cap small{font-size:14px!important}
  #pk{font-size:50px!important}` });

// ------------------------------------------------------------ the words

const T = {
  zh: {
    hook: ['老板注意！', '你的店每个月<br><em>偷偷亏</em>多少钱？'],
    pains: ['❌ 货过期<br>整箱丢掉', '❌ 员工<br>算错钱', '❌ 库存<br>永远对不上', '❌ 老板不在<br>什么都不知道'],
    painsEn: ['Stock expires, thrown away', 'Staff get the change wrong', 'Stock never adds up', 'Away from the shop, you know nothing'],
    reveal: '<span class="tag">SuXin</span><br>一个系统<br><em>全包</em>', revealSub: '收银 · 仓库 · 盘点 · 扫码点餐',
    sell: ['扫一下就卖，超市速度', 'Imbas terus jual — laju macam pasar raya'],
    sst: ['米、糖、鸡蛋免 SST，系统自动分开算', 'Beras, gula, telur bebas SST — dikira sendiri'],
    stock: ['卖一样，库存马上少一样', 'Jual satu, stok tolak sendiri'],
    qrHook: '客人<em>自己</em>点餐<small>不用请多一个人</small>',
    qrPhone: ['客人扫码，用自己手机点，不用下载 app', 'Pelanggan imbas kod, pesan dari telefon sendiri'],
    qrSent: ['送出！马上拿到取餐号', 'Hantar! Terus dapat nombor ambil'],
    qrBell: ['收银机「叮」一声，新订单到了', 'Kaunter berbunyi: pesanan baharu'],
    qrAccept: ['按接单，厨房马上出单', 'Tekan Terima, dapur terus cetak'],
    pddHook: '拼多多进货？<br><em>截图</em>就好',
    pdd: ['截图一丢，商品、价钱、运单号全读出来', 'Tangkapan skrin Pinduoduo terus jadi pesanan belian'],
    pddCost: ['人民币自动换 RM，运费算进成本', 'Yuan ditukar ke RM, kos penghantaran dikira'],
    expHook: '过期的货<br>不再<em>整箱丢</em>',
    exp: ['快过期的货，提早 30 天提醒你', 'Barang hampir luput? Diberitahu 30 hari awal'],
    tgHook: '每天早上 8 点<br>手机<em>叮</em>一声',
    tg: ['昨天卖多少、什么快没货、什么快过期，全部自动报告', 'Laporan pagi automatik di Telegram'],
    boss: ['老板在哪里都看得到：卖多少、赚多少', 'Bos tengok jualan & untung dari mana-mana'],
    wh: ['仓库：库存、在途、整箱散装、货架位置，一目了然', 'Gudang: stok, transit, karton, rak — semua jelas'],
    reorder: ['快没货？系统自动建议补货，一键生成采购单', 'Stok rendah? Pesanan dicadang automatik'],
    offline: '断网？<br><em>照样卖</em><small>有网自动同步</small>',
    langs: '中文 · English<br>Bahasa Melayu<small>员工是外劳也会用</small>',
    end: ['14 天免费试用', '收银每月 RM38 起 · 全套 RM48 起', '终身版全马<em>只卖 50 套</em>', SITE],
    endSay: '14 天免费试用。收银每月 RM38 起。终身版全马只卖 50 套，卖完就没有。',
  },
  ms: {
    hook: ['Bos, dengar sini!', 'Berapa duit kedai anda<br><em>hilang</em> setiap bulan?'],
    pains: ['❌ Barang luput<br>dibuang', '❌ Pekerja<br>salah kira', '❌ Stok<br>tak pernah tepat', '❌ Bos tiada<br>tak tahu apa-apa'],
    painsEn: ['Stock expires, thrown away', 'Staff get the change wrong', 'Stock never adds up', 'Away from the shop, you know nothing'],
    reveal: '<span class="tag">SuXin</span><br>Satu sistem<br><em>semua siap</em>', revealSub: 'POS · Gudang · Kira stok · Pesan QR',
    sell: ['Imbas terus jual — laju macam pasar raya', 'Scan and sell, supermarket speed'],
    sst: ['Beras, gula, telur bebas SST — dikira sendiri', 'SST-exempt goods handled for you'],
    stock: ['Jual satu, stok tolak sendiri', 'Every sale updates stock'],
    qrHook: 'Pelanggan<br><em>pesan sendiri</em><small>Tak perlu tambah pekerja</small>',
    qrPhone: ['Imbas kod, pesan dari telefon sendiri — tak perlu app', 'Customers order on their own phone, no app'],
    qrSent: ['Hantar! Terus dapat nombor ambil', 'Sent — with a pickup number'],
    qrBell: ['Kaunter berbunyi: pesanan baharu', 'The till rings: a new order'],
    qrAccept: ['Tekan Terima, dapur terus cetak', 'Accept, and the kitchen ticket prints'],
    pddHook: 'Beli dari Pinduoduo?<br><em>Tangkap skrin</em> sahaja',
    pdd: ['Tangkapan skrin terus jadi pesanan belian', 'A screenshot becomes a purchase order'],
    pddCost: ['Yuan ditukar ke RM, kos penghantaran dikira', 'Yuan to ringgit, shipping in the cost'],
    expHook: 'Barang luput<br><em>tak dibuang lagi</em>',
    exp: ['Hampir luput? Diberitahu 30 hari awal', 'Warned 30 days before expiry'],
    tgHook: 'Setiap pagi 8 pagi<br>telefon <em>berbunyi</em>',
    tg: ['Jualan semalam, stok rendah, barang hampir luput — automatik', 'Yesterday\'s sales, low stock, expiring goods'],
    boss: ['Bos tengok jualan & untung dari mana-mana', 'Sales and profit, from anywhere'],
    wh: ['Gudang: stok, transit, karton, rak — semua jelas', 'Stock, transit, cartons, shelves'],
    reorder: ['Stok rendah? Pesanan dicadang automatik', 'Low stock? Reorder suggested'],
    offline: 'Internet putus?<br><em>Terus jual</em><small>Disegerak bila online</small>',
    langs: 'Bahasa Melayu · English<br>中文<small>Semua pekerja boleh guna</small>',
    end: ['Cuba percuma 14 hari', 'POS dari RM38 sebulan · Pakej penuh RM48', 'Seumur hidup: <em>terhad 50 set</em>', SITE],
    endSay: 'Cuba percuma 14 hari. POS dari RM38 sebulan. Pakej seumur hidup terhad 50 set sahaja.',
  },
};

/** One long film in [lang], on a phone-shaped or a wide frame. */
const longFilm = (lang, phone) => async (page, x, base) => {
  const w = T[lang];
  const zh = lang === 'zh';
  // A caption; on a Malay film its words are also what the Malay voice says.
  const cap = (pair, ms) => x.caption(pair[0], pair[1], ms, zh ? '' : pair[0]);
  const hit = (html, opts) => punch(page, x, html, { ...opts, bm: !zh });
  const styled = async () => { if (phone) await phoneStyle(page); await fx(page); };
  await page.waitForSelector('.market');
  await styled();

  // 1. The hook: bad news, fast.
  await hit(w.hook[0], { bg: RED, ms: 1000, shake: true, en: 'Boss, listen' });
  await hit(w.hook[1], { bg: RED, ms: 2400, en: 'How much does your shop lose every month?' });
  for (const [i, p] of w.pains.entries()) await hit(p, { bg: i % 2 ? RED : '#1a0f12', ms: 1100, shake: true, en: w.painsEn[i] });
  await hit(`${w.reveal}<small>${w.revealSub}</small>`, { bg: TEAL, ms: 2600, en: 'One system for the whole shop' });
  await unpunch(page);

  // 2. Selling.
  await x.click('.mlines', 100);
  await cap(w.sell, 500);
  for (const pic of ['malt', 'water', 'coffee', 'noodle', 'rice', 'eggs']) await x.scan(item(pic).barcode, 330);
  await cap(w.sst, 2100);
  await cap(w.stock, 1800);

  // 3. Customers order by QR code.
  await hit(w.qrHook, { bg: GOLD, ms: 1800, en: 'Customers order for themselves' });
  const db = memDb(shop());
  const api = selfOrdering(db, { now: () => Date.now() });
  await page.route(/\/public\/order\//, async (route) => {
    const url = new URL(route.request().url());
    const [, , , code, id] = url.pathname.split('/').map(decodeURIComponent);
    try {
      const body = route.request().method() === 'POST' ? await api.place(code, route.request().postDataJSON()) : id ? await api.status(code, id) : await api.menu(code);
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    } catch (err) {
      await route.fulfill({ status: err.status || 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { message: err.message } }) });
    }
  });
  await x.go(base, `/order/?s=${encodeURIComponent(`w1~ipoh~${CODE}`)}&lang=${lang}`, 1200);
  await styled();
  if (await page.$('button[data-type="TAKEAWAY"]')) await x.click('button[data-type="TAKEAWAY"]', 700);
  await page.waitForSelector('.so-item');
  await cap(w.qrPhone, 600);
  for (const pic of ['nasilemak', 'roticanai', 'coffee']) {
    const sel = `.so-item[data-item="${item(pic).barcode}"]`;
    if (await page.$(sel)) {
      await x.click(sel, 500);
      if (await page.$('button[data-act="add-item"]')) await x.click('button[data-act="add-item"]', 400);
    }
  }
  await x.click('button[data-act="basket"]', 800);
  if (await page.$('.so-sheet input')) await x.type('.so-sheet input', 'Mei', 300);
  await x.click('button[data-act="send"]', 600);
  await page.waitForSelector('.so-ticket', { timeout: 8000 }).catch(() => {});
  await cap(w.qrSent, 2000);
  await page.unroute(/\/public\/order\//);
  await x.go(base, '/pos/', 1000);
  await page.waitForSelector('.market');
  await styled();
  // The order the customer just sent, arriving at the till.
  const orders = [...db.store].filter(([k]) => k.includes('/selfOrders/'));
  for (const [k, v] of orders) await page.evaluate(([p, d]) => window.__put(p, d), [k, v]);
  await page.waitForSelector('button[data-act="qr-orders"].ringing', { timeout: 5000 }).catch(() => {});
  await x.point('button[data-act="qr-orders"]');
  await cap(w.qrBell, 1600);
  await x.click('button[data-act="qr-orders"]', 900);
  if (await page.$('button[data-act="qr-accept"]')) {
    await x.point('button[data-act="qr-accept"]');
    await cap(w.qrAccept, 1200);
    await x.click('button[data-act="qr-accept"]', 1200);
  }
  await page.keyboard.press('Escape'); await x.wait(300);

  // 4. Pinduoduo from a screenshot.
  await hit(w.pddHook, { bg: '#e02e24', ms: 1800, en: 'Buying on Pinduoduo? Just a screenshot' });
  await page.route(/\/app\/read-order$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
    platform: 'pdd', orderNo: '240915-582013947761', trackingNo: 'YT7491234567890', currency: 'CNY', shippingCents: 1000, totalCents: 23800,
    lines: [{ title: '泰国香米 5kg 批发', variation: '5kg', qty: 4, priceCents: 3000 }, { title: '马来西亚咖啡粉 500g', variation: '500g', qty: 6, priceCents: 1800 }],
  }) }));
  await x.go(base, '/warehouse/#/online', 1000);
  await styled();
  await page.waitForSelector('button[data-act="pdd-shot"]');
  await x.point('button[data-act="pdd-shot"]');
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 200, height: 200 } });
  await page.setInputFiles('input[data-act="pdd-shots"]', { name: 'pdd.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('.wh-online-line', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.wh-online-line')?.scrollIntoView({ block: 'center' }));
  await cap(w.pdd, 2600);
  if (await page.$('.wh-online-total')) await x.point('.wh-online-total');
  await cap(w.pddCost, 2200);
  await page.unroute(/\/app\/read-order$/);

  // 5. Expiry.
  await hit(w.expHook, { bg: RED, ms: 1700, en: 'No more expired stock thrown away' });
  await x.go(base, '/warehouse/', 1000);
  await styled();
  await page.waitForSelector('[data-card="expiring"]', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('[data-card="expiring"]')?.scrollIntoView({ block: 'center' }));
  if (await page.$('[data-card="expiring"]')) await x.point('[data-card="expiring"] .pill');
  await cap(w.exp, 2600);

  // 6. The morning report on Telegram -- the real report, from this shop's day.
  await hit(w.tgHook, { bg: '#229ed9', ms: 1700, en: 'Every morning at 8, your phone pings' });
  await unpunch(page);
  const seed = shop();
  const sales = Object.entries(seed.set).filter(([k]) => k.includes('/sales/')).map(([, v]) => v);
  const report = reportText({
    company: 'Kedai Maju', summary: summarize(sales), start: Date.now() - DAY, lang: zh ? 'zh' : 'ms',
    lows: [{ name: item('rice').name, onHand: 4000, reorderLevel: 20000, place: 'Kedai Ipoh' }, { name: item('eggs').name, onHand: 6000, reorderLevel: 30000, place: 'Kedai Ipoh' }],
    soon: [{ name: item('bread').name, qtyMilli: 8000, expiry: new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10), daysLeft: 2, place: 'Kedai Ipoh' },
      { name: item('milk').name, qtyMilli: 12000, expiry: new Date(Date.now() + 4 * DAY).toISOString().slice(0, 10), daysLeft: 4, place: 'Kedai Ipoh' }],
  });
  x.cue(w.tg[0], w.tg[1], 0, zh ? '' : w.tg[0]);
  await telegramCard(page, x, report, 5200);

  // 7. The boss, and the warehouse.
  await x.go(base, '/pos/#/reports/summary', 1100);
  await styled();
  await cap(w.boss, 2300);
  await x.go(base, '/warehouse/#/stock', 1100);
  await styled();
  await cap(w.wh, 2400);
  await x.go(base, '/warehouse/#/purchase/reorder', 1100);
  await styled();
  await cap(w.reorder, 2300);

  // 8. Two more reasons, and the offer.
  await hit(w.offline, { bg: NAVY, ms: 1900, en: 'Internet down? Keep selling' });
  await hit(w.langs, { bg: TEAL, ms: 1900, en: 'Chinese, English, Malay' });
  await hit(`<span class="tag">SuXin · One Business. Connected.</span><br>${w.end[0]}<small>${w.end[1]}</small><small style="font-size:.5em;color:#ffd166;font-weight:900">${w.end[2]}</small><small>${w.end[3]}</small>`,
    { bg: NAVY, ms: 6500, say: w.endSay, en: 'Free for 14 days' });
};

/** The first frame is already the hook's colour: no white loading screen. */
const prep = (page) => page.addInitScript((bg) => {
  if (location.pathname !== '/pos/' || sessionStorage.getItem('promo.opened')) return;
  sessionStorage.setItem('promo.opened', '1');
  const cover = () => {
    if (!document.documentElement || document.getElementById('pk')) return;
    const d = document.createElement('div'); d.id = 'pk';
    d.style.cssText = `position:fixed;inset:0;z-index:99997;background:${bg}`;
    document.documentElement.append(d);
  };
  cover();
  document.addEventListener('DOMContentLoaded', cover);
}, RED);

await film('promo-4-long-zh', shop(), longFilm('zh', true), { size: PHONE, prep });
await film('promo-5-long-bm', shop(), longFilm('ms', true), { size: PHONE, lang: 'ms', prep });
await film('promo-6-long-wide', shop(), longFilm('zh', false), { size: SIZE, prep });
