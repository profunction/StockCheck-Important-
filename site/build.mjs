/**
 * What the public site needs beside its pages: the 404 page, sitemap.xml,
 * robots.txt and llms.txt (a plain summary for AI assistants).
 *
 * The pages themselves are web/index.html and web/products/<slug>/, made
 * by site/www/ (see its README): one page in three languages, switched in
 * the browser. /en/, /ms/ and the old industry pages redirect there
 * (firebase.json).
 *
 *   node site/build.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANS, TRIAL_DAYS, LIFETIME_SUPPORT_MONTHS } from '../platform/plans.mjs';
import { APP_DOWNLOAD, CONTACT, GUIDE_URL, LANGS, POS_URL, SITE, WAREHOUSE_URL } from './content.mjs';
import { INDUSTRY_IDS, PAGES } from './pages.mjs';
import { BRAND } from '../web/js/brand.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const rm = (sen) => `RM${(sen / 100).toLocaleString('en-MY')}`;
const TODAY = new Date().toISOString().slice(0, 10);
const write = (rel, text) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

const PAID = ['STARTER', 'BUSINESS', 'UNLIMITED'];
export const PRODUCT_PAGES = [['pos', 'SuXin POS'], ['barcode-scan', 'SuXin Barcode Scan'], ['wms', 'SuXin WMS'], ['every-data', 'SuXin Every Data'], ['books', 'SuXin Books']];

function llms() {
  const en = LANGS.en;
  const zh = LANGS.zh;
  const plan = (id) => `- ${PLANS[id].label}: ${rm(PLANS[id].monthlySen)} per month, ${rm(PLANS[id].yearlySen)} per year, or ${rm(PLANS[id].lifetimeSen)} lifetime; ${PLANS[id].seats > 1e6 ? 'unlimited users' : `${PLANS[id].seats} users`}.`;
  return `# ${BRAND.name} — ${BRAND.tagline}

> ${en.description}

${BRAND.name} is a business system for Malaysia: grocery shops, mini markets, supermarkets, warehouses, wholesalers, restaurants and cafés. Its products share one database: **SuXin Barcode Scan**, the Android app for counting stock by scanning barcodes; **SuXin POS**, the web cash register for the counter; **SuXin WMS** for receiving, transfers and purchase orders; **SuXin Every Data**, the owner's back office; and **SuXin Books**, e-invoices (LHDN MyInvois) and the company's accounts. SuXin was previously called Pos Stock Check (the POS) and Stock Check (the app). A sale at the till lowers the stock shown in the app immediately; a count in the app is seen by the back office immediately.

中文：${zh.description}

## Key facts
- Country: Malaysia. Currency: ringgit (MYR). Languages: Chinese, English, Malay.
- Free trial: ${TRIAL_DAYS} days, up to 5 users, no credit card.
${PAID.map(plan).join('\n')}
${['APP_ONLY', 'POS_ONLY', 'API_ONLY'].map((id) => `- ${PLANS[id].label} (standalone): ${rm(PLANS[id].monthlySen)} per month or ${rm(PLANS[id].yearlySen)} per year; ${en.standalone[id]}.`).join('\n')}
- Lifetime licences are limited to 50 in total.
- Every All-in-One plan includes the stock-take app, the POS and the warehouse system. Lifetime includes ${LIFETIME_SUPPORT_MONTHS} months of updates and support.
- Platforms: SuXin Barcode Scan on Android; SuXin POS, SuXin WMS and SuXin Every Data in Chrome on Windows, macOS, ChromeOS, Android tablets and iPad, installable as an app.
- Works offline: sales are kept on the device and sent when the connection returns.

## How stock is calculated
On hand = the last finished count + goods received since − sales and goods out since. Each count also shows how much was missing compared with what should have been there.

## Features
${en.features.map(([h, p]) => `- **${h}**: ${p}`).join('\n')}

## The four products (one shared stock)
${Object.values(PAGES.en.products).map((x) => `- **${x.name}** (${x.kind}): ${x.line} ${x.points.join('; ')}.`).join('\n')}

Chinese names: 盘点通 (SuXin Barcode Scan), 收银通 (SuXin POS), 仓管通 (SuXin WMS), 老板数据 (SuXin Every Data).

## By kind of business
${INDUSTRY_IDS.map((id) => { const x = PAGES.en.industries[id]; return `- [${x.name}](${SITE}/#built-for): ${x.lead}${x.soon ? ` (${x.soon})` : ''}`; }).join('\n')}

## Malaysia-specific
- SST, with prices tax-inclusive or tax added on top.
- Cash rounded to the nearest 5 sen; card and DuitNow QR charged to the sen.
- Records DuitNow QR, card, e-wallet, cash and bank transfer payments (money goes through the shop's own terminals).

## Frequently asked questions
${en.faq.map(([q, a]) => `### ${q}\n${a}`).join('\n\n')}

## Links
- Website (中文): ${SITE}/?lang=zh
- Website (English): ${SITE}/?lang=en
- Website (Bahasa Melayu): ${SITE}/?lang=ms
${PRODUCT_PAGES.map(([slug, name]) => `- ${name}: ${SITE}/products/${slug}/`).join('\n')}
- Sign in or sign up (all apps): ${SITE}/app/
- SuXin Barcode Scan on the web: ${SITE}/count/
- POS sign-in: ${POS_URL}
- Android app download: ${APP_DOWNLOAD}
- Warehouse system (web, works on phones): ${WAREHOUSE_URL}
- Step-by-step guides with videos: ${GUIDE_URL}
${CONTACT.email ? `- Email: ${CONTACT.email}\n` : ''}${CONTACT.whatsapp ? `- WhatsApp: +${CONTACT.whatsapp}\n` : ''}`;
}

write('404.html', `<!DOCTYPE html>
<html lang="zh-Hans" data-default-theme="dark">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>404 · ${BRAND.name}</title>
<meta name="robots" content="noindex"/>
<link rel="icon" type="image/svg+xml" href="/assets/brand/suxin-mark.svg?v=4"/>
<script src="/assets/theme.js"></script>
<link rel="stylesheet" href="/assets/site.css"/>
<link rel="stylesheet" href="/assets/suxin.css"/>
</head>
<body>
<div class="site"><main class="sec grid-bg" style="min-height:100dvh;display:grid;place-items:center">
  <div class="wrap stack" style="text-align:center">
    <span class="eyebrow no-rule">404</span>
    <h1 class="h1">找不到这个页面</h1>
    <p class="lead">Page not found · Halaman tidak dijumpai</p>
    <p><a class="btn btn-primary btn-lg" href="/">${BRAND.name}</a></p>
  </div>
</main></div>
</body>
</html>
`);

const PATHS = ['', ...PRODUCT_PAGES.map(([slug]) => `products/${slug}/`)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PATHS.map((rest) => `  <url>
    <loc>${SITE}/${rest}</loc>
    <lastmod>${TODAY}</lastmod>
  </url>`).join('\n')}
</urlset>
`);

write('robots.txt', `# ${BRAND.name}
# Everything public may be read and quoted, by search engines and AI
# assistants alike. The POS itself is a signed-in tool and has nothing to index.
User-agent: *
Allow: /
Disallow: /pos/
Disallow: /warehouse/

User-agent: GPTBot
Allow: /
Disallow: /pos/
Disallow: /warehouse/

User-agent: OAI-SearchBot
Allow: /
Disallow: /pos/
Disallow: /warehouse/

User-agent: ClaudeBot
Allow: /
Disallow: /pos/
Disallow: /warehouse/

User-agent: PerplexityBot
Allow: /
Disallow: /pos/
Disallow: /warehouse/

User-agent: Google-Extended
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);

write('llms.txt', llms());
console.log('site built: 404, sitemap.xml, robots.txt, llms.txt');
