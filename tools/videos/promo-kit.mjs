/**
 * What the marketing films share (promo-long.mjs, promo-ad.mjs): the shop
 * they are filmed in, the QR-ordering API run on its data, full-screen
 * punch cards, the Telegram card, and the phone-frame styles.
 */
import { item, world } from './world.mjs';
import { selfOrdering } from '../../api/selforder.mjs';

export const SITE = 'stockcheck-fb58e.web.app';
/** Where people ask for the free trial: the owner's WhatsApp. */
export const WA = { show: '+65 8926 3660', link: 'wa.me/6589263660' };
export const PHONE = { width: 540, height: 960 };
export const W = 'workspaces/w1/';
export const DAY = 86_400_000;
export const CODE = 'PromoQr2026AB';
export const NAVY = 'linear-gradient(160deg,#0b1b2b,#12385a 60%,#0f4c4a)';
export const RED = 'linear-gradient(160deg,#5a0d16,#b3122a 70%,#e8473b)';
export const TEAL = 'linear-gradient(160deg,#063c3a,#0b7a6f 60%,#2fd3b9)';
export const GOLD = 'linear-gradient(160deg,#3d2a00,#a86b00 60%,#ffc233)';

/** The shop: a supermarket at Ipoh, QR ordering on, milk running out of date. */
export function shop() {
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
export function memDb(seed) {
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

export const fx = (page) => page.evaluate((css) => { if (!document.getElementById('pk-style')) { const s = document.createElement('style'); s.id = 'pk-style'; s.textContent = css; document.head.append(s); } }, FX);

/** A full-screen punch card: big words, a colour, a shake for bad news. */
export async function punch(page, x, html, { bg = NAVY, ms = 1600, shake = false, say = '', en = '', bm = false } = {}) {
  await fx(page);
  // On a Malay film the words are Malay: spoken as Malay too.
  x.cue(say || html, en, 0, bm ? (say || html) : '');
  await page.evaluate(([h, b, s]) => {
    document.getElementById('pk')?.remove();
    const d = document.createElement('div'); d.id = 'pk'; d.style.background = b; if (s) d.className = 'shake';
    d.innerHTML = `<div>${h}</div>`; document.body.append(d);
    const cap = document.getElementById('demo-cap'); if (cap) cap.innerHTML = '';
    const cur = document.getElementById('demo-cursor'); if (cur) cur.style.display = 'none';
  }, [html, bg, shake]);
  await x.wait(ms);
}
export const unpunch = (page) => page.evaluate(() => document.getElementById('pk')?.remove());

/** A Telegram chat with the morning report in it. */
export async function telegramCard(page, x, text, ms) {
  await fx(page);
  await page.evaluate((t) => {
    document.getElementById('tg')?.remove();
    const d = document.createElement('div'); d.id = 'tg';
    d.innerHTML = '<div class="bar"><i>S</i><div>JSOX Bot<div style="font-size:12px;font-weight:500;opacity:.6">bot</div></div></div><div class="msg"></div>';
    d.querySelector('.msg').textContent = t;
    const time = document.createElement('div'); time.className = 'time'; time.textContent = '08:00 ✓✓'; d.querySelector('.msg').append(time);
    document.body.append(d);
  }, text);
  await x.wait(ms);
  await page.evaluate(() => document.getElementById('tg')?.remove());
}

/** Smaller captions on a phone-shaped frame, and the punch cards to fit. */
export const phoneStyle = (page) => page.addStyleTag({ content: `
  #demo-cap{font-size:20px!important;padding:9px 16px!important;bottom:18px!important;max-width:94%!important}
  #demo-cap small{font-size:14px!important}
  #pk{font-size:50px!important}` });

/** The first frame is already the hook's colour: no white loading screen. */
export const prep = async (page) => {
  // The blank page before the first one loads is already that colour too.
  await page.setContent('<body style="margin:0;background:#b3122a"></body>');
  await cover(page);
};
const cover = (page) => page.addInitScript((bg) => {
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


/** Customers' QR orders answered here, from [db] (memDb), on [page]. */
export async function routeOrders(page, db) {
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
}

/** The screenshot-reading service, answering with the order on the screenshot. */
export const routeReadOrder = (page) => page.route(/\/app\/read-order$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
  platform: 'pdd', orderNo: '240915-582013947761', trackingNo: 'YT7491234567890', currency: 'CNY', shippingCents: 1000, totalCents: 23800,
  lines: [{ title: '泰国香米 5kg 批发', variation: '5kg', qty: 4, priceCents: 3000 }, { title: '马来西亚咖啡粉 500g', variation: '500g', qty: 6, priceCents: 1800 }],
}) }));
