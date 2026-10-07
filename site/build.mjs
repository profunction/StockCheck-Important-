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
import { APP_DOWNLOAD, CONTACT, GUIDE_URL, LANGS, POS_URL, SITE, WAREHOUSE_URL } from './content.mjs';
import { INDUSTRY_IDS, PAGES } from './pages.mjs';
import { BRAND } from '../web/js/brand.js';

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
/** The language switcher in the top bar, kept short so the bar fits one line. */
const SHORT = { zh: '中文', en: 'EN', ms: 'BM' };

/** The header logo: the connected-N mark and the name, drawn inline. */
const LOGO = `<svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0B1B2B"/><path d="M20 44V20l24 24V20" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="44" r="6" fill="#2DD4BF"/><circle cx="44" cy="20" r="6" fill="#2DD4BF"/></svg><span>${BRAND.name}</span>`;

/** Line icons for the kinds of business (24-unit, stroke = currentColor). */
const ICONS = {
  retail: '<path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  fnb: '<path d="M7 3v8m-2-8v5a2 2 0 0 0 4 0V3M7 11v10"/><path d="M17 21V3c-2.2 1.2-3 3.5-3 6v4h3"/>',
  wholesale: '<path d="M3 9.5 12 4l9 5.5V20H3z"/><path d="M7 20v-6h10v6M7 17h10"/>',
  ecommerce: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M8 9h.01M12 9l4 0"/>',
};
const icon = (id) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[id] || ''}</svg>`;

const CSS = `
:root{--bg:#f5f7fa;--paper:#fff;--ink:#0b1b2b;--muted:#506070;--line:#dbe2ea;--brand:#0f766e;--brand-2:#12385a;--navy:#0b1b2b;--node:#2dd4bf;--soft:#e2f4f1;--accent:#b45309;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0a121b;--paper:#111b25;--ink:#e6edf3;--muted:#9aa8b6;--line:#243241;--brand:#2dd4bf;--brand-2:#7fb2dc;--navy:#060c12;--node:#2dd4bf;--soft:#12302e;--accent:#f0b35a;color-scheme:dark}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.7 system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif}
a{color:var(--brand)}img{max-width:100%;height:auto}
.wrap{max-width:1120px;margin:0 auto;padding-inline:20px}
header.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;gap:14px;min-height:64px;flex-wrap:wrap}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;color:var(--ink);text-decoration:none;font-size:18px}
.logo svg{width:34px;height:34px;flex:none}.logo span{letter-spacing:.14em;font-size:20px}
nav.main{display:flex;gap:14px;flex-wrap:wrap;font-size:15px;margin-left:8px}nav.main a{color:var(--muted);text-decoration:none}nav.main a:hover{color:var(--ink)}
.spacer{flex:1}.langs{display:flex;gap:8px;font-size:14px}.langs a{color:var(--muted);text-decoration:none;padding:2px 6px;border-radius:6px}.langs a[aria-current]{background:var(--soft);color:var(--brand);font-weight:700}
.btn{display:inline-block;padding:12px 20px;border-radius:8px;font-weight:700;text-decoration:none;border:2px solid var(--brand)}
.btn.primary{background:var(--brand);color:#fff}.btn.ghost{color:var(--brand)}
@media (prefers-color-scheme:dark){.btn.primary{color:#04201d}}
.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:40px;align-items:center;padding-block:56px 40px}
.eyebrow{color:var(--brand);font-weight:700;font-size:14px;letter-spacing:.06em;display:flex;align-items:center;gap:8px}.eyebrow svg{width:20px;height:20px}
h1{font-size:clamp(32px,4.8vw,52px);line-height:1.12;letter-spacing:-.02em;margin:10px 0 16px;text-wrap:balance}
.lead{color:var(--muted);font-size:18px;max-width:58ch}
.ctas{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0 10px}.small{color:var(--muted);font-size:14px}
.hero-img{border:0!important}.shot{border-radius:14px;border:1px solid var(--line);box-shadow:0 20px 40px -24px rgba(0,0,0,.4);background:var(--paper)}
.facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding-block:8px 40px}
.facts div{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.facts b{display:block;font-size:24px;color:var(--brand)}.facts span{color:var(--muted);font-size:14px}
section{padding-block:48px;border-top:1px solid var(--line)}
h2{font-size:clamp(24px,3vw,34px);line-height:1.25;letter-spacing:-.01em;margin:0 0 20px;text-wrap:balance}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:16px 18px;min-width:0}
.card h3{margin:0 0 6px;font-size:17px}.card p{margin:0;color:var(--muted);font-size:15px}
ol.steps{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;counter-reset:s}
ol.steps li{counter-increment:s;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
ol.steps li::before{content:counter(s);display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--brand);color:#fff;font-weight:700;margin-bottom:8px}
@media (prefers-color-scheme:dark){ol.steps li::before{color:#04201d}}
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
header.top .btn{padding:7px 14px;font-size:15px}
.hero h1{margin-bottom:4px}.hero .sub{font-size:clamp(20px,2.4vw,26px);line-height:1.4;font-weight:700;color:var(--brand);margin:0 0 14px}
.inds{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
a.ind{display:grid;gap:4px;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;text-decoration:none;color:var(--ink);transition:border-color .15s,transform .15s}
a.ind:hover{border-color:var(--brand);transform:translateY(-2px)}a.ind .em{width:40px;height:40px;border-radius:10px;display:grid;place-items:center;background:var(--soft);color:var(--brand)}a.ind .em svg{width:22px;height:22px}a.ind b{font-size:18px}a.ind span{color:var(--muted);font-size:15px}a.ind i{font-style:normal;color:var(--brand);font-weight:700;font-size:14px;margin-top:6px}
.prods{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.prod{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;display:grid;gap:8px;align-content:start;min-width:0}
.prod h3{margin:0;font-size:20px}.prod .kind{color:var(--muted);font-size:13px;font-weight:600;letter-spacing:.04em}.prod .line{margin:0;font-weight:600}
.prod ul{margin:0;padding-left:18px;color:var(--muted);font-size:15px}.prod .go{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}.prod .go a{font-weight:700;font-size:15px}
.addons{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.addon{background:var(--paper);border:1px dashed var(--line);border-radius:14px;padding:16px 18px;display:grid;gap:6px;align-content:start}
.addon b{font-size:17px}.addon .ask{margin:0;font-weight:600}.addon .what{margin:0;color:var(--muted);font-size:15px}
.st{justify-self:start;font-size:12px;font-weight:700;border-radius:99px;padding:1px 10px;background:var(--soft);color:var(--brand)}.st.soon{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)}
.soonnote{margin-top:14px;padding:12px 16px;border-radius:12px;border:1px dashed color-mix(in srgb,var(--accent) 55%,var(--line));color:var(--ink);background:color-mix(in srgb,var(--accent) 8%,var(--paper))}
.pts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
.crumb{font-size:14px;margin:18px 0 0}.crumb a{text-decoration:none}
.chips{display:flex;gap:8px;flex-wrap:wrap}.chips span{background:var(--soft);color:var(--brand);font-weight:700;border-radius:99px;padding:4px 12px;font-size:15px}
@media (max-width:1320px){nav.main a:first-child{display:none}}
@media (max-width:520px){header.top .btn.ghost{display:none}}
@media (max-width:860px){header.top{position:static}.langs a{padding:2px 4px}.hero{grid-template-columns:minmax(0,1fr);padding-block:32px 24px}.facts{grid-template-columns:repeat(2,minmax(0,1fr))}nav.main{display:none}}
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
      name: BRAND.name,
      alternateName: 'Pos Stock Check',
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
      name: BRAND.name,
      alternateName: [...Object.values(BRAND.products), 'Pos Stock Check', 'Stock Check'],
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
      '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND.name, alternateName: 'Pos Stock Check', url: SITE + '/', inLanguage: t.htmlLang,
    },
  ];
}

/** The top bar, the same on every public page. */
function navLinks(lang) {
  const t = LANGS[lang];
  const P = PAGES[lang];
  return `<nav class="main" aria-label="${esc(t.langName)}"><a href="${t.path}">${esc(P.nav.home)}</a><a href="${t.path}#industries">${esc(P.nav.industries)}</a><a href="${t.path}#products">${esc(P.nav.products)}</a><a href="${t.path}#addons">${esc(P.nav.addons)}</a><a href="${t.path}#pricing">${esc(P.nav.pricing)}</a><a href="/guide/">${esc(P.nav.guide)}</a></nav>
<span class="spacer"></span>
<div class="langs">${Object.entries(LANGS).map(([k, o]) => `<a href="${o.path}" hreflang="${o.htmlLang}" title="${esc(o.label)}"${k === lang ? ' aria-current="page"' : ''}>${esc(SHORT[k])}</a>`).join('')}</div>
<a class="btn ghost" href="/pos/" rel="nofollow">${esc(P.nav.login)}</a>
<a class="btn primary" href="${APP_DOWNLOAD}">${esc(P.nav.trial)}</a>`;
}

/** Where each product's button goes. */
function productLinks(lang, id, here = '') {
  const t = LANGS[lang];
  const P = PAGES[lang];
  const x = P.products[id];
  // On the page a button would lead to, it leads to the video guide instead.
  if (id === 'warehouse' && here === 'wholesale') return `<a href="/guide/#warehouse">${esc(P.nav.guide)} →</a>`;
  if (id === 'stocktake') return `<a href="${APP_DOWNLOAD}">${esc(x.cta)} →</a>`;
  if (id === 'pos') return `<a href="${t.path}retail/">${esc(x.cta)} →</a><a href="${t.path}fnb/">${esc(x.cta2)} →</a>`;
  if (id === 'warehouse') return `<a href="${t.path}wholesale/">${esc(x.cta)} →</a>`;
  return `<a href="/pos/" rel="nofollow">${esc(x.cta)} →</a>`;
}

function productCards(lang, ids = ['stocktake', 'pos', 'warehouse', 'backoffice'], here = '') {
  const P = PAGES[lang];
  return ids.map((id) => { const x = P.products[id]; return `<article class="prod"><span class="kind">${esc(x.kind)}</span><h3>${esc(x.name)}</h3><p class="line">${esc(x.line)}</p>
<ul>${x.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul><div class="go">${productLinks(lang, id, here)}</div></article>`; }).join('\n');
}

function addonCards(lang) {
  const P = PAGES[lang];
  return P.addons.map((a) => `<div class="addon"><b>${esc(a.name)}</b><span class="st${a.state === 'soon' ? ' soon' : ''}">${esc(P.state[a.state])}</span><p class="ask">${esc(a.ask)}</p><p class="what">${esc(a.what)}</p></div>`).join('\n');
}

function page(lang) {
  const t = LANGS[lang];
  const P = PAGES[lang];
  const shot = `/img/hero-${lang}.jpg`;
  const url = SITE + t.path;
  const alternates = Object.values(LANGS).map((o) => `<link rel="alternate" hreflang="${o.htmlLang}" href="${SITE}${o.path}">`).join('\n');
  const plans = PAID.map((id, i) => {
    const p = PLANS[id];
    const seats = p.seats > 1e6 ? t.unlimitedUsers : `${p.seats} ${t.users}`;
    return `<div class="plan${i === 1 ? ' mid' : ''}"><h3>${esc(p.label)}</h3>
<p class="price">${rm(p.monthlySen)} <small>${esc(t.perMonth)}</small></p>
<ul><li>${esc(seats)}</li><li>${rm(p.yearlySen)} ${esc(t.perYear)}</li><li>${rm(p.lifetimeSen)} ${esc(t.lifetime)}</li></ul></div>`;
  }).join('\n');
  const standalone = t.standalone ? `<h3 style="margin-top:28px">${esc(t.standaloneTitle)}</h3>
<div class="plans">${Object.entries(t.standalone).map(([id, what]) => `<div class="plan"><h3>${esc(PLANS[id].label)}</h3>
<p class="price">${rm(PLANS[id].monthlySen)} <small>${esc(t.perMonth)}</small></p>
<ul><li>${esc(what)}</li><li>${rm(PLANS[id].yearlySen)} ${esc(t.perYear)}</li></ul></div>`).join('\n')}</div>` : '';
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
<meta name="theme-color" content="#0b1b2b">
<link rel="icon" type="image/png" href="/icons/icon-64.png">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${BRAND.name}">
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
<a class="logo" href="${t.path}" aria-label="${BRAND.name}">${LOGO}</a>
${navLinks(lang)}
</div></header>
<main>
<div class="wrap hero">
<div>
<div class="eyebrow">${esc(P.hero.eyebrow)}</div>
<h1>${esc(P.hero.h1)}</h1>
<p class="sub">${esc(P.hero.sub)}</p>
<p class="lead">${esc(P.hero.lead)}</p>
<div class="ctas"><a class="btn primary" href="${APP_DOWNLOAD}">${esc(P.hero.cta)}</a><a class="btn ghost" href="#products">${esc(P.hero.cta2)}</a></div>
<p class="small">${esc(P.hero.note)}</p>
</div>
<img class="shot hero-img" src="${shot}" width="1400" height="900" alt="${esc(P.products.pos.name)} · ${esc(P.products.warehouse.name)}">
</div>
<div class="wrap facts">${t.facts.map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('')}</div>
<section id="industries"><div class="wrap"><h2>${esc(P.industriesTitle)}</h2><p class="lead" style="margin:-8px 0 20px">${esc(P.industriesLead)}</p>
<div class="inds">${INDUSTRY_IDS.map((id) => { const x = P.industries[id]; return `<a class="ind" href="${t.path}${id}/"><span class="em" aria-hidden="true">${icon(x.icon)}</span><b>${esc(x.name)}</b><span>${esc(x.short)}</span><i>${esc(P.see)}</i></a>`; }).join('\n')}</div></div></section>
<section id="products"><div class="wrap"><h2>${esc(P.productsTitle)}</h2>
<div class="prods">${productCards(lang)}</div></div></section>
<section id="addons"><div class="wrap"><h2>${esc(P.addonsTitle)}</h2><p class="lead" style="margin:-8px 0 20px">${esc(P.addonsLead)}</p>
<div class="addons">${addonCards(lang)}</div></div></section>
<section id="how"><div class="wrap"><h2>${esc(t.howTitle)}</h2>
<ol class="steps">${t.how.map(([h, p]) => `<li><h3>${esc(h)}</h3><p>${esc(p)}</p></li>`).join('\n')}</ol></div></section>
<section id="pricing"><div class="wrap"><h2>${esc(t.pricingTitle)}</h2>
<div class="plans">${plans}</div>
${standalone}
<p class="small">${esc(t.pricingNote)}</p></div></section>
<section id="faq"><div class="wrap"><h2>${esc(t.faqTitle)}</h2>
${t.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}</div></section>
${contact}
<section class="final"><div class="wrap"><h2>${esc(t.finalTitle)}</h2><p class="lead" style="margin-inline:auto">${esc(t.finalLead)}</p>
<div class="ctas"><a class="btn primary" href="${APP_DOWNLOAD}">${esc(t.hero.cta)}</a></div></div></section>
</main>
<footer><div class="wrap"><span>© ${new Date().getFullYear()} ${BRAND.name} · ${esc(BRAND.tagline)} · ${esc(t.footer)}</span><span>${Object.values(LANGS).map((o) => `<a href="${o.path}" hreflang="${o.htmlLang}">${esc(o.label)}</a>`).join(' · ')}</span></div></footer>
</body>
</html>
`;
}

/** One page per kind of business: only what that business needs. */
function industryPage(lang, id) {
  const t = LANGS[lang];
  const P = PAGES[lang];
  const x = P.industries[id];
  const url = `${SITE}${t.path}${id}/`;
  const title = `${x.h1} · ${BRAND.name}`;
  const alternates = Object.values(LANGS).map((o) => `<link rel="alternate" hreflang="${o.htmlLang}" href="${SITE}${o.path}${id}/">`).join('\n');
  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(x.lead)}">
<link rel="canonical" href="${url}">
${alternates}
<link rel="alternate" hreflang="x-default" href="${SITE}/${id}/">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#0b1b2b">
<link rel="icon" type="image/png" href="/icons/icon-64.png">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(x.lead)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/img/og-image.png">
<style>${CSS.trim()}</style>
</head>
<body>
<header class="top"><div class="wrap">
<a class="logo" href="${t.path}" aria-label="${BRAND.name}">${LOGO}</a>
${navLinks(lang)}
</div></header>
<main>
<div class="wrap"><p class="crumb"><a href="${t.path}">← ${esc(P.back)}</a> · <a href="${t.path}#industries">${esc(P.nav.industries)}</a></p></div>
<div class="wrap hero" style="grid-template-columns:minmax(0,1fr)">
<div>
<div class="eyebrow">${icon(x.icon)} ${esc(x.name)}</div>
<h1>${esc(x.h1)}</h1>
<p class="lead">${esc(x.lead)}</p>
<div class="ctas"><a class="btn primary" href="${APP_DOWNLOAD}">${esc(P.ctaPage)}</a><a class="btn ghost" href="${t.path}#pricing">${esc(P.ctaTalk)}</a></div>
</div>
</div>
<section><div class="wrap">
<div class="pts">${x.points.map(([h, p]) => `<article class="card"><h3>${esc(h)}</h3><p>${esc(p)}</p></article>`).join('\n')}</div>
${x.soon ? `<p class="soonnote">${esc(x.soon)}</p>` : ''}
</div></section>
<section><div class="wrap"><h2>${esc(P.usesTitle)}</h2>
<div class="prods">${productCards(lang, x.products, id)}</div></div></section>
<section><div class="wrap"><h2>${esc(P.planTitle)}</h2><p class="lead">${esc(x.plan)}</p>
<div class="ctas"><a class="btn primary" href="${APP_DOWNLOAD}">${esc(P.ctaPage)}</a><a class="btn ghost" href="${t.path}#pricing">${esc(P.ctaTalk)}</a></div></div></section>
</main>
<footer><div class="wrap"><span>© ${new Date().getFullYear()} ${BRAND.name} · ${esc(BRAND.tagline)} · ${esc(t.footer)}</span><span>${Object.values(LANGS).map((o) => `<a href="${o.path}${id}/" hreflang="${o.htmlLang}">${esc(o.label)}</a>`).join(' · ')}</span></div></footer>
</body>
</html>
`;
}

function llms() {
  const en = LANGS.en;
  const zh = LANGS.zh;
  const plan = (id) => `- ${PLANS[id].label}: ${rm(PLANS[id].monthlySen)} per month, ${rm(PLANS[id].yearlySen)} per year, or ${rm(PLANS[id].lifetimeSen)} lifetime; ${PLANS[id].seats > 1e6 ? 'unlimited users' : `${PLANS[id].seats} users`}.`;
  return `# ${BRAND.name} — ${BRAND.tagline}

> ${en.description}

${BRAND.name} is a business system for Malaysia: grocery shops, mini markets, supermarkets, warehouses, wholesalers, restaurants and cafés. Its products share one database: **NEXO Count**, the Android app for counting stock by scanning barcodes; **NEXO POS**, the web cash register for the counter; **NEXO Warehouse** for receiving, transfers and purchase orders; and **NEXO Cloud**, the owner's back office. NEXO was previously called Pos Stock Check (the POS) and Stock Check (the app). A sale at the till lowers the stock shown in the app immediately; a count in the app is seen by the back office immediately.

中文：${zh.description}

## Key facts
- Country: Malaysia. Currency: ringgit (MYR). Languages: Chinese, English, Malay.
- Free trial: ${TRIAL_DAYS} days, up to 5 users, no credit card.
${PAID.map(plan).join('\n')}
${['APP_ONLY', 'POS_ONLY', 'API_ONLY'].map((id) => `- ${PLANS[id].label} (standalone): ${rm(PLANS[id].monthlySen)} per month or ${rm(PLANS[id].yearlySen)} per year; ${en.standalone[id]}.`).join('\n')}
- Lifetime licences are limited to 50 in total.
- Every All-in-One plan includes the stock-take app, the POS and the warehouse system. Lifetime includes ${LIFETIME_SUPPORT_MONTHS} months of updates and support.
- Platforms: NEXO Count on Android; NEXO POS, NEXO Warehouse and NEXO Cloud in Chrome on Windows, macOS, ChromeOS, Android tablets and iPad, installable as an app.
- Works offline: sales are kept on the device and sent when the connection returns.

## How stock is calculated
On hand = the last finished count + goods received since − sales and goods out since. Each count also shows how much was missing compared with what should have been there.

## Features
${en.features.map(([h, p]) => `- **${h}**: ${p}`).join('\n')}

## The four products (one shared stock)
${Object.values(PAGES.en.products).map((x) => `- **${x.name}** (${x.kind}): ${x.line} ${x.points.join('; ')}.`).join('\n')}

Chinese names: 盘点通 (NEXO Count), 收银通 (NEXO POS), 仓管通 (NEXO Warehouse), 云后台 (NEXO Cloud).

## By kind of business
${INDUSTRY_IDS.map((id) => { const x = PAGES.en.industries[id]; return `- [${x.name}](${SITE}/en/${id}/): ${x.lead}${x.soon ? ` (${x.soon})` : ''}`; }).join('\n')}

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
- Warehouse system (web, works on phones): ${WAREHOUSE_URL}
- Step-by-step guides with videos: ${GUIDE_URL}
${CONTACT.email ? `- Email: ${CONTACT.email}\n` : ''}${CONTACT.whatsapp ? `- WhatsApp: +${CONTACT.whatsapp}\n` : ''}`;
}

for (const lang of Object.keys(LANGS)) {
  write(`${LANGS[lang].path.replace(/^\//, '')}index.html`, page(lang));
  for (const id of INDUSTRY_IDS) write(`${LANGS[lang].path.replace(/^\//, '')}${id}/index.html`, industryPage(lang, id));
}

write('404.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found · ${BRAND.name}</title><meta name="robots" content="noindex"><style>${CSS.trim()}</style></head><body><main class="wrap" style="padding-block:80px"><h1>404</h1><p class="lead">找不到这个页面 · Page not found · Halaman tidak dijumpai</p><p><a class="btn primary" href="/">${BRAND.name}</a></p></main></body></html>\n`);

const PATHS = ['', ...INDUSTRY_IDS.map((id) => `${id}/`)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PATHS.flatMap((rest) => Object.values(LANGS).map((o) => `  <url>
    <loc>${SITE}${o.path}${rest}</loc>
    <lastmod>${TODAY}</lastmod>
${Object.values(LANGS).map((a) => `    <xhtml:link rel="alternate" hreflang="${a.htmlLang}" href="${SITE}${a.path}${rest}"/>`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/${rest}"/>
  </url>`)).join('\n')}
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
console.log('site built:', Object.values(LANGS).map((o) => o.path).join(' '), '+ 404, sitemap.xml, robots.txt, llms.txt');
