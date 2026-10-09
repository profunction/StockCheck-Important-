/**
 * The advertisements (60 s and more): a story, not a tour. A shop owner's
 * bad day, the turn, the system doing its tricks fast with the camera
 * zooming in, what changed, and the offer -- in TikTok-style big captions,
 * with a "watch to the end" sticker. Sound effects are marked for the MP4
 * (tools/videos/mp4.mjs lays a beat, whooshes, beeps and the till's bell
 * under the picture).
 *
 *   promo-7-ad-zh     9:16, Chinese           TikTok, Reels, Shorts, Xiaohongshu ads
 *   promo-8-ad-bm     9:16, Malay             TikTok, Reels, Shorts ads
 *   promo-9-ad-wide   16:9, Chinese           YouTube, Facebook ads
 *
 *   node tools/videos/promo-ad.mjs [name ...]
 *
 * Filmed from the real system in the pretend shop, like promo-long.mjs;
 * the QR-ordering API and the screenshot-reading service are stood in for
 * the same way.
 */
import { item } from './world.mjs';
import { film, SIZE } from './studio.mjs';
import { reportText, summarize } from '../../api/bot.mjs';
import {
  CODE, DAY, GOLD, NAVY, PHONE, RED, SITE, TEAL, fx, memDb, phoneStyle, prep, punch, routeOrders, routeReadOrder, shop, telegramCard, unpunch,
} from './promo-kit.mjs';

const DARK = 'radial-gradient(circle at 50% 40%,#2a0b10,#0a0406 70%)';
const GREEN = 'linear-gradient(160deg,#03301f,#0a7a4a 60%,#22c55e)';

// --------------------------------------------------------- the ad's look

const AD_CSS = (phone) => `
  #demo-cap{background:none!important;box-shadow:none!important;bottom:${phone ? '17%' : '12%'}!important;max-width:94%!important;
    font:900 ${phone ? 33 : 40}px/1.25 "Noto Sans CJK SC","Noto Sans SC",sans-serif!important;color:#fff!important;padding:0!important;
    text-shadow:0 0 2px #000,0 0 2px #000,3px 3px 0 #000,-3px 3px 0 #000,3px -3px 0 #000,-3px -3px 0 #000,0 6px 18px rgba(0,0,0,.7)!important}
  #demo-cap small{font:800 ${phone ? 17 : 20}px/1.3 system-ui,sans-serif!important;color:#ffd166!important;opacity:1!important;margin-top:6px!important}
  #ad-badge{position:fixed;z-index:99996;top:${phone ? 14 : 18}px;left:50%;transform:translateX(-50%);background:#ff2d55;color:#fff;
    font:900 ${phone ? 17 : 20}px/1 "Noto Sans CJK SC",sans-serif;padding:9px 16px;border-radius:999px;box-shadow:0 6px 20px rgba(255,45,85,.45);
    animation:ad-pulse 1.2s ease-in-out infinite;pointer-events:none;white-space:nowrap}
  @keyframes ad-pulse{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.07)}}
  #pk .emo{display:block;font-size:2.1em;line-height:1.1;margin-bottom:14px;filter:drop-shadow(0 10px 18px rgba(0,0,0,.4))}
  #pk .num{display:block;font-size:1.55em;color:#ffd166;font-variant-numeric:tabular-nums;letter-spacing:.02em}
  #pk ul{list-style:none;margin:18px 0 0;padding:0;text-align:left;display:inline-block;font-size:.62em;line-height:1.75}
  #pk li{opacity:0;animation:pk-pop .45s both}
  #pk .cta{display:inline-block;margin-top:22px;background:#ffd166;color:#111;border-radius:999px;padding:14px 26px;font-size:.5em;font-weight:900;
    animation:ad-pulse2 .9s ease-in-out infinite}
  @keyframes ad-pulse2{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
  #app{will-change:transform}`;

const adStyle = (page, phone) => page.addStyleTag({ content: AD_CSS(phone) });

/** The sticker at the top that keeps people watching. */
const badge = (page, text) => page.evaluate((t) => {
  document.getElementById('ad-badge')?.remove();
  if (!t) return;
  const b = document.createElement('div'); b.id = 'ad-badge'; b.textContent = t; document.body.append(b);
}, text);

/** The camera moves in on [selector] (the page underneath grows around it). */
const zoomIn = (page, selector, k = 1.45) => page.evaluate(([sel, scale]) => {
  const root = document.getElementById('app');
  const el = document.querySelector(sel);
  if (!root || !el) return;
  const r = el.getBoundingClientRect();
  root.style.transition = 'transform .7s cubic-bezier(.2,.8,.2,1)';
  root.style.transformOrigin = `${r.x + r.width / 2}px ${r.y + r.height / 2}px`;
  root.style.transform = `scale(${scale})`;
}, [selector, k]);
const zoomOut = (page) => page.evaluate(() => { const r = document.getElementById('app'); if (r) r.style.transform = ''; });

/** A number that spins to [to] (or stays a question when [to] is null). */
const spin = (page, to, prefix = 'RM ') => page.evaluate(([n, p]) => {
  const el = document.querySelector('#pk .num');
  if (!el) return;
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 1400);
    if (n == null) el.textContent = `${p}${Math.floor(Math.random() * 9)},${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`;
    else el.textContent = `${p}${Math.round(n * (1 - (1 - k) ** 3))}`;
    if (k < 1) requestAnimationFrame(step); else if (n == null) el.textContent = `${p}?,???`;
  };
  requestAnimationFrame(step);
}, [to, prefix]);

const card = (emo, text) => `<span class="emo">${emo}</span>${text}`;
const list = (items) => `<ul>${items.map((x, i) => `<li style="animation-delay:${0.25 + i * 0.45}s">${x}</li>`).join('')}</ul>`;

// --------------------------------------------------------------- the words

const A = {
  zh: {
    badge: '👀 看到最后有限量优惠',
    alarm: '🚨 开店的老板<br><em>一定要看！</em>',
    story: [
      { emo: '🏪', text: 'Ah Hock 开杂货店<br><em>20 年</em>', en: 'Ah Hock has run his shop for 20 years' },
      { emo: '🥛🗑️', text: '牛奶又过期了<br>整箱<em>丢掉</em>', en: 'The milk expired again. Thrown away', bad: true },
      { emo: '💸', text: '员工找错钱<br>钱箱又<em>少了</em>', en: 'Wrong change. The drawer is short', bad: true },
      { emo: '😩📋', text: '盘点到半夜<br>数字还是<em>对不上</em>', en: 'Counting till midnight, and it never adds up', bad: true },
      { emo: '🏖️❓', text: '想放假？<br>人不在店，<em>什么都不知道</em>', en: 'Take a day off? Then you know nothing', bad: true },
    ],
    loss: '一年下来<br>到底亏了多少？',
    turn: '直到有一天<br>他换了一个系统……',
    logo: '<span class="tag">SuXin</span><br><em>一个系统</em><br>全部搞定<small>收银 · 仓库 · 盘点 · 扫码点餐 · 拼多多进货</small>',
    f1: '⚡ 第一招<br><em>扫一下就卖</em>',
    sell: ['哔、哔、哔……超市速度', 'Scan, scan, scan — supermarket speed'],
    total: ['SST 自动算，一分钱都不会错', 'SST worked out for you'],
    change: ['找多少钱，系统告诉员工', 'The till tells staff the change'],
    f2: '📱 第二招<br>客人<em>自己点餐</em>',
    qr: ['客人扫码，用自己的手机点', 'Customers order on their own phone'],
    qrSent: ['不用下载 app，马上拿到取餐号', 'No app, a pickup number at once'],
    bell: ['叮！收银机马上收到', 'Ding! The till gets it'],
    accept: ['按一下接单，厨房马上出单', 'One tap, the kitchen ticket prints'],
    f3: '📦 第三招<br>拼多多进货<br><em>截图就好</em>',
    pdd: ['截图一丢，自动变采购单', 'A screenshot becomes a purchase order'],
    pdd2: ['人民币换 RM、运费算进成本', 'Yuan to RM, shipping in the cost'],
    f4: '⏰ 第四招<br>过期前<em>30 天</em>提醒',
    exp: ['快过期的货，提早告诉你，先卖掉', 'Warned early — sell it first'],
    f5: '📊 第五招<br>每天早上<br>手机<em>叮一声</em>',
    tg: ['昨天卖多少、什么快没货，Telegram 自动报告', 'The morning report on Telegram'],
    f6: '🏬 第六招<br>几间分店<br><em>一个手机</em>管',
    stock: ['每间店、每个仓库的库存，一目了然', 'Every shop and warehouse, at a glance'],
    after: '现在的 Ah Hock',
    results: ['✅ 过期货不再整箱丢', '✅ 钱箱对得上', '✅ 盘点不用到半夜', '✅ 放假也知道生意'],
    offline: '断网？<em>照样卖！</em><small>中文 · English · Bahasa Melayu</small>',
    limit: '终身版<br>全马只卖',
    limitN: 50,
    limitSub: '套 · 卖完就没有',
    cta: `<span class="tag">SuXin · One Business. Connected.</span><br>先免费用 <em>14 天</em><small>收银每月 RM38 起 · 全套 RM48 起</small><span class="cta">👉 私信「试用」· 马上帮你装</span><small>${SITE}</small>`,
    ctaSay: '先免费用 14 天。私信「试用」，我们马上帮你装好。',
  },
  ms: {
    badge: '👀 Tonton sampai habis — tawaran terhad',
    alarm: '🚨 Tauke kedai<br><em>wajib tengok!</em>',
    story: [
      { emo: '🏪', text: 'Ah Hock buka kedai runcit<br><em>20 tahun</em>', en: 'Ah Hock has run his shop for 20 years' },
      { emo: '🥛🗑️', text: 'Susu luput lagi<br><em>buang</em> sekotak', en: 'The milk expired again. Thrown away', bad: true },
      { emo: '💸', text: 'Pekerja salah pulang baki<br>laci <em>kurang</em> lagi', en: 'Wrong change. The drawer is short', bad: true },
      { emo: '😩📋', text: 'Kira stok sampai tengah malam<br>masih <em>tak tepat</em>', en: 'Counting till midnight, never right', bad: true },
      { emo: '🏖️❓', text: 'Nak cuti?<br>Tak di kedai, <em>tak tahu apa-apa</em>', en: 'Take a day off? Then you know nothing', bad: true },
    ],
    loss: 'Setahun<br>berapa banyak rugi?',
    turn: 'Sampailah satu hari<br>dia tukar sistem…',
    logo: '<span class="tag">SuXin</span><br><em>Satu sistem</em><br>semua beres<small>POS · Gudang · Kira stok · Pesan QR · Pinduoduo</small>',
    f1: '⚡ Helah 1<br><em>Imbas terus jual</em>',
    sell: ['Bip, bip, bip… laju macam pasar raya', 'Supermarket speed'],
    total: ['SST dikira sendiri, sen pun tak silap', 'SST worked out for you'],
    change: ['Baki dikira, pekerja tak salah lagi', 'The till tells staff the change'],
    f2: '📱 Helah 2<br>Pelanggan<br><em>pesan sendiri</em>',
    qr: ['Imbas kod, pesan dari telefon sendiri', 'Customers order on their own phone'],
    qrSent: ['Tak perlu app, terus dapat nombor ambil', 'No app, a pickup number at once'],
    bell: ['Ting! Kaunter terus terima', 'Ding! The till gets it'],
    accept: ['Tekan Terima, dapur terus cetak', 'One tap, the kitchen ticket prints'],
    f3: '📦 Helah 3<br>Beli Pinduoduo?<br><em>Tangkap skrin</em>',
    pdd: ['Tangkapan skrin terus jadi pesanan belian', 'A screenshot becomes a purchase order'],
    pdd2: ['Yuan ke RM, kos penghantaran dikira', 'Yuan to RM, shipping in the cost'],
    f4: '⏰ Helah 4<br>Amaran luput<br><em>30 hari awal</em>',
    exp: ['Barang hampir luput? Jual dulu', 'Warned early — sell it first'],
    f5: '📊 Helah 5<br>Setiap pagi<br>telefon <em>berbunyi</em>',
    tg: ['Jualan semalam & stok rendah — laporan Telegram automatik', 'The morning report on Telegram'],
    f6: '🏬 Helah 6<br>Banyak cawangan<br><em>satu telefon</em>',
    stock: ['Stok setiap kedai & gudang — sekali pandang', 'Every shop and warehouse, at a glance'],
    after: 'Ah Hock sekarang',
    results: ['✅ Tiada lagi buang barang luput', '✅ Duit laci sentiasa tepat', '✅ Kira stok tak sampai malam', '✅ Cuti pun tahu jualan'],
    offline: 'Internet putus?<br><em>Terus jual!</em><small>Bahasa Melayu · English · 中文</small>',
    limit: 'Pakej seumur hidup<br>hanya',
    limitN: 50,
    limitSub: 'set di seluruh Malaysia',
    cta: `<span class="tag">SuXin · One Business. Connected.</span><br>Cuba <em>percuma 14 hari</em><small>POS dari RM38 sebulan · Pakej penuh RM48</small><span class="cta">👉 DM "CUBA" · kami pasang untuk anda</span><small>${SITE}</small>`,
    ctaSay: 'Cuba percuma 14 hari. DM CUBA, kami pasangkan untuk anda.',
  },
};

/** One advertisement in [lang], on a phone-shaped or a wide frame. */
const adFilm = (lang, phone) => async (page, x, base) => {
  const w = A[lang];
  const zh = lang === 'zh';
  const cap = (pair, ms) => x.caption(pair[0], pair[1], ms, zh ? '' : pair[0]);
  const hit = async (html, { sfx = 'whoosh', ...opts } = {}) => { x.mark(sfx); await punch(page, x, html, { ...opts, bm: !zh }); };
  const styled = async () => { if (phone) await phoneStyle(page); await adStyle(page, phone); await fx(page); };
  const scene = async (path, ready) => {
    await x.go(base, path, 700);
    await styled();
    if (ready) await page.waitForSelector(ready, { timeout: 8000 }).catch(() => {});
    await badge(page, w.badge);
  };
  await page.waitForSelector('.market');
  await styled();

  // 1. The alarm, and Ah Hock's bad day.
  await hit(w.alarm, { bg: RED, ms: 1500, shake: true, sfx: 'hit', en: 'Shop owners: watch this' });
  for (const s of w.story) await hit(card(s.emo, s.text), { bg: s.bad ? RED : NAVY, ms: s.bad ? 1900 : 2100, shake: !!s.bad, sfx: s.bad ? 'hit' : 'whoosh', en: s.en });
  await hit(`${w.loss}<span class="num">RM ?,???</span>`, { bg: DARK, ms: 200, sfx: 'hit', en: 'How much did a year cost him?' });
  await spin(page, null);
  await x.wait(2400);

  // 2. The turn.
  await hit(w.turn, { bg: NAVY, ms: 2100, en: 'Until one day, he changed systems' });
  await hit(w.logo, { bg: TEAL, ms: 2800, sfx: 'ding', en: 'SuXin: one system for everything' });
  await unpunch(page);
  await badge(page, w.badge);

  // 3. Trick 1: selling.
  await hit(w.f1, { bg: GOLD, ms: 1300, en: 'Trick 1: scan and sell' });
  await unpunch(page);
  await x.click('.mlines', 100);
  await cap(w.sell, 300);
  for (const pic of ['malt', 'water', 'coffee', 'noodle', 'rice', 'eggs']) { x.mark('beep'); await x.scan(item(pic).barcode, 300); }
  await zoomIn(page, '.totalcard', phone ? 1.6 : 1.5);
  await cap(w.total, 2000);
  await zoomOut(page);
  await x.wait(300);
  await x.click('.mpanel .pay', 600);
  await x.click('.dialog .paymethods button >> nth=0', 300);
  if (await page.$('.dialog .quick button')) await x.click('.dialog .quick button >> nth=1', 300);
  x.mark('cash');
  await cap(w.change, 1900);
  if (await page.$('.dialog .actions button.primary')) await x.click('.dialog .actions button.primary', 900);
  if (await page.$('.dialog button:has-text("下一单"), .dialog button:has-text("Jualan seterusnya")')) await page.keyboard.press('Escape');
  await page.keyboard.press('Escape'); await x.wait(200);

  // 4. Trick 2: customers order by QR code.
  await hit(w.f2, { bg: GOLD, ms: 1300, en: 'Trick 2: customers order themselves' });
  const db = memDb(shop());
  await routeOrders(page, db);
  await scene(`/order/?s=${encodeURIComponent(`w1~ipoh~${CODE}`)}&lang=${lang}`, '.so-item, button[data-type]');
  if (await page.$('button[data-type="TAKEAWAY"]')) await x.click('button[data-type="TAKEAWAY"]', 500);
  await page.waitForSelector('.so-item', { timeout: 8000 }).catch(() => {});
  await cap(w.qr, 400);
  for (const pic of ['nasilemak', 'roticanai', 'coffee']) {
    const sel = `.so-item[data-item="${item(pic).barcode}"]`;
    if (await page.$(sel)) {
      x.mark('pop');
      await x.click(sel, 400);
      if (await page.$('button[data-act="add-item"]')) await x.click('button[data-act="add-item"]', 300);
    }
  }
  await x.click('button[data-act="basket"]', 600);
  if (await page.$('.so-sheet input')) await x.type('.so-sheet input', 'Mei', 200);
  await x.click('button[data-act="send"]', 500);
  await page.waitForSelector('.so-ticket', { timeout: 8000 }).catch(() => {});
  await zoomIn(page, '.so-ticket', 1.35);
  await cap(w.qrSent, 1800);
  await zoomOut(page);
  await page.unroute(/\/public\/order\//);
  await scene('/pos/', '.market');
  for (const [k, v] of [...db.store].filter(([path]) => path.includes('/selfOrders/'))) await page.evaluate(([p, d]) => window.__put(p, d), [k, v]);
  await page.waitForSelector('button[data-act="qr-orders"].ringing', { timeout: 5000 }).catch(() => {});
  x.mark('ding');
  await zoomIn(page, 'button[data-act="qr-orders"]', 1.8);
  await cap(w.bell, 1500);
  await zoomOut(page);
  await x.click('button[data-act="qr-orders"]', 700);
  if (await page.$('button[data-act="qr-accept"]')) {
    await x.point('button[data-act="qr-accept"]');
    await cap(w.accept, 900);
    x.mark('cash');
    await x.click('button[data-act="qr-accept"]', 1000);
  }
  await page.keyboard.press('Escape'); await x.wait(200);

  // 5. Trick 3: Pinduoduo from a screenshot.
  await hit(w.f3, { bg: '#e02e24', ms: 1500, en: 'Trick 3: Pinduoduo, from a screenshot' });
  await routeReadOrder(page);
  await scene('/warehouse/#/online', 'button[data-act="pdd-shot"]');
  await x.point('button[data-act="pdd-shot"]');
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 200, height: 200 } });
  x.mark('whoosh');
  await page.setInputFiles('input[data-act="pdd-shots"]', { name: 'pdd.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('.wh-online-line', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.wh-online-line')?.scrollIntoView({ block: 'center' }));
  x.mark('ding');
  await cap(w.pdd, 2200);
  if (await page.$('.wh-online-total')) { await page.evaluate(() => document.querySelector('.wh-online-total')?.scrollIntoView({ block: 'center' })); await zoomIn(page, '.wh-online-total', 1.4); }
  await cap(w.pdd2, 1900);
  await zoomOut(page);
  await page.unroute(/\/app\/read-order$/);

  // 6. Trick 4: expiry.
  await hit(w.f4, { bg: RED, ms: 1400, en: 'Trick 4: expiry, 30 days ahead' });
  await scene('/warehouse/', '[data-card="expiring"]');
  await page.evaluate(() => document.querySelector('[data-card="expiring"]')?.scrollIntoView({ block: 'center' }));
  if (await page.$('[data-card="expiring"]')) await zoomIn(page, '[data-card="expiring"]', phone ? 1.25 : 1.4);
  await cap(w.exp, 2300);
  await zoomOut(page);

  // 7. Trick 5: the morning report -- the real report text.
  await hit(w.f5, { bg: '#229ed9', ms: 1400, en: 'Trick 5: the morning report' });
  await unpunch(page);
  const seed = shop();
  const sales = Object.entries(seed.set).filter(([k]) => k.includes('/sales/')).map(([, v]) => v);
  const report = reportText({
    company: 'Kedai Maju', summary: summarize(sales), start: Date.now() - DAY, lang: zh ? 'zh' : 'ms',
    lows: [{ name: item('rice').name, onHand: 4000, reorderLevel: 20000, place: 'Kedai Ipoh' }, { name: item('eggs').name, onHand: 6000, reorderLevel: 30000, place: 'Kedai Ipoh' }],
    soon: [{ name: item('bread').name, qtyMilli: 8000, expiry: new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10), daysLeft: 2, place: 'Kedai Ipoh' },
      { name: item('milk').name, qtyMilli: 12000, expiry: new Date(Date.now() + 4 * DAY).toISOString().slice(0, 10), daysLeft: 4, place: 'Kedai Ipoh' }],
  });
  x.mark('ding');
  x.cue(w.tg[0], w.tg[1], 0, zh ? '' : w.tg[0]);
  await telegramCard(page, x, report, 4300);

  // 8. Trick 6: every place, one phone.
  await hit(w.f6, { bg: GOLD, ms: 1400, en: 'Trick 6: every branch, one phone' });
  await scene('/warehouse/#/stock', 'table');
  await cap(w.stock, 2300);

  // 9. What changed, and the offer.
  await hit(`${w.after}${list(w.results)}`, { bg: GREEN, ms: 3600, sfx: 'ding', en: 'Ah Hock now' });
  await hit(w.offline, { bg: NAVY, ms: 1900, en: 'Internet down? Keep selling' });
  await hit(`${w.limit}<span class="num">0</span><small>${w.limitSub}</small>`, { bg: DARK, ms: 200, sfx: 'hit', en: 'Lifetime licences: only 50' });
  await spin(page, w.limitN, '');
  await x.wait(2400);
  await badge(page, '');
  await hit(w.cta, { bg: NAVY, ms: 7000, sfx: 'ding', say: w.ctaSay, en: 'Free for 14 days' });
};

await film('promo-7-ad-zh', shop(), adFilm('zh', true), { size: PHONE, prep });
await film('promo-8-ad-bm', shop(), adFilm('ms', true), { size: PHONE, lang: 'ms', prep });
await film('promo-9-ad-wide', shop(), adFilm('zh', false), { size: SIZE, prep });
