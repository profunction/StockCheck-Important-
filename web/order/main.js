/**
 * Ordering by QR code, on the customer's phone (扫码点餐).
 *
 *   /order/?s=<shop code>&t=<table>    the code printed on a table
 *   /order/?s=<shop code>              the counter's code: takeaway, or pick a table
 *
 * No account and no app: the menu and the sending go through the SuXin API
 * (api/selforder.mjs), which prices everything from the shop's own items.
 * The order waits at the till until the staff accept it; this page then
 * follows it -- accepted, ready to collect, done -- and remembers it on this
 * phone, so closing the page loses nothing.
 */
import { h, mount } from '../js/dom.js';
import { billTotals, formatSen } from '../js/money.js';
import { API_ORIGIN } from '../js/apiorigin.js';

// ------------------------------------------------------------------ words

const WORDS = {
  zh: {
    loading: '正在打开菜单…', badCode: '这个二维码不对', badCodeHint: '请扫桌上或柜台的二维码，或问店员。', offline: '连不上网络，请再试一次。', retry: '再试一次',
    eatHere: '在这里吃', takeAway: '外带', howEat: '在这里吃，还是外带？', whichTable: '你坐哪一桌？', table: '桌', change: '改',
    search: '找食物或饮料…', all: '全部', noMatch: '找不到。', add: '加入', basket: '看我点的', items: '样',
    choose: '必选', chooseMany: '可以选几样', note: '备注（例如：少辣、不要葱）', orderNote: '整张单的备注', yourName: '你的名字（取餐时叫）',
    subtotal: '小计', service: '服务费', tax: '税', total: '总共', payAtCounter: '先点，吃完或取餐时在柜台付钱。价钱以柜台为准。',
    send: '送出订单', sending: '送出中…', needOption: '请选', remove: '删除',
    sent: '订单已送出', waiting: '等店家接单', accepted: '店家已接单，正在准备', ready: '好了！请到柜台取餐', readyTable: '好了，马上送到你的桌', done: '完成，谢谢光临！', rejected: '店家没有接这张单',
    pickupNo: '取餐号', yourTable: '你的桌号', stepSent: '已送出', stepMaking: '准备中', stepReady: '好了',
    orderMore: '再点一些', myOrders: '我刚才的订单', closed: '这间店现在没有开放扫码点餐。', tooMany: '点太多次了，请等一下再试。',
  },
  en: {
    loading: 'Opening the menu…', badCode: 'This QR code is not right', badCodeHint: 'Scan the code on your table or at the counter, or ask the staff.', offline: 'No connection. Please try again.', retry: 'Try again',
    eatHere: 'Eat here', takeAway: 'Take away', howEat: 'Eating here or taking away?', whichTable: 'Which table are you at?', table: 'Table', change: 'Change',
    search: 'Search food or drinks…', all: 'All', noMatch: 'Nothing found.', add: 'Add', basket: 'View my order', items: 'items',
    choose: 'required', chooseMany: 'choose any', note: 'Note (e.g. less spicy, no onion)', orderNote: 'Note for the whole order', yourName: 'Your name (we call it when ready)',
    subtotal: 'Subtotal', service: 'Service charge', tax: 'Tax', total: 'Total', payAtCounter: 'Order now, pay at the counter. The counter\'s price is final.',
    send: 'Send order', sending: 'Sending…', needOption: 'Please choose', remove: 'Remove',
    sent: 'Order sent', waiting: 'Waiting for the shop to accept', accepted: 'Accepted — being prepared', ready: 'Ready! Collect it at the counter', readyTable: 'Ready — coming to your table', done: 'Done. Thank you!', rejected: 'The shop did not accept this order',
    pickupNo: 'Pickup number', yourTable: 'Your table', stepSent: 'Sent', stepMaking: 'Preparing', stepReady: 'Ready',
    orderMore: 'Order more', myOrders: 'My orders just now', closed: 'This shop is not taking QR orders right now.', tooMany: 'Too many orders. Please wait a moment.',
  },
  ms: {
    loading: 'Membuka menu…', badCode: 'Kod QR ini tidak betul', badCodeHint: 'Imbas kod di meja atau kaunter, atau tanya pekerja.', offline: 'Tiada sambungan. Cuba lagi.', retry: 'Cuba lagi',
    eatHere: 'Makan sini', takeAway: 'Bungkus', howEat: 'Makan sini atau bungkus?', whichTable: 'Meja nombor berapa?', table: 'Meja', change: 'Tukar',
    search: 'Cari makanan atau minuman…', all: 'Semua', noMatch: 'Tiada.', add: 'Tambah', basket: 'Lihat pesanan', items: 'barang',
    choose: 'wajib', chooseMany: 'pilih mana-mana', note: 'Nota (cth. kurang pedas, tiada bawang)', orderNote: 'Nota untuk pesanan', yourName: 'Nama anda (dipanggil bila siap)',
    subtotal: 'Jumlah kecil', service: 'Caj perkhidmatan', tax: 'Cukai', total: 'Jumlah', payAtCounter: 'Pesan dulu, bayar di kaunter. Harga kaunter adalah muktamad.',
    send: 'Hantar pesanan', sending: 'Menghantar…', needOption: 'Sila pilih', remove: 'Buang',
    sent: 'Pesanan dihantar', waiting: 'Menunggu kedai terima', accepted: 'Diterima — sedang disediakan', ready: 'Siap! Ambil di kaunter', readyTable: 'Siap — dihantar ke meja anda', done: 'Selesai. Terima kasih!', rejected: 'Kedai tidak terima pesanan ini',
    pickupNo: 'Nombor ambil', yourTable: 'Meja anda', stepSent: 'Dihantar', stepMaking: 'Disediakan', stepReady: 'Siap',
    orderMore: 'Pesan lagi', myOrders: 'Pesanan saya tadi', closed: 'Kedai ini tidak menerima pesanan QR sekarang.', tooMany: 'Terlalu banyak pesanan. Tunggu sebentar.',
  },
};
const params = new URLSearchParams(location.search);
const pickLang = () => {
  const asked = params.get('lang') || safeGet('so.lang');
  if (WORDS[asked]) return asked;
  const n = (navigator.language || '').toLowerCase();
  return n.startsWith('zh') ? 'zh' : n.startsWith('ms') || n.startsWith('id') ? 'ms' : n.startsWith('en') ? 'en' : 'zh';
};
let lang = pickLang();
const w = () => WORDS[lang];
document.documentElement.lang = lang;

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); } catch { /* private window */ } }
const rm = (sen) => `RM ${formatSen(sen)}`;

// ------------------------------------------------------------------ state

const app = document.getElementById('app');
const shop = params.get('s') || '';
const MINE = `so.orders.${shop}`;
const st = {
  menu: null,
  orderType: null,
  table: params.get('t') || '',
  cat: 'all',
  q: '',
  basket: [], // { key, item, qty, options: { groupId: [i] }, note }
  note: '',
  name: '',
  sending: false,
  error: '',
};

const api = async (path, init) => {
  const res = await fetch(`${API_ORIGIN}/public/order/${encodeURIComponent(shop)}${path}`, {
    ...init, headers: { 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error?.message || res.statusText), { status: res.status });
  return body;
};

// ------------------------------------------------------------------ start

async function start() {
  mount(app, h('p', { class: 'so-loading' }, w().loading));
  if (!shop) return failed(w().badCode, w().badCodeHint);
  try {
    st.menu = await api('');
  } catch (err) {
    if (err.status === 404) return failed(w().badCode, String(err.message).includes('not on') ? w().closed : w().badCodeHint);
    return failed(w().offline, '', true);
  }
  const types = st.menu.orderTypes;
  if (st.table && !st.menu.tables.includes(st.table)) st.table = '';
  if (st.table && types.includes('DINE_IN')) st.orderType = 'DINE_IN';
  else if (types.length === 1) st.orderType = types[0];
  // An order sent a moment ago, still on its way: show it first.
  const recent = mine().find((o) => Date.now() - o.at < 6 * 3600_000 && !o.finished);
  if (recent && !params.has('new')) return follow(recent);
  draw();
}

function failed(title, hint, retry = false) {
  mount(app, h('div', { class: 'so-error' }, h('b', {}, title), hint,
    retry ? h('p', {}, h('button', { class: 'so-ghost', type: 'button', onclick: start }, w().retry)) : null));
}

const mine = () => { try { return JSON.parse(safeGet(MINE) || '[]'); } catch { return []; } };
const remember = (list) => safeSet(MINE, JSON.stringify(list.slice(0, 10)));

// ------------------------------------------------------------------ pages

function draw() {
  if (!st.orderType) return askHow();
  if (st.orderType === 'DINE_IN' && !st.table) return askTable();
  drawMenu();
}

function langSwitch() {
  return h('div', { class: 'so-lang' }, Object.keys(WORDS).map((l) => h('button', {
    type: 'button', class: l === lang ? 'on' : '', 'aria-label': l,
    onclick: () => { lang = l; document.documentElement.lang = l; safeSet('so.lang', l); draw(); },
  }, { zh: '中', en: 'EN', ms: 'BM' }[l])));
}

function top(extra = []) {
  const where = st.orderType === 'TAKEAWAY' ? `🥡 ${w().takeAway}` : st.table ? `🍽 ${w().table} ${st.table}` : '';
  return h('header', { class: 'so-top' },
    h('div', { class: 'so-shop' },
      h('h1', {}, [st.menu.shop.name, st.menu.shop.branch].filter(Boolean).join(' · ')),
      where && st.menu.orderTypes.length + (st.menu.tables.length > 1 ? 1 : 0) > 1
        ? h('button', { class: 'so-where', type: 'button', 'data-act': 'change-where', onclick: () => { st.orderType = st.menu.orderTypes.length > 1 ? null : st.orderType; if (st.orderType === 'DINE_IN') st.table = ''; draw(); } }, `${where} · ${w().change}`)
        : where ? h('span', { class: 'so-where' }, where) : null,
      langSwitch()),
    ...extra);
}

function askHow() {
  mount(app, h('div', { class: 'so' }, top(),
    h('div', { class: 'so-ask' },
      h('h2', {}, w().howEat),
      st.menu.orderTypes.includes('DINE_IN') ? h('button', { class: 'so-big', type: 'button', 'data-type': 'DINE_IN', onclick: () => { st.orderType = 'DINE_IN'; draw(); } }, h('span', {}, '🍽'), w().eatHere) : null,
      st.menu.orderTypes.includes('TAKEAWAY') ? h('button', { class: 'so-big', type: 'button', 'data-type': 'TAKEAWAY', onclick: () => { st.orderType = 'TAKEAWAY'; draw(); } }, h('span', {}, '🥡'), w().takeAway) : null)));
}

function askTable() {
  mount(app, h('div', { class: 'so' }, top(),
    h('div', { class: 'so-ask' },
      h('h2', {}, w().whichTable),
      h('div', { class: 'so-tables' }, st.menu.tables.map((t) => h('button', { type: 'button', 'data-table': t, onclick: () => { st.table = t; draw(); } }, t))))));
}

// -------------------------------------------------------------- the menu

const groupsOf = (item) => item.modifierIds.map((id) => st.menu.modifiers.find((g) => g.id === id)).filter(Boolean);
const unitOf = (line) => line.item.priceSen + groupsOf(line.item).reduce((s, g) => s + (line.options[g.id] || []).reduce((x, i) => x + (g.options[i]?.priceSen || 0), 0), 0);
const countOf = (barcode) => st.basket.filter((l) => l.item.barcode === barcode).reduce((n, l) => n + l.qty, 0);
const initial = (name) => (name || '?').trim().slice(0, 2).toUpperCase();
const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#9d174d', '#4d7c0f', '#7c3aed'];
const tint = (s) => PALETTE[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
const pic = (item, cls = 'so-pic') => h('div', { class: cls, style: item.photoUrl ? { backgroundImage: `url("${item.photoUrl.replace(/"/g, '')}")` } : { background: tint(item.name) } }, item.photoUrl ? '' : initial(item.name));

function drawMenu() {
  const search = h('input', { class: 'so-search', type: 'search', placeholder: w().search, value: st.q, 'aria-label': w().search,
    oninput: (e) => { st.q = e.target.value; drawItems(); } });
  const cats = h('nav', { class: 'so-cats', 'aria-label': w().all });
  const list = h('main', {});
  const bar = h('div', { class: 'so-bar' });
  const drawCats = () => mount(cats, [{ id: 'all', name: w().all }, ...st.menu.categories].map((c) => h('button', {
    type: 'button', class: st.cat === c.id ? 'on' : '', onclick: () => { st.cat = c.id; drawCats(); drawItems(); },
  }, c.name)));
  const drawItems = () => {
    const q = st.q.trim().toLowerCase();
    let items = st.menu.items.filter((i) => !q || i.name.toLowerCase().includes(q));
    if (st.cat !== 'all') items = items.filter((i) => i.categoryId === st.cat);
    // By category, in the shop's order; anything without one last.
    const known = new Set(st.menu.categories.map((c) => c.id));
    const sections = [
      ...st.menu.categories.map((c) => [c, items.filter((i) => i.categoryId === c.id)]),
      [{ id: '', name: '' }, items.filter((i) => !known.has(i.categoryId))],
    ].filter(([, list]) => list.length);
    mount(list,
      st.menu.shop.message ? h('div', { class: 'so-msg' }, st.menu.shop.message) : null,
      items.length ? sections.map(([c, list]) => h('section', { class: 'so-section' },
        c.name && st.cat === 'all' ? h('h2', {}, c.name) : null,
        h('div', { class: 'so-items' }, list.map((item) => {
          const n = countOf(item.barcode);
          return h('button', { type: 'button', class: 'so-item', 'data-item': item.barcode, onclick: () => openItem(item, redraw) },
            pic(item),
            h('div', { class: 'so-info' },
              h('div', { class: 'so-name' }, item.name),
              item.description ? h('div', { class: 'so-desc' }, item.description) : null,
              h('div', { class: 'so-row' }, h('span', { class: 'so-price' }, rm(item.priceSen)),
                n ? h('span', { class: 'so-qtybadge' }, String(n)) : h('span', { class: 'so-add', 'aria-label': w().add }, '+'))));
        })))) : h('p', { class: 'so-empty' }, w().noMatch));
  };
  const drawBar = () => {
    const n = st.basket.reduce((s, l) => s + l.qty, 0);
    mount(bar, n ? h('button', { type: 'button', 'data-act': 'basket', onclick: () => openBasket(redraw) },
      h('span', { class: 'n' }, String(n)), h('span', { class: 'grow' }, w().basket), h('span', {}, rm(totals().totalSen))) : null);
  };
  const redraw = () => { drawItems(); drawBar(); };
  mount(app, h('div', { class: 'so' }, top([search, st.menu.categories.length > 1 ? cats : null]), list, bar));
  drawCats();
  redraw();
}

// --------------------------------------------- one item: options and note

function sheet(build) {
  const bg = h('div', { class: 'so-sheet-bg', role: 'dialog', 'aria-modal': 'true' });
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
  bg.append(h('div', { class: 'so-sheet' }, ...build(close)));
  document.body.append(bg);
  return close;
}

function openItem(item, after) {
  const groups = groupsOf(item);
  // Nothing to choose: straight into the basket.
  if (!groups.length) {
    const same = st.basket.find((l) => l.item.barcode === item.barcode && !l.note && !Object.keys(l.options).length);
    if (same) same.qty += 1; else st.basket.push({ key: `${item.barcode}|`, item, qty: 1, options: {}, note: '' });
    return after();
  }
  const line = { item, qty: 1, options: Object.fromEntries(groups.map((g) => [g.id, []])), note: '' };
  sheet((close) => {
    const body = h('div', { style: { display: 'grid', gap: '14px' } });
    const err = h('p', { class: 'so-err' });
    const go = h('button', { class: 'so-primary', type: 'button', 'data-act': 'add-item' });
    const draw = () => {
      go.textContent = `${w().add} · ${rm(unitOf(line) * line.qty)}`;
      mount(body,
        groups.map((g) => h('div', { class: 'so-group' },
          h('h3', {}, g.name, h('small', {}, g.required ? w().choose : g.multiple ? w().chooseMany : '')),
          h('div', { class: 'so-opts' }, g.options.map((o, i) => h('button', {
            type: 'button', class: line.options[g.id].includes(i) ? 'on' : '', 'data-opt': `${g.id}:${i}`,
            onclick: () => {
              const set = line.options[g.id];
              if (set.includes(i)) line.options[g.id] = set.filter((x) => x !== i);
              else line.options[g.id] = g.multiple ? [...set, i] : [i];
              draw();
            },
          }, o.name, o.priceSen ? ` +${formatSen(o.priceSen)}` : ''))))),
        h('textarea', { class: 'so-note', rows: 1, placeholder: w().note, maxlength: 140, value: line.note, oninput: (e) => { line.note = e.target.value; } }),
        h('div', { class: 'so-step' },
          h('button', { type: 'button', 'aria-label': '−', onclick: () => { line.qty = Math.max(1, line.qty - 1); draw(); } }, '−'),
          h('b', {}, String(line.qty)),
          h('button', { type: 'button', 'aria-label': '+', onclick: () => { line.qty = Math.min(50, line.qty + 1); draw(); } }, '+')));
    };
    go.onclick = () => {
      const missing = groups.find((g) => g.required && !line.options[g.id].length);
      if (missing) { err.textContent = `${w().needOption}: ${missing.name}`; return; }
      line.key = `${item.barcode}|${JSON.stringify(line.options)}|${line.note.trim()}`;
      const same = st.basket.find((l) => l.key === line.key);
      if (same) same.qty += line.qty; else st.basket.push(line);
      close();
      after();
    };
    draw();
    return [pic(item), h('h2', {}, item.name), item.description ? h('p', { style: { margin: 0, color: 'var(--muted)' } }, item.description) : null, body, err, go];
  });
}

// --------------------------------------------------------------- basket

/** What the bill will come to -- the till does the final sum. */
function totals() {
  const lines = st.basket.map((l) => ({ qtyMilli: l.qty * 1000, unitPriceSen: unitOf(l), taxIds: l.item.taxIds || [] }));
  const m = st.menu;
  return billTotals(lines, {
    taxes: m.taxes,
    pricesIncludeTax: m.pricesIncludeTax,
    serviceChargePct: st.orderType === 'DINE_IN' ? m.serviceChargePct : 0,
  });
}

function openBasket(after) {
  sheet((close) => {
    const body = h('div', { style: { display: 'grid', gap: '14px' } });
    const draw = () => {
      if (!st.basket.length) { close(); after(); return; }
      const t = totals();
      mount(body,
        h('div', { class: 'so-lines' }, st.basket.map((l, i) => {
          const mods = groupsOf(l.item).flatMap((g) => (l.options[g.id] || []).map((x) => g.options[x]?.name)).filter(Boolean);
          return h('div', { class: 'so-line', 'data-line': i },
            h('div', {}, h('b', {}, l.item.name), ' ', h('span', { class: 'so-price' }, rm(unitOf(l) * l.qty))),
            h('div', { class: 'so-step' },
              h('button', { type: 'button', 'aria-label': w().remove, onclick: () => { l.qty -= 1; if (!l.qty) st.basket.splice(i, 1); draw(); after(); } }, '−'),
              h('b', {}, String(l.qty)),
              h('button', { type: 'button', 'aria-label': '+', onclick: () => { l.qty = Math.min(50, l.qty + 1); draw(); after(); } }, '+')),
            mods.length || l.note ? h('div', { class: 'm' }, [...mods, l.note].filter(Boolean).join(' · ')) : null);
        })),
        h('textarea', { class: 'so-note', rows: 1, placeholder: w().orderNote, maxlength: 140, value: st.note, oninput: (e) => { st.note = e.target.value; } }),
        st.orderType === 'TAKEAWAY' ? h('input', { class: 'so-note', placeholder: w().yourName, maxlength: 40, value: st.name, autocomplete: 'given-name', oninput: (e) => { st.name = e.target.value; } }) : null,
        h('div', { class: 'so-sum' },
          h('div', {}, h('span', {}, w().subtotal), h('span', {}, rm(t.subtotalSen))),
          t.serviceChargeSen ? h('div', {}, h('span', {}, `${w().service} ${st.menu.serviceChargePct}%`), h('span', {}, rm(t.serviceChargeSen))) : null,
          t.taxSen && !st.menu.pricesIncludeTax ? h('div', {}, h('span', {}, w().tax), h('span', {}, rm(t.taxSen))) : null,
          h('div', { class: 'total' }, h('span', {}, w().total), h('span', { 'data-total': t.totalSen }, rm(t.totalSen)))),
        h('p', { class: 'so-fine' }, w().payAtCounter),
        st.error ? h('p', { class: 'so-err' }, st.error) : null,
        h('button', { class: 'so-primary', type: 'button', 'data-act': 'send', disabled: st.sending, onclick: send }, st.sending ? w().sending : w().send));
    };
    async function send() {
      st.sending = true; st.error = ''; draw();
      try {
        const res = await api('', { method: 'POST', body: JSON.stringify({
          orderType: st.orderType, table: st.table, note: st.note, name: st.name,
          items: st.basket.map((l) => ({ barcode: l.item.barcode, qty: l.qty, options: l.options, note: l.note })),
        }) });
        const sent = { id: res.id, pickupNo: res.pickupNo, at: Date.now(), table: st.orderType === 'DINE_IN' ? st.table : '' };
        remember([sent, ...mine()]);
        st.basket = []; st.note = ''; st.sending = false;
        close();
        follow(sent);
      } catch (err) {
        st.sending = false;
        st.error = err.status === 429 ? w().tooMany : err.message || w().offline;
        draw();
      }
    }
    draw();
    return [h('h2', {}, w().basket), body];
  });
}

// ------------------------------------------------- after sending: follow it

let timer = null;
function follow(sent) {
  clearTimeout(timer);
  const box = h('div', { class: 'so-done' });
  mount(app, h('div', { class: 'so' }, st.menu ? top() : null, box));
  const tick = async () => {
    let s;
    try { s = await api(`/${sent.id}`); } catch { timer = setTimeout(tick, 8000); return; }
    const words = { NEW: w().waiting, ACCEPTED: w().accepted, READY: sent.table ? w().readyTable : w().ready, DONE: w().done, REJECTED: w().rejected };
    const step = { NEW: 0, ACCEPTED: 1, READY: 2, DONE: 2, REJECTED: -1 }[s.status] ?? 0;
    const finished = s.status === 'DONE' || s.status === 'REJECTED';
    if (finished) remember(mine().map((o) => (o.id === sent.id ? { ...o, finished: true } : o)));
    mount(box,
      h('div', { class: `so-ticket${s.status === 'READY' ? ' ready' : ''}`, 'data-status': s.status },
        h('div', { class: 'label' }, s.table ? w().yourTable : w().pickupNo),
        h('div', { class: 'big' }, s.table || s.pickupNo),
        h('div', { class: `so-status${s.status === 'REJECTED' ? ' bad' : ''}` }, words[s.status] || w().sent),
        s.reason ? h('div', { class: 'label' }, s.reason) : null),
      step >= 0 ? h('div', { class: 'so-track' }, [w().stepSent, w().stepMaking, w().stepReady].map((x, i) => h('div', { class: i <= step ? 'on' : '' }, x))) : null,
      h('div', { class: 'so-receipt' },
        s.lines.map((l) => h('div', {}, h('span', {}, `${l.qty} × ${l.name}${l.modifiers.length ? ` (${l.modifiers.join(', ')})` : ''}`))),
        h('div', { style: { fontWeight: 800 } }, h('span', {}, w().total), h('span', {}, rm(s.totalSen)))),
      h('p', { class: 'so-fine' }, w().payAtCounter),
      st.menu ? h('button', { class: 'so-primary', type: 'button', 'data-act': 'order-more', onclick: () => { clearTimeout(timer); draw(); } }, w().orderMore) : null);
    if (!finished) timer = setTimeout(tick, 5000);
  };
  tick();
}

start();
