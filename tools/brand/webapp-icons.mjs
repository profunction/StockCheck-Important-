/**
 * Launcher icons for the website's Android apps (webapps/): the S on each
 * app's colour, with a badge saying which app it is.
 *
 *   node tools/brand/webapp-icons.mjs
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const RES = join(here, '..', '..', 'webapps', 'src');
const req = createRequire(import.meta.url);
let pw;
try { pw = await import('playwright'); } catch { pw = req('/opt/node22/lib/node_modules/playwright'); }
const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const GLYPH = {
  apps: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 11.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L22 7H6"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
};
const APPS = [['hub', '#0B1B2B', 'apps'], ['pos', '#B45309', 'cart'], ['warehouse', '#12385A', 'box'], ['cloud', '#0F766E', 'chart']];
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

const icon = (bg, glyph) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect x="2" y="2" width="60" height="60" rx="14" fill="${bg}"/>
<g transform="translate(-6 -1)"><path d="M42 20C38 14 22 14 22 23C22 31 42 31 42 40C42 49 26 50 22 44" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="22" cy="44" r="5" fill="#2DD4BF"/><circle cx="42" cy="20" r="5" fill="#2DD4BF"/></g>
<circle cx="48" cy="48" r="13" fill="#fff"/>
<g transform="translate(39.5 39.5) scale(.71)" fill="none" stroke="${bg}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${GLYPH[glyph]}</g></svg>`;

for (const [id, bg, glyph] of APPS) {
  for (const [density, size] of Object.entries(SIZES)) {
    const dir = join(RES, id, 'res', `mipmap-${density}`);
    mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0;background:transparent">${icon(bg, glyph).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
    await page.screenshot({ path: join(dir, 'ic_launcher.png'), omitBackground: true });
    await page.close();
  }
}
await browser.close();
console.log('webapp icons drawn');
