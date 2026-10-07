/**
 * Marketing videos, filmed from the real system in the pretend shop
 * (world.mjs) -- nothing in them is mocked up:
 *
 *   promo-1-wide      16:9, ~50 s, Chinese with Malay   YouTube, Facebook, website
 *   promo-2-reel-zh   9:16, ~30 s, Chinese with Malay   TikTok, Reels, Shorts, Xiaohongshu
 *   promo-3-reel-bm   9:16, ~30 s, Malay with English   TikTok, Reels, Shorts
 *
 *   node tools/videos/promo.mjs [name ...]
 */
import { item, world } from './world.mjs';
import { film } from './studio.mjs';

const SITE = 'stockcheck-fb58e.web.app';
const PHONE = { width: 540, height: 960 };
const GREEN = 'linear-gradient(160deg,#0d2418,#1f6b45 60%,#2f8a5b)';

const shop = (opts) => {
  const w = world(opts);
  Object.assign(w.set['workspaces/w1/pos/settings'], { tin: 'C21234567080', msic: '47111', msicName: 'Kedai runcit' });
  return w;
};

/** Smaller captions and titles on a phone-shaped frame. */
const phoneStyle = (page) => page.addStyleTag({ content: `
  #demo-cap{font-size:19px!important;padding:9px 16px!important;bottom:18px!important;max-width:92%!important}
  #demo-cap small{font-size:13px!important}
  #demo-title{font-size:34px!important;padding:0 24px}
  #demo-title small{font-size:19px!important}
  #demo-title em{font-size:15px!important}` });

/** The last card: what it costs and where to go. Stays until the film ends. */
async function endCard(page, x, lines, ms = 4500) {
  await page.evaluate(([l, bg]) => {
    const t = document.createElement('div');
    t.id = 'demo-title';
    t.style.setProperty('--demo-bg', bg);
    t.style.pointerEvents = 'none';
    t.innerHTML = `<div><div style="font-size:.6em;opacity:.85;letter-spacing:.04em">Pos Stock Check</div>${l[0]}<small>${l[1]}</small><small style="margin-top:6px">${l[2]}</small><em style="margin-top:18px;font-size:1.05em;opacity:1;color:#ffd166">${l[3]}</em></div>`;
    document.getElementById('demo-cap').innerHTML = '';
    document.getElementById('demo-cursor').style.display = 'none';
    document.body.append(t);
  }, [lines, GREEN]);
  await x.wait(ms);
}

// ----------------------------------------------------------- 16:9, zh + BM

await film('promo-1-wide', shop({ mode: 'SUPERMARKET', withSales: true }), async (page, x, base) => {
  await page.waitForSelector('.market');
  await x.title('收银 · 盘点 · 仓库<br>一个系统全搞定', '马来西亚商店、超市、仓库、餐厅', 'POS · Stok · Gudang — satu sistem', { bg: GREEN });
  await x.click('.shift-btn', 700);
  await x.type('.dialog input.bigsum', '200', 300);
  await x.caption('开班：点好备用金', 'Buka syif: kira wang apungan', 1300);
  await x.click('.dialog .actions button.primary', 700);
  await x.click('.mlines', 100);
  await x.caption('扫码就卖，超市速度', 'Imbas terus jual — laju macam pasar raya', 600);
  for (const pic of ['malt', 'water', 'coffee', 'noodle', 'milk']) await x.scan(item(pic).barcode, 380);
  await x.scan(item('rice').barcode, 500);
  await x.caption('米、糖、鸡蛋免 SST，系统自动分开算', 'Beras, gula, telur bebas SST — dikira sendiri', 2300);
  await x.click('.mpanel .pay', 700);
  await x.click('.dialog .paymethods button:has-text("现金")', 300);
  await x.click('.dialog .quick button >> nth=1', 400);
  await x.caption('现金四舍五入到 5 仙，钱箱自动打开', 'Tunai dibundar 5 sen, laci terbuka sendiri', 1500);
  await x.click('.dialog .actions button.primary', 1000);
  await x.caption('DuitNow QR、刷卡、电子钱包都可以', 'DuitNow QR, kad, e-dompet — semua boleh', 1800);
  await x.click('.dialog button:has-text("下一单")', 500);
  await x.click('.shift-btn', 1100);
  await x.type('.dialog input.bigsum', '255', 400);
  await x.caption('交班：短少多少马上知道', 'Tutup syif: kurang atau lebih terus nampak', 2200);
  await page.keyboard.press('Escape'); await x.wait(300);
  await x.go(base, '/pos/#/reports/summary', 1300);
  await x.caption('老板随时看报表：卖多少、赚多少', 'Bos tengok laporan: jualan & untung', 2300);
  await x.go(base, '/pos/#/reports/einvoice', 900);
  await page.fill('input[type=month]', new Date().toISOString().slice(0, 7));
  await page.dispatchEvent('input[type=month]', 'change');
  await page.waitForSelector('button:has-text("下载 JSON")');
  await x.point('button:has-text("下载 JSON")');
  await x.caption('每月一键 LHDN 电子发票（MyInvois）', 'e-Invois LHDN sebulan sekali, satu klik', 2400);
  await x.go(base, '/warehouse/#/stock', 1500);
  await x.caption('仓库系统：库存、在途、订购中，一目了然', 'Sistem gudang: stok, dalam transit, dipesan', 2400);
  await x.go(base, '/warehouse/#/purchase/reorder', 1400);
  await x.caption('低库存自动建议补货，一键生成采购单', 'Stok rendah? Cadangan pesanan automatik', 2400);
  await endCard(page, x, ['免费试用 14 天', '每月 RM48 起 · 收银 + 盘点 app + 仓库', '终身版限量 50 套', SITE], 5000);
});

// ------------------------------------------------------------ 9:16, zh + BM

await film('promo-2-reel-zh', shop({ mode: 'SUPERMARKET' }), async (page, x, base) => {
  await page.waitForSelector('.market');
  await phoneStyle(page);
  await x.title('还在用本子<br>记库存？', '库存对不上，钱不见了', 'Masih catat stok dalam buku?', { bg: GREEN });
  await x.click('.mlines', 100);
  await x.caption('扫码收银', 'Imbas & jual', 500);
  for (const pic of ['malt', 'water', 'eggs', 'coffee']) await x.scan(item(pic).barcode, 420);
  await x.caption('卖一样，库存自动少一样', 'Jual satu, stok tolak sendiri', 1800);
  await x.caption('鸡蛋免 SST，自动算对', 'Telur bebas SST, kira betul', 1600);
  await x.go(base, '/warehouse/', 1300);
  await phoneStyle(page);
  await x.caption('手机就是仓库系统', 'Telefon jadi sistem gudang', 1800);
  await x.click('.wh-tile:has-text("收货")', 1200);
  await x.click('.wh-card:has-text("PO-")', 1200);
  await x.caption('货到了，扫一扫就入库', 'Barang sampai? Imbas, masuk stok', 2000);
  await x.go(base, '/warehouse/#/stock', 1300);
  await phoneStyle(page);
  await x.caption('什么在哪里、还剩多少，一查就知道', 'Stok di mana, berapa tinggal — terus tahu', 2200);
  await endCard(page, x, ['14 天免费试用', '每月 RM48 起', '终身版限量 50 套', SITE], 4500);
}, { size: PHONE });

// --------------------------------------------------------------- 9:16, BM

await film('promo-3-reel-bm', shop({ mode: 'SUPERMARKET' }), async (page, x, base) => {
  await page.waitForSelector('.market');
  await phoneStyle(page);
  await x.title('Stok tak pernah<br>tepat?', 'POS + kira stok + gudang', 'One system for your shop', { bg: GREEN });
  await x.click('.mlines', 100);
  await x.caption('Imbas & jual', 'Scan and sell', 500);
  for (const pic of ['malt', 'rice', 'sugar', 'water']) await x.scan(item(pic).barcode, 420);
  await x.caption('Beras & gula bebas SST — dikira sendiri', 'SST-exempt goods handled for you', 2000);
  await x.caption('Jual satu, stok tolak sendiri', 'Every sale updates stock', 1800);
  await x.go(base, '/warehouse/', 1300);
  await phoneStyle(page);
  await x.caption('Gudang dalam telefon', 'Your warehouse, on your phone', 1800);
  await x.go(base, '/warehouse/#/purchase/reorder', 1400);
  await phoneStyle(page);
  await x.caption('Stok rendah? Pesanan dicadang automatik', 'Low stock? Reorder suggested', 2200);
  await endCard(page, x, ['Cuba percuma 14 hari', 'Dari RM48 sebulan', 'Seumur hidup: terhad 50 set', SITE], 4500);
}, { size: PHONE, lang: 'ms' });
