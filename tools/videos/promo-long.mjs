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
import { item } from './world.mjs';
import { film, SIZE } from './studio.mjs';
import { reportText, summarize } from '../../api/bot.mjs';
import {
  CODE, DAY, GOLD, NAVY, PHONE, RED, SITE, TEAL, WA, fx, memDb, phoneStyle, prep, punch, routeOrders, routeReadOrder, shop, telegramCard, unpunch,
} from './promo-kit.mjs';

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
    endSay: '14 天免费试用。终身版全马只卖 50 套。WhatsApp 8926 3660 马上帮你装。',
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
    endSay: 'Cuba percuma 14 hari. Pakej seumur hidup terhad 50 set. WhatsApp 8926 3660.',
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
  await routeOrders(page, db);
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
  await routeReadOrder(page);
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
  await hit(`<span class="tag">SuXin · One Business. Connected.</span><br>${w.end[0]}<small>${w.end[1]}</small><small style="font-size:.5em;color:#ffd166;font-weight:900">${w.end[2]}</small><span class="cta" style="display:inline-block;margin-top:18px;background:#25d366;color:#fff;border-radius:999px;padding:12px 22px;font-size:.45em;font-weight:900">📱 WhatsApp ${WA.show}</span><small>${w.end[3]}</small>`,
    { bg: NAVY, ms: 6500, say: w.endSay, en: 'Free for 14 days' });
};

await film('promo-4-long-zh', shop(), longFilm('zh', true), { size: PHONE, prep });
await film('promo-5-long-bm', shop(), longFilm('ms', true), { size: PHONE, lang: 'ms', prep });
await film('promo-6-long-wide', shop(), longFilm('zh', false), { size: SIZE, prep });
