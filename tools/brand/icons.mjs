/**
 * Draws every PNG of the brand from web/brand/*.svg: the website, POS and
 * warehouse icons (normal and "maskable", with room to be cropped to a
 * circle) and the picture shown when a link is shared.
 *
 *   node tools/brand/icons.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = join(here, '..', '..', 'web');
const req = createRequire(import.meta.url);
let pw;
try { pw = await import('playwright'); } catch { pw = req('/opt/node22/lib/node_modules/playwright'); }
const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const mark = readFileSync(join(WEB, 'brand', 'suxin-mark.svg'), 'utf8');
const word = readFileSync(join(WEB, 'brand', 'suxin-wordmark.svg'), 'utf8');
const tinted = (bg) => mark.replace('#0B1B2B', bg);
/** The mark alone, its background filling the square (for maskable icons the S sits in the middle 60%). */
const maskable = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/>
<g transform="translate(32 32) scale(.62) translate(-32 -32)"><path d="M42 20C38 14 22 14 22 23C22 31 42 31 42 40C42 49 26 50 22 44" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="22" cy="44" r="6" fill="#2DD4BF"/><circle cx="42" cy="20" r="6" fill="#2DD4BF"/></g></svg>`;

async function shoot(svg, size, out, { square = false } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body>`);
  await page.screenshot({ path: join(WEB, out), omitBackground: !square });
  await page.close();
}

for (const [prefix, bg] of [['icon', '#0B1B2B'], ['wh', '#12385A']]) {
  for (const size of [64, 192, 512]) await shoot(tinted(bg), size, `icons/${prefix}-${size}.png`);
  await shoot(maskable(bg), 512, `icons/${prefix}-512-maskable.png`, { square: true });
}
await shoot(tinted('#0F4C4A'), 512, 'brand/suxin-count-512.png');
await shoot(tinted('#0B1B2B'), 512, 'brand/suxin-mark-512.png');

// Link preview, 1200 x 630.
const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await og.setContent(`<body style="margin:0;width:1200px;height:630px;background:#0B1B2B;color:#E7EDF3;font-family:'Noto Sans','Noto Sans CJK SC',sans-serif;display:grid;align-content:center;padding:0 96px;box-sizing:border-box;gap:26px">
<div style="width:420px;color:#FFFFFF">${word}</div>
<div style="font-size:54px;font-weight:700;letter-spacing:-.5px">One Business. Connected.</div>
<div style="font-size:26px;color:#93A1B1">SuXin POS · SuXin Count · SuXin Warehouse · SuXin Cloud</div>
<div style="font-size:24px;color:#2DD4BF">收银 · 盘点 · 仓库 — Malaysia · Singapore</div></body>`);
await og.screenshot({ path: join(WEB, 'img', 'og-image.png') });
await browser.close();
console.log('brand images drawn');
