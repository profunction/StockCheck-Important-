/**
 * Builds the public pages from site/content.mjs into web/:
 *
 *   web/index.html, web/en/index.html, web/ms/index.html   one page per language
 *   web/404.html, web/sitemap.xml, web/robots.txt, web/llms.txt
 *
 * Plain static HTML with the CSS inline and no script: the fastest thing a
 * search engine or an AI assistant can fetch, and readable by both without
 * running anything. The POS itself lives at /pos/ and is kept out of search.
 *
 *   node site/build.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANS, TRIAL_DAYS, LIFETIME_SUPPORT_MONTHS } from '../platform/plans.mjs';
import { APP_DOWNLOAD, CONTACT, LANGS, POS_URL, SITE } from './content.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rm = (sen) => `RM${(sen / 100).toLocaleString('en-MY')}`;
const TODAY = new Date().toISOString().slice(0, 10);
const write = (rel, text) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

const PAID = ['STARTER', 'BUSINESS', 'UNLIMITED'];

const CSS = `
:root{--bg:#f6f8f5;--paper:#fff;--ink:#14201a;--muted:#55635a;--line:#d9e0d8;--brand:#0f5132;--brand-2:#1f7a4f;--soft:#e3f0e8;--accent:#c27a12;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#101612;--paper:#18201b;--ink:#e6ede7;--muted:#9fada4;--line:#2c3830;--brand:#5cc28e;--brand-2:#7fd3a8;--soft:#1c3226;--accent:#e9b04f;color-scheme:dark}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.7 system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif}
a{color:var(--brand)}img{max-width:100%;height:auto}
.wrap{max-width:1120px;margin:0 auto;padding-inline:20px}
header.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;gap:18px;min-height:60px;flex-wrap:wrap}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;color:var(--ink);text-decoration:none;font-size:18px}
.logo img{width:34px;height:34px;border-radius:8px}
nav.main{display:flex;gap:16px;flex-wrap:wrap;font-size:15px}nav.main a{color:var(--muted);text-decoration:none}nav.main a:hover{color:var(--ink)}
.spacer{flex:1}.langs{display:flex;gap:8px;font-size:14px}.langs a{color:var(--muted);text-decoration:none;padding:2px 6px;border-radius:6px}.langs a[aria-current]{background:var(--soft);color:var(--brand);font-weight:700}
.btn{display:inline-block;padding:12px 20px;border-radius:10px;font-weight:700;text-decoration:none;border:2px solid var(--brand)}
.btn.primary{background:var(--brand);color:#fff}.btn.ghost{color:var(--brand)}
@media (prefers-color-scheme:dark){.btn.primary{color:#0b1a12}}
.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:40px;align-items:center;padding-block:56px 40px}
.eyebrow{color:var(--brand);font-weight:700;font-size:14px;letter-spacing:.06em}
h1{font-size:clamp(30px,4.4vw,46px);line-height:1.2;margin:10px 0 16px;text-wrap:balance}
.lead{color:var(--muted);font-size:18px;max-width:58ch}
.ctas{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0 10px}.small{color:var(--muted);font-size:14px}
.shot{border-radius:14px;border:1px solid var(--line);box-shadow:0 20px 40px -24px rgba(0,0,0,.4);background:var(--paper)}
.facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding-block:8px 40px}
.facts div{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.facts b{display:block;font-size:24px;color:var(--brand)}.facts span{color:var(--muted);font-size:14px}
section{padding-block:48px;border-top:1px solid var(--line)}
h2{font-size:clamp(24px,3vw,32px);line-height:1.3;margin:0 0 20px;text-wrap:balance}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:16px 18px;min-width:0}
.card h3{margin:0 0 6px;font-size:17px}.card p{margin:0;color:var(--muted);font-size:15px}
ol.steps{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;counter-reset:s}
ol.steps li{counter-increment:s;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
ol.steps li::before{content:counter(s);display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--brand);color:#fff;font-weight:700;margin-bottom:8px}
@media (prefers-color-scheme:dark){ol.steps li::before{color:#0b1a12}}
ol.steps h3{margin:0 0 4px;font-size:17px}ol.steps p{margin:0;color:var(--muted);font-size:15px}
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.plan{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:20px}
.plan.mid{border:2px solid var(--brand)}.plan h3{margin:0}.plan .price{font-size:34px;font-weight:800;margin:6px 0 0}.plan .price small{font-size:15px;color:var(--muted);font-weight:500}
.plan ul{padding-left:18px;margin:10px 0 0;color:var(--muted);font-size:15px}
details{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin-bottom:10px}
summary{cursor:pointer;font-weight:700}details p{margin:8px 0 0;color:var(--muted)}
.final{text-align:center}.final .ctas{justify-content:center}
footer{border-top:1px solid var(--line);padding-block:28px;color:var(--muted);font-size:14px}
footer .wrap{display:flex;gap:16px;flex-wrap:wrap;justify-content:space-between}
@media (max-width:860px){.hero{grid-template-columns:minmax(0,1fr);padding-block:32px 24px}.facts{grid-template-columns:repeat(2,minmax(0,1fr))}nav.main{display:none}}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`;

function jsonLd(lang, t) {
  const url = SITE + t.path;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: 'Pos Stock Check',
      url: SITE + '/',
      logo: `${SITE}/icons/icon-512.png`,
      areaServed: 'MY',
      ...(CONTACT.email || CONTACT.whatsapp ? {
        contactPoint: [{
          '@type': 'ContactPoint', contactType: 'customer support', areaServed: 'MY',
          availableLanguage: ['zh', 'en', 'ms'],
          ...(CONTACT.email ? { email: CONTACT.email } : {}),
          ...(CONTACT.whatsapp ? { telephone: `+${CONTACT.whatsapp}` } : {}),
        }],
      } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Pos Stock Check',
      alternateName: ['Stock Check', 'Stock Check POS'],
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Android, Windows, macOS, ChromeOS, iPadOS (web)',
      inLanguage: ['zh', 'en', 'ms'],
      description: t.description,
      url,
      image: `${SITE}/img/pos-register.png`,
      publisher: { '@id': `${SITE}/#org` },
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'MYR',
        lowPrice: (PLANS.STARTER.monthlySen / 100).toFixed(2),
        highPrice: (PLANS.UNLIMITED.monthlySen / 100).toFixed(2),
        offerCount: PAID.length,
        offers: PAID.map((id) => ({
          '@type': 'Offer', name: PLANS[id].label, price: (PLANS[id].monthlySen / 100).toFixed(2), priceCurrency: 'MYR',
          priceSpecification: { '@type': 'UnitPriceSpecification', price: (PLANS[id].monthlySen / 100).toFixed(2), priceCurrency: 'MYR', unitCode: 'MON' },
        })),
      },
      featureList: t.features.map(([name]) => name),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: t.htmlLang,
      mainEntity: t.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
    {
      '@context': 'https://schema.org', '@type': 'WebSite', name: 'Pos Stock Check', url: SITE + '/', inLanguage: t.htmlLang,
    },
  ];
}

function page(lang) {
  const t = LANGS[lang];
  const shot = lang === 'en' ? '/img/pos-register-en.png' : '/img/pos-register.png';
  const url = SITE + t.path;
  const alternates = Object.values(LANGS).map((o) => `<link rel="alternate" hreflang="${o.htmlLang}" href="${SITE}${o.path}">`).join('\n');
  const plans = PAID.map((id, i) => {
    const p = PLANS[id];
    const seats = p.seats > 1e6 ? t.unlimitedUsers : `${p.seats} ${t.users}`;
    return `<div class="plan${i === 1 ? ' mid' : ''}"><h3>${esc(p.label)}</h3>
<p class="price">${rm(p.monthlySen)} <small>${esc(t.perMonth)}</small></p>
<ul><li>${esc(seats)}</li><li>${rm(p.yearlySen)} ${esc(t.perYear)}</li><li>${rm(p.lifetimeSen)} ${esc(t.lifetime)}</li></ul></div>`;
  }).join('\n');
  const contact = CONTACT.whatsapp || CONTACT.email
    ? `<section id="contact"><div class="wrap"><h2>${esc(t.contactTitle)}</h2><p>${[
      CONTACT.whatsapp ? `WhatsApp: <a href="https://wa.me/${esc(CONTACT.whatsapp)}">+${esc(CONTACT.whatsapp)}</a>` : '',
      CONTACT.email ? `Email: <a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a>` : '',
    ].filter(Boolean).join(' · ')}</p></div></section>`
    : '';

  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.description)}">
<link rel="canonical" href="${url}">
${alternates}
<link rel="alternate" hreflang="x-default" href="${SITE}/">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#0f5132">
<link rel="icon" type="image/png" href="/icons/icon-64.png">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Pos Stock Check">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/img/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${t.htmlLang.replace(/-Hans/, '').replace('-', '_')}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" as="image" href="${shot}">
${jsonLd(lang, t).map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
<style>${CSS.trim()}</style>
</head>
<body>
<header class="top"><div class="wrap">
<a class="logo" href="${t.path}"><img src="/icons/icon-192.png" alt="" width="34" height="34">Pos Stock Check</a>
<nav class="main" aria-label="${esc(t.langName)}"><a href="#features">${esc(t.nav.features)}</a><a href="#how">${esc(t.nav.how)}</a><a href="#pricing">${esc(t.nav.pricing)}</a><a href="#faq">${esc(t.nav.faq)}</a></nav>
<span class="spacer"></span>
<div class="langs">${Object.entries(LANGS).map(([k, o]) => `<a href="${o.path}" hreflang="${o.htmlLang}"${k === lang ? ' aria-current="page"' : ''}>${esc(o.label)}</a>`).join('')}</div>
<a class="btn ghost" href="/pos/" rel="nofollow">${esc(t.nav.open)}</a>
</div></header>
<main>
<div class="wrap hero">
<div>
<div class="eyebrow">${esc(t.hero.eyebrow)}</div>
<h1>${esc(t.hero.h1)}</h1>
<p class="lead">${esc(t.hero.lead)}</p>
<div class="ctas"><a class="btn primary" href="${APP_DOWNLOAD}">${esc(t.hero.cta)}</a><a class="btn ghost" href="/pos/" rel="nofollow">${esc(t.hero.cta2)}</a></div>
<p class="small">${esc(t.hero.note)}</p>
</div>
<img class="shot" src="${shot}" width="1366" height="800" alt="${esc(t.features[1][0])} — Pos Stock Check">
</div>
<div class="wrap facts">${t.facts.map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('')}</div>
<section id="features"><div class="wrap"><h2>${esc(t.featuresTitle)}</h2>
<div class="grid">${t.features.map(([h, p]) => `<article class="card"><h3>${esc(h)}</h3><p>${esc(p)}</p></article>`).join('\n')}</div></div></section>
<section id="for"><div class="wrap"><h2>${esc(t.forTitle)}</h2>
<div class="grid">${t.for.map(([h, p]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('\n')}</div></div></section>
<section id="how"><div class="wrap"><h2>${esc(t.howTitle)}</h2>
<ol class="steps">${t.how.map(([h, p]) => `<li><h3>${esc(h)}</h3><p>${esc(p)}</p></li>`).join('\n')}</ol></div></section>
<section id="pricing"><div class="wrap"><h2>${esc(t.pricingTitle)}</h2>
<div class="plans">${plans}</div>
<p class="small">${esc(t.pricingNote)}</p></div></section>
<section id="faq"><div class="wrap"><h2>${esc(t.faqTitle)}</h2>
${t.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}</div></section>
${contact}
<section class="final"><div class="wrap"><h2>${esc(t.finalTitle)}</h2><p class="lead" style="margin-inline:auto">${esc(t.finalLead)}</p>
<div class="ctas"><a class="btn primary" href="${APP_DOWNLOAD}">${esc(t.hero.cta)}</a></div></div></section>
</main>
<footer><div class="wrap"><span>© ${new Date().getFullYear()} Pos Stock Check · ${esc(t.footer)}</span><span>${Object.values(LANGS).map((o) => `<a href="${o.path}" hreflang="${o.htmlLang}">${esc(o.label)}</a>`).join(' · ')}</span></div></footer>
</body>
</html>
`;
}

function llms() {
  const en = LANGS.en;
  const zh = LANGS.zh;
  const plan = (id) => `- ${PLANS[id].label}: ${rm(PLANS[id].monthlySen)} per month, ${rm(PLANS[id].yearlySen)} per year, or ${rm(PLANS[id].lifetimeSen)} lifetime; ${PLANS[id].seats > 1e6 ? 'unlimited users' : `${PLANS[id].seats} users`}.`;
  return `# Pos Stock Check

> ${en.description}

Pos Stock Check is a stock-take and point-of-sale (POS) system for businesses in Malaysia: grocery shops, mini markets, supermarkets, warehouses, wholesalers, restaurants and cafés. It has two parts that share one database: the **Stock Check** Android app for counting stock by scanning barcodes, and the **Pos Stock Check** web cash register for selling at the counter. A sale at the till lowers the stock shown in the app immediately; a count in the app is seen by the back office immediately.

中文：${zh.description}

## Key facts
- Country: Malaysia. Currency: ringgit (MYR). Languages: Chinese, English, Malay.
- Free trial: ${TRIAL_DAYS} days, up to 5 users, no credit card.
${PAID.map(plan).join('\n')}
- Every plan includes both the stock-take app and the POS. Lifetime includes ${LIFETIME_SUPPORT_MONTHS} months of updates and support.
- Platforms: Stock Check app on Android; Pos Stock Check in Chrome on Windows, macOS, ChromeOS, Android tablets and iPad, installable as an app.
- Works offline: sales are kept on the device and sent when the connection returns.

## How stock is calculated
On hand = the last finished count + goods received since − sales and goods out since. Each count also shows how much was missing compared with what should have been there.

## Features
${en.features.map(([h, p]) => `- **${h}**: ${p}`).join('\n')}

## Malaysia-specific
- SST, with prices tax-inclusive or tax added on top.
- Cash rounded to the nearest 5 sen; card and DuitNow QR charged to the sen.
- Records DuitNow QR, card, e-wallet, cash and bank transfer payments (money goes through the shop's own terminals).

## Frequently asked questions
${en.faq.map(([q, a]) => `### ${q}\n${a}`).join('\n\n')}

## Links
- Website (中文): ${SITE}/
- Website (English): ${SITE}/en/
- Website (Bahasa Melayu): ${SITE}/ms/
- POS sign-in: ${POS_URL}
- Android app download: ${APP_DOWNLOAD}
${CONTACT.email ? `- Email: ${CONTACT.email}\n` : ''}${CONTACT.whatsapp ? `- WhatsApp: +${CONTACT.whatsapp}\n` : ''}`;
}

for (const lang of Object.keys(LANGS)) write(`${LANGS[lang].path.replace(/^\//, '')}index.html`, page(lang));

write('404.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found · Pos Stock Check</title><meta name="robots" content="noindex"><style>${CSS.trim()}</style></head><body><main class="wrap" style="padding-block:80px"><h1>404</h1><p class="lead">找不到这个页面 · Page not found · Halaman tidak dijumpai</p><p><a class="btn primary" href="/">Pos Stock Check</a></p></main></body></html>\n`);

write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${Object.values(LANGS).map((o) => `  <url>
    <loc>${SITE}${o.path}</loc>
    <lastmod>${TODAY}</lastmod>
${Object.values(LANGS).map((a) => `    <xhtml:link rel="alternate" hreflang="${a.htmlLang}" href="${SITE}${a.path}"/>`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>
  </url>`).join('\n')}
</urlset>
`);

write('robots.txt', `# Pos Stock Check
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
console.log('site built:', Object.values(LANGS).map((o) => o.path).join(' '), '+ 404, sitemap.xml, robots.txt, llms.txt');
