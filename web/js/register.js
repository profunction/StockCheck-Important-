/**
 * The cash register, laid out for the kind of shop (Settings -> Features):
 *
 * - Restaurant: product grid, tables, dine-in / take-away, modifiers, the
 *   kitchen ticket, pay at the end.
 * - Supermarket: scan after scan. A big scan box, the bill as a list, a large
 *   total and function keys -- quantity times, price check, quick items for
 *   things without a barcode, hold and recall.
 * - Retail shop: product grid with photos by category, scan or tap.
 *
 * The bill, payment, receipt and stock are the same in all three. A USB
 * scanner types the barcode and presses Enter; "3*" before a scan sells 3.
 */
import { collection, db, doc, deleteDoc, onSnapshot, query, setDoc, where } from './fb.js';
import { confirmBox, h, modal, mount, toast } from './dom.js';
import { t, paymentLabel } from './i18n.js';
import { billTotals, formatQty, formatSen, lineAmount, lineTotal, parseQty, parseSen, productTaxIds, rm, taxList, UNIT } from './money.js';
import { DEFAULT_SETTINGS, onChange, session, ws } from './session.js';
import { kitchenView, printView } from './receipt.js';
import { openPayment } from './pay.js';
import { freshCustomer, loadCustomers, pickCustomer } from './customers.js';
import { isLocked } from './pdpa.js';
import { listenForTags, nfcSupported, normalizeTag } from './nfc.js';
import { scanWithCamera } from './camera.js';
import { menuButton, tillButton } from './main.js';
import { tillHelpButton } from './pagehelp.js';
import { icon } from './icons.js';
import { layoutFor, modeCards } from './modes.js';
import { shiftButton, shiftReady } from './shifts.js';
import { thisTill, tillAllowed, tillLabel } from './tills.js';
import { directReady, openDrawer } from './rawprint.js';

const WEIGHED_UNITS = ['kg', 'g', 'l', 'ml', 'm'];
const isWeighed = (unit) => WEIGHED_UNITS.includes((unit || '').toLowerCase());

/** The bill being built. */
let cart = newCart();
let category = '';
let search = '';
let openOrders = [];
/** "3*" typed before a scan: how many the next item is. */
let pendingQty = null;
/** The last thing added, shown big on the supermarket screen. */
let lastAdded = null;
let flashKey = '';
/** Which screen is on: 'picker', 'fnb', 'market' or 'retail'. */
let built = '';
let stopNfc = null;

function newCart(extra = {}) {
  return { orderId: '', table: '', orderType: defaultOrderType(), lines: [], discountIds: [], note: '', customer: null, ...extra };
}

function defaultOrderType() {
  return session.settings.mode === 'FNB' ? 'DINE_IN' : 'RETAIL';
}

const layout = () => layoutFor(session.settings);
/** "Till 3" in the top bar, filled in once this computer is registered. */
const tillBadge = () => h('span', { class: 'till-badge', title: t('tillN'), 'data-help': 'no' }, tillLabel(thisTill));
const isFnb = () => layout() === 'fnb';
const kitchenOn = () => isFnb() && session.settings.kitchenTicket !== false;

let root;
let els = {};

/** A full-page notice in place of the till: the plan leaves it out, or its tills are all in use. */
function lockedView(main, message) {
  mount(main, h('div', { class: 'modepick' },
    h('header', {}, h('div', { class: 'row', style: { justifyContent: 'center' } }, menuButton()),
      h('h1', {}, t('navRegister')), h('p', { class: 'card', style: { maxWidth: '560px' } }, message),
      h('p', {}, h('a', { href: '#/settings/device' }, t('setDevice'))))));
}

export function render(main) {
  if (!session.has('pos')) { lockedView(main, t('planNoPos')); return null; }
  root = main;
  cart = newCart();
  category = '';
  search = '';
  pendingQty = null;
  lastAdded = null;
  built = '';

  // A USB scanner is a keyboard. Whatever is focused, a scan should land in
  // the scan box -- unless somebody is typing in another field or a dialog.
  const onKey = (e) => {
    if (!els.scan || built === 'picker') return;
    const open = document.querySelector('.backdrop');
    if (open) {
      // The "change: RM 12.20" box after a sale: a scanner starting the next
      // customer closes it, and the key goes to the scan box.
      const afterSale = open.querySelector('[data-after-sale]');
      if (!afterSale || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      afterSale.click();
      els.scan.focus();
      return;
    }
    const target = e.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (!typing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      els.scan.focus();
    }
  };
  document.addEventListener('keydown', onKey);
  const goOnline = () => els.online?.classList.toggle('hidden', navigator.onLine);
  window.addEventListener('online', goOnline);
  window.addEventListener('offline', goOnline);
  const stopChange = onChange(() => drawAll());

  const ordersQuery = session.branchIds.length || session.branchId
    ? query(collection(db, ws('orders')), where('branchId', '==', session.branchId))
    : collection(db, ws('orders'));
  const stopOrders = onSnapshot(ordersQuery, (snap) => {
    openOrders = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((o) => (o.branchId || '') === session.branchId);
    drawOpenCount();
  }, (err) => console.warn('orders', err));

  drawAll();
  let gone = false;
  tillAllowed().then((ok) => {
    // Which till this is, in the bar at the top: "Till 3" or its name.
    document.querySelectorAll('.till-badge').forEach((el) => { el.textContent = tillLabel(thisTill); });
    if (!ok && !gone) lockedView(main, t('tillLimit').replace('{n}', String(session.plan?.tills)));
  }).catch((err) => console.warn('tills', err));

  return () => {
    gone = true;
    stopNfc?.();
    stopNfc = null;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('online', goOnline);
    window.removeEventListener('offline', goOnline);
    stopChange();
    stopOrders();
    els = {};
  };
}

// ------------------------------------------------------- choosing a mode

/** The owner opening the till for the first time picks what kind of shop it is. */
function needsPicker() {
  return session.settingsLoaded && !session.settings.mode && session.can('POS_MANAGE');
}

function drawPicker() {
  built = 'picker';
  els = {};
  mount(root, h('div', { class: 'modepick' },
    h('header', {},
      h('div', { class: 'row', style: { justifyContent: 'center' } }, menuButton()),
      h('h1', {}, t('modeTitle')),
      h('p', { class: 'muted', style: { margin: 0 } }, t('modeSub')),
      h('p', { class: 'notice mode-lock' }, icon('lock', 17), h('span', {}, t('modeLockFirst')))),
    modeCards(null, async (mode) => {
      const next = { ...DEFAULT_SETTINGS, ...session.settings, mode, updatedAt: Date.now() };
      if (mode === 'FNB') next.kitchenTicket = true;
      session.settings = next;
      setDoc(doc(db, ws('pos/settings')), next).catch((err) => toast(err.message || String(err), 'error'));
      toast(t('modeSaved'), 'ok');
      cart = newCart();
      drawAll();
    })));
}

// ------------------------------------------------------------------ screens

function drawAll() {
  if (needsPicker()) {
    if (built !== 'picker') drawPicker();
    return;
  }
  const want = layout();
  if (built !== want) build(want);
  // A sale started before the settings loaded took the default order type.
  if (!cart.lines.length && !cart.orderId && !cart.table) cart.orderType = defaultOrderType();
  if (want !== 'market') {
    els.tablesBtn.classList.toggle('hidden', !isFnb());
    drawChips();
    drawTiles();
  }
  drawTicket();
}

/** The scan box, the "×3" flag beside it, the camera and NFC buttons. */
function scanParts(big) {
  els.scan = h('input', {
    class: 'scan', placeholder: t('scanHere'), autocomplete: 'off', autofocus: true, 'aria-label': t('scanHere'),
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const raw = els.scan.value.trim();
      els.scan.value = '';
      // "3*" then a scan sells three; "3*" alone waits for the scan.
      const times = /^(\d+(?:\.\d+)?)\s*[*xX×]\s*(.*)$/.exec(raw);
      if (times && parseQty(times[1])) {
        pendingQty = parseQty(times[1]);
        drawQtyFlag();
        if (times[2]) addByCode(times[2]);
        return;
      }
      if (raw) addByCode(raw);
    },
  });
  els.qtyFlag = h('span', { class: 'qtyflag hidden', title: t('qtyX') });
  els.nfc = nfcSupported() ? h('button', {
    class: 'icon-btn', title: 'NFC', 'data-help': 'nfc',
    onclick: async () => {
      if (stopNfc) { stopNfc(); stopNfc = null; els.nfc.classList.remove('primary'); return; }
      try {
        // Chrome on Android reads NFC tags and member cards; it has to be
        // started from a tap, so it stays on until tapped again.
        stopNfc = await listenForTags((id) => addByCode(id));
        els.nfc.classList.add('primary');
        toast(t('nfcOn'), 'ok');
      } catch (err) {
        toast(`${t('nfcError')}: ${err.message || err}`, 'error');
      }
    },
  }, icon('nfc', 20)) : null;
  return [
    h('div', { class: 'search-box', 'data-help': 'scan' }, icon('barcode', big ? 22 : 18), els.scan),
    els.qtyFlag,
    h('button', {
      class: 'icon-btn', title: t('scanCamera'), style: big ? { width: '56px' } : {}, 'data-help': 'camera',
      onclick: async () => { const code = await scanWithCamera(); if (code) addByCode(code); else els.scan.focus(); },
    }, icon('camera', 20)),
    els.nfc,
  ];
}

function drawQtyFlag() {
  if (!els.qtyFlag) return;
  els.qtyFlag.textContent = pendingQty ? `× ${formatQty(pendingQty)}` : '';
  els.qtyFlag.classList.toggle('hidden', !pendingQty);
  els.qtyKey?.classList.toggle('on', !!pendingQty);
}

function drawOpenCount() {
  if (els.openCount) els.openCount.textContent = String(openOrders.length);
}

function build(kind) {
  built = kind;
  stopNfc?.();
  stopNfc = null;
  els = {};
  els.online = h('div', { class: `offline${navigator.onLine ? ' hidden' : ''}` }, icon('wifiOff', 16), t('offlineNote'));
  els.orderInfo = h('div', { class: 'orderinfo' });
  els.lines = h('div', { class: kind === 'market' ? 'mlines' : 'lines', ...(kind === 'market' ? {} : { 'data-help': 'lines' }) });
  els.sums = h('div', { class: 'sums' });
  els.openCount = h('span', { class: 'count' }, String(openOrders.length));

  if (kind === 'market') {
    els.last = h('div', { class: 'lastitem' });
    els.total = h('div', { class: 'big' });
    els.totalLabel = h('div', { class: 'k' });
    els.pay = h('button', { class: 'primary pay', 'data-help': 'pay' });
    els.qtyKey = h('button', { onclick: askNextQty, 'data-help': 'qty' }, icon('times', 22), t('qtyX'));
    els.recallKey = h('button', { onclick: openTicketsList, 'data-help': 'recall' }, icon('receipt', 22), h('span', {}, t('recall'), ' ', els.openCount));
    els.holdKey = h('button', { onclick: () => saveTicket(), 'data-help': 'hold' }, icon('pause', 22), t('hold'));
    els.discKey = h('button', { onclick: chooseDiscounts, 'data-help': 'discount' }, icon('percent', 22), t('discount'));
    els.clearKey = h('button', { class: 'danger', onclick: clearTicket, 'data-help': 'clear' }, icon('trash', 22), t('clear'));
    mount(root, h('div', { class: 'market' },
      h('section', { class: 'left' },
        els.online,
        h('div', { class: 'scanbar' }, menuButton(), ...scanParts(true), tillBadge(), shiftButton(() => els.scan?.focus()), tillHelpButton(), tillButton()),
        els.orderInfo,
        els.lines),
      h('aside', { class: 'mpanel' },
        els.last,
        h('div', { class: 'totalcard' }, els.totalLabel, els.total, els.sums),
        h('div', { class: 'fkeys' },
          els.qtyKey,
          h('button', { onclick: priceCheck, 'data-help': 'price-check' }, icon('barcode', 22), t('priceCheck')),
          h('button', { onclick: quickItems, 'data-help': 'quick' }, icon('grid', 22), t('quickKeys')),
          h('button', { onclick: chooseCustomer, 'data-help': 'customer' }, icon('user', 22), t('member')),
          els.discKey, els.holdKey, els.recallKey,
          directReady() ? h('button', { onclick: () => openDrawer().catch((e) => toast(e.message, 'error')), 'data-help': 'drawer' }, icon('box', 22), t('openDrawer')) : null,
          els.clearKey),
        els.pay)));
  } else {
    els.search = h('input', { type: 'search', placeholder: t('searchProducts'), value: search, oninput: (e) => { search = e.target.value; drawTiles(); } });
    els.chips = h('div', { class: 'chips', 'data-help': 'categories' });
    els.tiles = h('div', { class: 'tiles', 'data-help': 'tiles' });
    els.buttons = h('div', { class: 'buttons' });
    els.tablesBtn = h('button', { onclick: openTables, 'data-help': 'tables' }, icon('dining', 18), t('tables'));
    mount(root, h('div', { class: 'register' },
      h('section', { class: 'catalog' },
        els.online,
        h('div', { class: 'reg-bar' },
          menuButton(),
          h('div', { class: 'search-box', 'data-help': 'search' }, icon('search', 18), els.search),
          h('span', { class: 'grow' }),
          tillBadge(),
          shiftButton(() => els.scan?.focus()),
          els.tablesBtn,
          h('button', { onclick: openTicketsList, 'data-help': 'recall' }, icon('receipt', 18), t('openTickets'), els.openCount),
          tillHelpButton(),
          tillButton()),
        els.chips,
        els.tiles),
      h('section', { class: 'ticket' },
        h('div', { class: 'head' }, h('div', { class: 'scanwrap' }, ...scanParts(false)), els.orderInfo),
        els.lines, els.sums, els.buttons)));
  }
  drawQtyFlag();
}

// ------------------------------------------------------------------ catalog

function sellable() {
  return session.products.filter((p) => p.active !== false);
}

function drawChips(target = els.chips, redraw = () => { drawChips(); drawTiles(); }) {
  const cats = session.categories;
  const chip = (id, label, color) => h('button', {
    class: category === id ? 'on' : '',
    onclick: () => { category = id; redraw(); },
  }, color ? h('span', { class: 'dot', style: { background: color } }) : null, label);
  mount(target, chip('', t('all')), cats.map((c) => chip(c.id, c.name, c.color)));
  target.classList.toggle('hidden', cats.length === 0);
}

function tileList(q) {
  return sellable()
    .filter((p) => !category || p.category === category)
    .filter((p) => !q || (p.name || '').toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
    .sort((a, b) => (a.name || a.barcode).localeCompare(b.name || b.barcode))
    .slice(0, 300);
}

function tileFor(p, onPick) {
  const cat = session.categories.find((c) => c.id === p.category);
  const style = p.photoUrl
    ? { backgroundImage: `url("${p.photoUrl}")` }
    : cat?.color ? { background: `linear-gradient(135deg, ${cat.color}, color-mix(in srgb, ${cat.color} 70%, #000))` } : {};
  return h('button', { class: 'tile', onclick: () => onPick(p) },
    h('div', { class: `pic${p.photoUrl || cat?.color ? '' : ' plain'}`, style }, p.photoUrl ? '' : (p.name || p.barcode).slice(0, 2)),
    h('div', { class: 'info' },
      h('span', { class: 'n' }, p.name || p.barcode),
      h('span', { class: 'p' }, p.priceSen != null ? rm(p.priceSen) : t('noPrice'))));
}

function drawTiles(target = els.tiles, q = search.trim().toLowerCase(), onPick = addProduct) {
  const list = tileList(q);
  if (!list.length) {
    mount(target, h('p', { class: 'empty-note' }, session.products.length ? t('noMatch') : t('noProductsYet')));
    return;
  }
  mount(target, list.map((p) => tileFor(p, onPick)));
}

// ---------------------------------------------------------------- adding

/**
 * Whatever a scanner, a camera or an NFC tap produced: a product's barcode
 * or bound tag first, then a customer's member card.
 */
async function addByCode(raw) {
  const code = String(raw).trim();
  const product = session.find(code) || session.find(normalizeTag(code));
  if (product) return addProduct(product);
  try {
    const tag = normalizeTag(code);
    const found = (await loadCustomers()).find((c) => !isLocked(c) && (c.cardIds || []).some((id) => id === code || id === tag));
    const member = found && await freshCustomer(found);
    if (member) {
      cart.customer = { id: member.id, name: member.name, phone: member.phone || '', points: member.points || 0 };
      toast(`${member.name}`, 'ok');
      drawTicket();
      return;
    }
  } catch {
    // Customers are a bonus here; a till without permission still sells.
  }
  toast(`${t('notFound')}: ${code}`, 'error');
  beep();
}

async function addProduct(product) {
  let price = product.priceSen;
  if (price == null) {
    price = await askAmount(t('enterPrice'), product.name || product.barcode);
    if (price == null) return;
  }
  const weighed = isWeighed(product.unit);
  let qty = UNIT;
  if (weighed) {
    qty = await askQty(product);
    if (qty == null) return;
  } else if (pendingQty) {
    qty = pendingQty;
  }
  pendingQty = null;
  drawQtyFlag();
  let modifiers = [];
  const groups = (product.modifierIds || []).map((id) => session.modifiers.find((m) => m.id === id)).filter(Boolean);
  if (groups.length) {
    modifiers = await askModifiers(product, groups);
    if (modifiers == null) return;
  }
  const unitPriceSen = price + modifiers.reduce((s, m) => s + (m.priceSen || 0), 0);

  // Same product, same options, not yet sent to the kitchen: one line, more of it.
  const sameKey = `${product.barcode}|${modifiers.map((m) => m.name).join(',')}|${unitPriceSen}`;
  const existing = cart.lines.find((l) => l.key === sameKey && !l.sent && !l.note && !weighed);
  if (existing) existing.qtyMilli += qty;
  else {
    cart.lines.push({
      key: sameKey,
      barcode: product.barcode,
      name: product.name || product.barcode,
      categoryId: product.category || '',
      unit: product.unit || '',
      qtyMilli: qty,
      unitPriceSen,
      basePriceSen: price,
      costSen: product.costSen ?? null,
      modifiers,
      discountSen: 0,
      note: '',
      trackStock: product.trackStock !== false,
      taxIds: productTaxIds(product, taxList(session.settings)),
      sent: false,
    });
  }
  lastAdded = { name: product.name || product.barcode, qtyMilli: qty, unit: weighed ? product.unit : '', amountSen: lineAmount(qty, unitPriceSen) };
  flashKey = sameKey;
  drawTicket();
  els.scan?.focus();
}

// ------------------------------------------------- supermarket function keys

function askNextQty() {
  if (pendingQty) { pendingQty = null; drawQtyFlag(); els.scan.focus(); return; }
  const input = h('input', { inputmode: 'decimal', autofocus: true, placeholder: '2' });
  modal((close) => h('form', {
    style: { display: 'grid', gap: '14px' },
    onsubmit: (e) => {
      e.preventDefault();
      const q = parseQty(input.value);
      if (!q) return toast(t('errQty'), 'error');
      pendingQty = q;
      drawQtyFlag();
      close();
    },
  },
  h('h2', {}, t('qtyPrompt')),
  h('p', { class: 'muted', style: { margin: 0 } }, t('qtyHint')),
  input,
  h('div', { class: 'actions' }, h('button', { type: 'button', onclick: close }, t('cancel')), h('button', { class: 'primary' }, t('ok')))),
  { onClose: () => els.scan?.focus() });
}

/** Scan anything to see its price, without selling it. */
function priceCheck() {
  const out = h('div', { class: 'pricecheck' }, h('span', { class: 'muted' }, t('scanToCheck')));
  const input = h('input', {
    autofocus: true, placeholder: t('scanHere'), autocomplete: 'off',
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const code = input.value.trim();
      input.value = '';
      const p = code && (session.find(code) || session.find(normalizeTag(code)));
      if (!p) { mount(out, h('span', { class: 'muted' }, `${t('notFound')}: ${code}`)); beep(); return; }
      const taxes = taxList(session.settings).filter((x) => productTaxIds(p, taxList(session.settings)).includes(x.id));
      mount(out,
        h('strong', { style: { fontSize: '18px' } }, p.name || p.barcode),
        h('span', { class: 'p' }, p.priceSen != null ? rm(p.priceSen) : t('noPrice')),
        h('span', { class: 'muted' }, `${p.barcode}${isWeighed(p.unit) ? ` · / ${p.unit}` : ''}`),
        h('span', { class: 'muted' }, taxes.length ? taxes.map((x) => `${x.name} ${x.pct}%`).join(', ') : taxList(session.settings).length ? t('taxFree') : ''),
        h('div', { class: 'actions', style: { justifyContent: 'center' } },
          h('button', { class: 'primary', onclick: () => { closeIt(); addProduct(p); } }, icon('plus', 18), t('add'))));
    },
  });
  let closeIt = () => {};
  modal((close) => {
    closeIt = close;
    return [
      h('h2', {}, t('priceCheck')),
      h('div', { class: 'search-box' }, icon('barcode', 18), input),
      out,
      h('div', { class: 'actions' }, h('button', { onclick: close }, t('close'))),
    ];
  }, { onClose: () => els.scan?.focus() });
}

/** Things without a barcode -- loose vegetables, bread, a plastic bag. */
function quickItems() {
  let q = '';
  const chips = h('div', { class: 'chips', style: { padding: '0', border: '0', background: 'none' } });
  const grid = h('div', { class: 'tiles', style: { padding: '2px', maxHeight: '56vh' } });
  let closeIt = () => {};
  const pick = (p) => { closeIt(); addProduct(p); };
  const redraw = () => { drawChips(chips, redraw); drawTiles(grid, q, pick); };
  modal((close) => {
    closeIt = close;
    return [
      h('h2', {}, t('quickKeys')),
      h('div', { class: 'search-box' }, icon('search', 18), h('input', { type: 'search', autofocus: true, placeholder: t('searchProducts'), oninput: (e) => { q = e.target.value.trim().toLowerCase(); drawTiles(grid, q, pick); } })),
      chips,
      grid,
      h('div', { class: 'actions' }, h('button', { onclick: close }, t('close'))),
    ];
  }, { wide: true, onClose: () => els.scan?.focus() });
  redraw();
}

async function chooseCustomer() {
  if (cart.customer) { cart.customer = null; drawTicket(); return; }
  const c = await pickCustomer();
  if (c) { cart.customer = { id: c.id, name: c.name, phone: c.phone || '', points: c.points || 0 }; drawTicket(); }
  els.scan?.focus();
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 220;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // No sound is fine.
  }
}

function askAmount(title, subtitle) {
  return new Promise((resolve) => {
    let result = null;
    const input = h('input', { inputmode: 'decimal', autofocus: true, placeholder: '0.00' });
    modal((close) => h('form', {
      style: { display: 'grid', gap: '14px' },
      onsubmit: (e) => {
        e.preventDefault();
        const sen = parseSen(input.value);
        if (sen == null || sen < 0) return toast(t('errAmount'), 'error');
        result = sen;
        close();
      },
    },
    h('h2', {}, title), h('p', { class: 'muted', style: { margin: 0 } }, subtitle), input,
    h('div', { class: 'actions' }, h('button', { type: 'button', onclick: close }, t('cancel')), h('button', { class: 'primary' }, t('ok')))),
    { onClose: () => resolve(result) });
  });
}

function askQty(product, start = '') {
  return new Promise((resolve) => {
    let result = null;
    const input = h('input', { inputmode: 'decimal', autofocus: true, value: start, placeholder: `0.000 ${product.unit}` });
    modal((close) => h('form', {
      style: { display: 'grid', gap: '14px' },
      onsubmit: (e) => {
        e.preventDefault();
        const qty = parseQty(input.value);
        if (!qty) return toast(t('errQty'), 'error');
        result = qty;
        close();
      },
    },
    h('h2', {}, `${t('weight')} (${product.unit})`), h('p', { class: 'muted', style: { margin: 0 } }, product.name), input,
    h('div', { class: 'actions' }, h('button', { type: 'button', onclick: close }, t('cancel')), h('button', { class: 'primary' }, t('ok')))),
    { onClose: () => resolve(result) });
  });
}

/**
 * Modifier groups: { id, name, required, multiple, options: [{ name, priceSen }] }.
 * Resolves the chosen options, or null when cancelled.
 */
function askModifiers(product, groups) {
  return new Promise((resolve) => {
    let result = null;
    const chosen = new Map(groups.map((g) => [g.id, new Set()]));
    modal((close) => {
      const body = h('div', { style: { display: 'grid', gap: '14px' } });
      const draw = () => mount(body, groups.map((g) => h('div', { class: 'modgroup' },
        h('h3', { style: { margin: 0 } }, g.name, g.required ? h('span', { class: 'muted' }, ` · ${t('required')}`) : ''),
        h('div', { class: 'opts' }, (g.options || []).map((o, i) => h('button', {
          type: 'button',
          class: chosen.get(g.id).has(i) ? 'on' : '',
          onclick: () => {
            const set = chosen.get(g.id);
            if (set.has(i)) set.delete(i);
            else {
              if (!g.multiple) set.clear();
              set.add(i);
            }
            draw();
          },
        }, o.name, o.priceSen ? ` +${formatSen(o.priceSen)}` : ''))))));
      draw();
      return [
        h('h2', {}, product.name),
        body,
        h('div', { class: 'actions' },
          h('button', { onclick: close }, t('cancel')),
          h('button', {
            class: 'primary',
            onclick: () => {
              const missing = groups.find((g) => g.required && chosen.get(g.id).size === 0);
              if (missing) return toast(`${t('choose')}: ${missing.name}`, 'error');
              result = groups.flatMap((g) => [...chosen.get(g.id)].map((i) => ({
                groupId: g.id, group: g.name, name: g.options[i].name, priceSen: g.options[i].priceSen || 0,
              })));
              close();
            },
          }, t('add'))),
      ];
    }, { onClose: () => resolve(result) });
  });
}

// ------------------------------------------------------------------ ticket

/** Bill discounts chosen from Items -> Discounts. */
function appliedDiscounts() {
  return cart.discountIds.map((id) => session.discounts.find((d) => d.id === id)).filter(Boolean);
}

export function totalsFor(c) {
  const discounts = c.discountIds.map((id) => session.discounts.find((d) => d.id === id)).filter(Boolean);
  const s = session.settings;
  const taxes = taxList(s);
  // A line keeps the taxes its item had when it went on the bill; one from a
  // ticket saved before taxes were per item looks its item up now.
  const lines = c.lines.map((l) => (Array.isArray(l.taxIds) ? l : { ...l, taxIds: productTaxIds(session.find(l.barcode), taxes) }));
  const totals = billTotals(lines, {
    discountSen: discounts.filter((d) => d.type === 'AMOUNT').reduce((sum, d) => sum + (d.valueSen || 0), 0),
    discountPct: discounts.filter((d) => d.type === 'PCT').reduce((sum, d) => sum + (Number(d.pct) || 0), 0),
    serviceChargePct: c.orderType === 'DINE_IN' ? Number(s.serviceChargePct) || 0 : 0,
    taxes,
    pricesIncludeTax: s.pricesIncludeTax !== false,
  });
  // Each discount's share, for the receipt and the discounts report; the
  // last absorbs any cap so they add up to what was taken off.
  const subtotal = totals.subtotalSen;
  let left = totals.discountSen;
  const named = discounts.map((d, i) => {
    const want = d.type === 'PCT' ? Math.round((subtotal * (Number(d.pct) || 0)) / 100) : d.valueSen || 0;
    const amount = i === discounts.length - 1 ? left : Math.min(left, want);
    left -= amount;
    return { id: d.id, name: d.name, amountSen: amount };
  });
  return { ...totals, discounts: named, lineTaxIds: lines.map((l) => l.taxIds) };
}

function orderTypes() {
  // Shops set up before modes existed sold over the counter too.
  return ['DINE_IN', 'TAKEAWAY', 'DELIVERY', ...(session.settings.mode === 'FNB' ? [] : ['RETAIL'])];
}

function drawOrderInfo() {
  const fnb = isFnb();
  mount(els.orderInfo,
    fnb ? h('div', { class: 'seg', role: 'group', 'aria-label': t('orderType'), 'data-help': 'order-type' }, orderTypes().map((k) => h('button', {
      class: cart.orderType === k ? 'on' : '',
      onclick: () => { cart.orderType = k; drawTicket(); },
    }, t(`order_${k}`)))) : null,
    cart.table ? h('span', { class: 'tablechip' }, icon('dining', 15), `${t('table')} ${cart.table}`) : null,
    built !== 'market' || cart.customer ? h('button', { onclick: chooseCustomer, 'data-help': 'customer' },
      icon('user', 16), cart.customer ? `${cart.customer.name} · ${cart.customer.points} ${t('points')} ✕` : t('customer')) : null,
    cart.orderId ? h('span', { class: 'pill warn' }, t('savedTicket')) : null,
    h('span', { class: 'branch' }, session.branchName()));
}

/** − 2 + on a line; weighed lines show their weight instead. */
function stepper(line) {
  if (isWeighed(line.unit)) return h('span', {}, `${formatQty(line.qtyMilli)} ${line.unit}`);
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); drawTicket(); };
  return h('span', { class: 'stepper' },
    h('button', { type: 'button', 'aria-label': '−', onclick: stop(() => { if (line.qtyMilli > UNIT) line.qtyMilli -= UNIT; }) }, icon('minus', 14)),
    h('span', {}, formatQty(line.qtyMilli)),
    h('button', { type: 'button', 'aria-label': '+', onclick: stop(() => { line.qtyMilli += UNIT; }) }, icon('plus', 14)));
}

function sumRows(totals, r) {
  return [
    r(t('subtotal'), formatSen(totals.subtotalSen)),
    totals.discounts.map((d) => r(d.name, `-${formatSen(d.amountSen)}`)),
    totals.serviceChargeSen ? r(`${t('serviceCharge')} ${session.settings.serviceChargePct}%`, formatSen(totals.serviceChargeSen)) : null,
    totals.taxes.map((x) => r(`${x.name} ${x.pct}%${totals.taxIncluded ? ` (${t('included')})` : ''}`, formatSen(x.taxSen))),
  ];
}

async function pay() {
  if (!await shiftReady()) return;
  openPayment(cart, totalsFor(cart), {
    onPaid: () => { cart = newCart(); lastAdded = null; drawTicket(); els.scan?.focus(); },
  });
}

function drawTicket() {
  if (!els.lines) return;
  drawOrderInfo();
  const totals = totalsFor(cart);
  const empty = !cart.lines.length;
  const flash = flashKey;
  flashKey = '';
  const r = (label, value, cls = '') => h('div', { class: `r ${cls}` }, h('span', {}, label), h('span', { class: 'num' }, value));

  if (built === 'market') {
    const count = cart.lines.reduce((n, l) => n + (isWeighed(l.unit) ? 1 : l.qtyMilli / UNIT), 0);
    mount(els.lines, empty
      ? h('div', { class: 'empty' }, icon('barcode', 40), h('strong', {}, t('emptyTicket')), h('span', {}, t('qtyHint')))
      : h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, t('name')), h('th', {}, t('quantity')), h('th', { class: 'num' }, t('unitPrice')), h('th', { class: 'num' }, t('amount')))),
        h('tbody', {}, cart.lines.map((line, i) => h('tr', { class: `line${line.key === flash ? ' flash' : ''}`, onclick: () => editLine(i) },
          h('td', { class: 'idx' }, String(i + 1)),
          h('td', {}, h('div', { class: 'n' }, line.name), h('div', { class: 'code' }, line.barcode,
            line.discountSen ? ` · -${formatSen(line.discountSen)}` : '', line.note ? ` · ${line.note}` : '')),
          h('td', {}, stepper(line)),
          h('td', { class: 'num' }, formatSen(line.unitPriceSen)),
          h('td', { class: 'num amt' }, formatSen(lineTotal(line))))))));
    mount(els.last,
      h('span', { class: 'k' }, t('lastScanned')),
      lastAdded
        ? h('div', { class: 'v' }, h('span', {}, lastAdded.name, h('span', { class: 'muted', style: { fontWeight: 500 } },
          `  × ${formatQty(lastAdded.qtyMilli)}${lastAdded.unit ? ` ${lastAdded.unit}` : ''}`)), h('span', { class: 'num' }, formatSen(lastAdded.amountSen)))
        : h('div', { class: 'v muted' }, '—'));
    mount(els.totalLabel, h('span', {}, t('total')), h('span', {}, `${formatQty(Math.round(count * UNIT))} ${t('itemsShort')}`));
    els.total.textContent = rm(totals.totalSen);
    mount(els.sums, sumRows(totals, r));
    mount(els.pay, `${t('charge')} ${rm(totals.totalSen)}`);
    els.pay.disabled = empty;
    els.pay.onclick = pay;
    els.holdKey.disabled = empty;
    els.discKey.disabled = empty || !session.discounts.length;
    els.clearKey.disabled = empty && !cart.orderId;
    els.lines.scrollTop = els.lines.scrollHeight;
    return;
  }

  mount(els.lines, empty
    ? h('div', { class: 'empty' }, icon(isFnb() ? 'dining' : 'cart', 34), h('span', {}, t('emptyTicket')))
    : cart.lines.map((line, index) => h('div', { class: `line${line.key === flash ? ' flash' : ''}`, onclick: () => editLine(index) },
      h('span', { class: 'name' }, line.name, line.sent ? h('span', { class: 'sent', title: t('alreadySent') }, ' ✓') : ''),
      h('span', { class: 'num', style: { fontWeight: 700 } }, formatSen(lineTotal(line))),
      h('span', { class: 'sub' }, stepper(line), `× ${formatSen(line.unitPriceSen)}`,
        line.discountSen ? ` · -${formatSen(line.discountSen)}` : ''),
      h('span', {}),
      line.modifiers.length || line.note
        ? h('span', { class: 'mods' }, line.modifiers.map((m) => m.name).join(', '), line.note ? ` · ${line.note}` : '')
        : null)));

  mount(els.sums, sumRows(totals, r), r(t('total'), rm(totals.totalSen), 'total'));

  const unsent = cart.lines.some((l) => !l.sent);
  mount(els.buttons,
    h('button', { onclick: chooseDiscounts, disabled: empty || !session.discounts.length, 'data-help': 'discount' }, icon('percent', 17), t('discount')),
    kitchenOn()
      ? h('button', { onclick: sendToKitchen, disabled: empty || !unsent, 'data-help': 'kitchen' }, icon('chef', 17), t('sendKitchen'))
      : h('button', { onclick: () => saveTicket(), disabled: empty, 'data-help': 'hold' }, icon('pause', 17), t('saveTicket')),
    h('button', { class: 'danger', onclick: clearTicket, disabled: empty && !cart.orderId, 'data-help': 'clear' }, icon('trash', 17), t('clear')),
    kitchenOn() ? h('button', { onclick: () => saveTicket(), disabled: empty, style: { gridColumn: '1 / -1' }, 'data-help': 'hold' }, icon('pause', 17), t('saveTicket')) : null,
    h('button', { class: 'primary pay', disabled: empty, onclick: pay, 'data-help': 'pay' }, `${t('charge')} ${rm(totals.totalSen)}`));
  if (flash) els.lines.querySelector('.flash')?.scrollIntoView({ block: 'nearest' });
}

function editLine(index) {
  const line = cart.lines[index];
  const canPrice = session.can('POS_MANAGE');
  const weighed = WEIGHED_UNITS.includes((line.unit || '').toLowerCase());
  const qty = h('input', { inputmode: 'decimal', value: formatQty(line.qtyMilli) });
  const price = h('input', { inputmode: 'decimal', value: formatSen(line.unitPriceSen), disabled: !canPrice });
  const disc = h('input', { inputmode: 'decimal', value: line.discountSen ? formatSen(line.discountSen) : '', placeholder: '0.00', disabled: !canPrice });
  const note = h('input', { value: line.note, placeholder: t('notePlaceholder') });
  const step = (d) => {
    const v = (parseQty(qty.value) || 0) + d * UNIT;
    qty.value = formatQty(Math.max(UNIT, v));
  };
  modal((close) => [
    h('h2', {}, line.name),
    line.modifiers.length ? h('p', { class: 'muted', style: { margin: 0 } }, line.modifiers.map((m) => m.name).join(', ')) : null,
    h('label', { class: 'field' }, weighed ? `${t('weight')} (${line.unit})` : t('quantity'),
      weighed ? qty : h('div', { class: 'qtybox' }, h('button', { type: 'button', onclick: () => step(-1) }, '−'), qty, h('button', { type: 'button', onclick: () => step(1) }, '+'))),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, t('unitPrice'), price),
      h('label', { class: 'field' }, t('lineDiscount'), disc)),
    h('label', { class: 'field' }, t('note'), note),
    line.sent ? h('p', { class: 'muted', style: { margin: 0 } }, t('alreadySent')) : null,
    h('div', { class: 'actions' },
      h('button', {
        class: 'danger',
        onclick: () => { cart.lines.splice(index, 1); close(); drawTicket(); },
      }, t('remove')),
      h('span', { class: 'grow' }),
      h('button', { onclick: close }, t('cancel')),
      h('button', {
        class: 'primary',
        onclick: () => {
          const q = parseQty(qty.value);
          const p = parseSen(price.value);
          const d = disc.value.trim() ? parseSen(disc.value) : 0;
          if (!q) return toast(t('errQty'), 'error');
          if (p == null || p < 0 || d == null || d < 0) return toast(t('errAmount'), 'error');
          Object.assign(line, { qtyMilli: q, unitPriceSen: p, discountSen: Math.min(d, lineAmount(q, p)), note: note.value.trim() });
          close();
          drawTicket();
        },
      }, t('save'))),
  ]);
}

function chooseDiscounts() {
  const picked = new Set(cart.discountIds);
  modal((close) => [
    h('h2', {}, t('discount')),
    h('div', { style: { display: 'grid', gap: '8px' } }, session.discounts.map((d) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: picked.has(d.id), onchange: (e) => (e.target.checked ? picked.add(d.id) : picked.delete(d.id)) }),
      d.name, h('span', { class: 'muted' }, d.type === 'PCT' ? ` ${d.pct}%` : ` ${rm(d.valueSen || 0)}`)))),
    h('div', { class: 'actions' },
      h('button', { onclick: close }, t('cancel')),
      h('button', { class: 'primary', onclick: () => { cart.discountIds = [...picked]; close(); drawTicket(); } }, t('apply'))),
  ]);
}

async function clearTicket() {
  if (cart.orderId) {
    const yes = await confirmBox(t('deleteTicketQ'), t('delete'), t('cancel'));
    if (!yes) return;
    deleteDoc(doc(db, ws(`orders/${cart.orderId}`))).catch((e) => toast(e.message, 'error'));
  } else if (cart.lines.length > 3) {
    const yes = await confirmBox(t('clearTicketQ'), t('clear'), t('cancel'));
    if (!yes) return;
  }
  cart = newCart();
  drawTicket();
}

// ----------------------------------------------------- open orders & tables

function orderDoc() {
  return {
    branchId: session.branchId,
    table: cart.table,
    orderType: cart.orderType,
    lines: cart.lines,
    discountIds: cart.discountIds,
    note: cart.note,
    customer: cart.customer,
    openedByUid: session.uid,
    openedByName: session.name,
    updatedAt: Date.now(),
  };
}

async function saveTicket({ quiet = false } = {}) {
  if (!cart.orderId) cart.orderId = doc(collection(db, ws('orders'))).id;
  // Written without waiting: with the internet down it is kept and sent later.
  setDoc(doc(db, ws(`orders/${cart.orderId}`)), orderDoc()).catch((e) => toast(e.message, 'error'));
  if (!quiet) {
    toast(t('ticketSaved'), 'ok');
    cart = newCart();
    drawTicket();
  }
}

function sendToKitchen() {
  const fresh = cart.lines.filter((l) => !l.sent);
  if (!fresh.length) return;
  printView(kitchenView(cart, fresh));
  fresh.forEach((l) => { l.sent = true; });
  saveTicket({ quiet: true });
  toast(t('sentKitchen'), 'ok');
  drawTicket();
}

function loadOrder(order) {
  cart = newCart({
    orderId: order.id,
    table: order.table || '',
    orderType: order.orderType || defaultOrderType(),
    lines: order.lines || [],
    discountIds: order.discountIds || [],
    note: order.note || '',
    customer: order.customer || null,
  });
  drawTicket();
}

async function openTables() {
  if (cart.lines.length && !cart.orderId) {
    const yes = await confirmBox(t('unsavedTicketQ'), t('saveTicket'), t('cancel'));
    if (!yes) return;
    saveTicket({ quiet: true });
  } else if (cart.orderId) {
    saveTicket({ quiet: true });
  }
  modal((close) => [
    h('h2', {}, t('tables')),
    h('div', { class: 'tables' }, (session.settings.tables || []).map((name) => {
      const order = openOrders.find((o) => o.table === name);
      const total = order ? totalsFor({ ...newCart(), ...order, discountIds: order.discountIds || [] }).totalSen : 0;
      return h('button', {
        class: order ? 'busy' : '',
        onclick: () => {
          close();
          if (order) loadOrder(order);
          else { cart = newCart({ table: name, orderType: 'DINE_IN' }); drawTicket(); }
        },
      }, name, h('small', {}, order ? rm(total) : t('free')));
    })),
    h('div', { class: 'actions' }, h('button', { onclick: close }, t('close'))),
  ], { wide: true });
}

function openTicketsList() {
  modal((close) => [
    h('h2', {}, t('openTickets')),
    openOrders.length
      ? h('table', { class: 'list' }, h('tbody', {}, openOrders
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .map((o) => h('tr', { class: 'click', onclick: () => { close(); loadOrder(o); } },
          h('td', {}, o.table ? `${t('table')} ${o.table}` : t(`order_${o.orderType || 'RETAIL'}`)),
          h('td', { class: 'muted' }, `${(o.lines || []).length} ${t('itemsCount')} · ${o.openedByName || ''}`),
          h('td', { class: 'num' }, rm(totalsFor({ ...newCart(), ...o, discountIds: o.discountIds || [] }).totalSen))))))
      : h('p', { class: 'muted' }, t('noOpenTickets')),
    h('div', { class: 'actions' }, h('button', { onclick: close }, t('close'))),
  ], { wide: true });
}

export { paymentLabel };
