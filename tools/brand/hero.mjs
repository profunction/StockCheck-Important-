/**
 * The website's hero pictures (web/img/hero-{zh,en,ms}.jpg): the real
 * JSOX POS with a bill under way in the pretend shop (world.mjs, items with
 * their pictures), and JSOX WMS on a phone beside it, on the JSOX
 * navy. Nothing is mocked up -- both screens are screenshots of the system.
 *
 *   node tools/brand/hero.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from '../../tests/ui/harness.mjs';
import { world } from '../videos/world.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = join(root, 'tools', 'brand', '_hero');
mkdirSync(tmp, { recursive: true });

const LABELS = {
  zh: { pos: 'JSOX POS · 收银', wh: 'JSOX WMS · 仓库', count: 'JSOX Barcode Scan · 盘点', stock: '一份库存', tag: '一盘生意，一套系统。' },
  en: { pos: 'JSOX POS', wh: 'JSOX WMS', count: 'JSOX Barcode Scan', stock: 'One stock', tag: 'One Business. Connected.' },
  ms: { pos: 'JSOX POS · Kaunter', wh: 'JSOX WMS · Gudang', count: 'JSOX Barcode Scan · Kira stok', stock: 'Satu stok', tag: 'Satu Perniagaan. Semua Bersambung.' },
};

async function screens(lang) {
  const seed = world({ mode: 'RETAIL' });
  const till = await start({ seedPatch: seed, lang, viewport: { width: 1366, height: 800 } });
  till.page.setDefaultTimeout(10_000);
  await till.page.addInitScript((b) => localStorage.setItem('pos.branch.w1', JSON.stringify(b)), seed.branch);
  await till.page.goto(till.base + '/pos/#/pos');
  await till.page.waitForSelector('.tile');
  await till.page.waitForTimeout(600);
  for (const pic of ['malt', 'coffee', 'rice', 'eggs', 'milk']) {
    await till.page.click(`.tile:has(.pic[style*="/${pic}.svg"])`);
    await till.page.waitForTimeout(150);
  }
  await till.page.waitForTimeout(500);
  await till.page.screenshot({ path: join(tmp, `pos-${lang}.png`) });
  await till.done();

  const wh = await start({ seedPatch: seed, lang, viewport: { width: 390, height: 780 } });
  await wh.page.addInitScript((b) => localStorage.setItem('pos.branch.w1', JSON.stringify(b)), seed.branch);
  await wh.page.goto(wh.base + '/warehouse/#/stock');
  await wh.page.waitForTimeout(1500);
  await wh.page.screenshot({ path: join(tmp, `wh-${lang}.png`) });
  await wh.done();
}

const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

function scene(lang) {
  const L = LABELS[lang];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0}
  body{width:1400px;height:900px;overflow:hidden;font-family:"Noto Sans CJK SC","Noto Sans SC",system-ui,sans-serif;
    background:radial-gradient(900px 600px at 85% 10%,rgba(45,212,191,.22),transparent 60%),linear-gradient(150deg,#0b1b2b 0%,#12385a 62%,#0f4c4a 100%);position:relative}
  svg.net{position:absolute;inset:0}
  .laptop{position:absolute;left:60px;top:92px;width:1060px}
  .screen{background:#0a1220;border-radius:18px 18px 6px 6px;padding:14px 14px 18px;box-shadow:0 40px 80px -30px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.08) inset}
  .screen img{display:block;width:100%;border-radius:6px}
  .base{height:22px;margin:0 -50px;background:linear-gradient(#cfd8e2,#8d9aa8);border-radius:0 0 22px 22px;box-shadow:0 20px 40px -20px rgba(0,0,0,.8)}
  .phone{position:absolute;right:70px;top:215px;width:290px;background:#05090f;border-radius:44px;padding:12px;box-shadow:0 40px 80px -20px rgba(0,0,0,.75),0 0 0 2px #26313d inset}
  .phone img{display:block;width:100%;border-radius:33px}
  .chip{position:absolute;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.96);color:#0b1b2b;font-weight:800;font-size:22px;padding:10px 18px 10px 12px;border-radius:12px;box-shadow:0 14px 30px -12px rgba(0,0,0,.6)}
  .chip i{width:14px;height:14px;border-radius:50%;background:#2dd4bf;box-shadow:0 0 0 5px rgba(45,212,191,.25)}
  .tag{position:absolute;left:60px;top:28px;display:flex;align-items:center;gap:12px;color:#fff;font-weight:800;font-size:26px;letter-spacing:.18em}
  .tag small{font-weight:600;letter-spacing:.02em;opacity:.75;font-size:20px;margin-left:8px}
  </style></head><body>
  <svg class="net" viewBox="0 0 1400 900"><g stroke="rgba(45,212,191,.35)" stroke-width="2" fill="none">
    <path d="M220 850 C 500 760, 760 820, 1050 700"/><path d="M660 830 C 800 860, 900 870, 1000 860"/><path d="M1180 120 L 1350 210"/></g>
    <g fill="#2dd4bf"><circle cx="220" cy="850" r="7"/><circle cx="1050" cy="700" r="7"/><circle cx="1300" cy="860" r="6"/><circle cx="1180" cy="120" r="6"/><circle cx="1350" cy="210" r="6"/></g></svg>
  <div class="tag"><svg viewBox="0 0 64 64" width="40" height="40"><rect width="64" height="64" rx="14" fill="#fff"/><path d="M40 18V37C40 48 26 50 22 42" fill="none" stroke="#0B1B2B" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="22" cy="42" r="6" fill="#14B8A6"/><circle cx="40" cy="18" r="6" fill="#14B8A6"/></svg>JSOX<small>${L.tag}</small></div>
  <div class="laptop"><div class="screen"><img src="${dataUrl(join(tmp, `pos-${lang}.png`))}"></div><div class="base"></div></div>
  <div class="phone"><img src="${dataUrl(join(tmp, `wh-${lang}.png`))}"></div>
  <div class="chip" style="left:110px;top:760px"><i></i>${L.pos}</div>
  <div class="chip" style="right:60px;top:836px"><i></i>${L.wh}</div>
  <div class="chip" style="left:520px;top:800px"><i></i>${L.stock}</div>
  </body></html>`;
}

for (const lang of ['zh', 'en', 'ms']) {
  await screens(lang);
  writeFileSync(join(tmp, `scene-${lang}.html`), scene(lang));
  const s = await start({ viewport: { width: 1400, height: 900 } });
  await s.page.goto('file://' + join(tmp, `scene-${lang}.html`));
  await s.page.waitForTimeout(300);
  await s.page.screenshot({ path: join(root, 'web', 'img', `hero-${lang}.jpg`), type: 'jpeg', quality: 86 });
  await s.done();
  console.log('hero', lang);
}
rmSync(tmp, { recursive: true, force: true });
