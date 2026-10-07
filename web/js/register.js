/**
 * The cash register.
 *
 * Retail: scan with a USB scanner (it types the barcode and presses Enter),
 * or tap a product; pay; the receipt prints. Restaurant: pick a table, add
 * dishes with their modifiers, send to the kitchen, add more, pay at the end.
 * Both work on the same screen; Settings -> Features hides what a shop does
 * not use.
 */
import { collection, db, doc, deleteDoc, onSnapshot, query, setDoc, where } from './fb.js';
import { confirmBox, h, modal, mount, toast } from './dom.js';
import { t, paymentLabel } from './i18n.js';
import { billTotals, formatQty, formatSen, lineAmount, lineTotal, parseQty, parseSen, rm, UNIT } from './money.js';
import { onChange, session, ws } from './session.js';
import { kitchenView, printView } from './receipt.js';
import { openPayment } from './pay.js';
import { menuButton } from './main.js';

const WEIGHED_UNITS = ['kg', 'g', 'l', 'ml', 'm'];

/** The bill being built. */
let cart = newCart();
let category = '';
let search = '';
let openOrders = [];

function newCart(extra = {}) {
  return { orderId: '', table: '', orderType: defaultOrderType(), lines: [], discountIds: [], note: '', ...extra };
}

function defaultOrderType() {
  return session.settings.mode === 'FNB' ? 'DINE_IN' : 'RETAIL';
}

let root;
let els = {};

export function render(main) {
  root = main;
  cart = newCart();
  category = '';
  search = '';

  els.search = h('input', { type: 'search', placeholder: t('searchProducts'), oninput: (e) => { search = e.target.value; drawTiles(); } });
  els.scan = h('input', {
    class: 'scan', placeholder: t('scanHere'), autocomplete: 'off', autofocus: true,
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const code = els.scan.value.trim();
        els.scan.value = '';
        if (code) addByCode(code);
      }
    },
  });
  els.online = h('div', { class: `offline${navigator.onLine ? ' hidden' : ''}` }, t('offlineNote'));
  els.chips = h('div', { class: 'chips' });
  els.tiles = h('div', { class: 'tiles' });
  els.orderInfo = h('div', { class: 'row' });
  els.lines = h('div', { class: 'lines' });
  els.sums = h('div', { class: 'sums' });
  els.buttons = h('div', { class: 'buttons' });
  els.openCount = h('span', { class: 'pill' }, '0');

  const fnb = session.settings.mode !== 'RETAIL';
  const bar = h('div', { class: 'bar' },
    menuButton(),
    els.search,
    h('span', { class: 'grow' }),
    fnb ? h('button', { onclick: openTables }, `🍽 ${t('tables')}`) : null,
    h('button', { onclick: openTicketsList }, `🧾 ${t('openTickets')} `, els.openCount));

  mount(root,
    h('div', { class: 'register' },
      h('section', { class: 'catalog' }, els.online, bar, els.chips, els.tiles),
      h('section', { class: 'ticket' },
        h('div', { class: 'head' }, els.scan, els.orderInfo),
        els.lines, els.sums, els.buttons)));

  drawAll();

  // A USB scanner is a keyboard. Whatever is focused, a scan should land in
  // the scan box -- unless somebody is typing in another field or a dialog.
  const onKey = (e) => {
    if (document.querySelector('.backdrop')) return;
    const target = e.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (!typing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      els.scan.focus();
    }
  };
  document.addEventListener('keydown', onKey);
  const goOnline = () => els.online.classList.toggle('hidden', navigator.onLine);
  window.addEventListener('online', goOnline);
  window.addEventListener('offline', goOnline);
  const stopChange = onChange(() => drawAll());

  const ordersQuery = session.branchIds.length || session.branchId
    ? query(collection(db, ws('orders')), where('branchId', '==', session.branchId))
    : collection(db, ws('orders'));
  const stopOrders = onSnapshot(ordersQuery, (snap) => {
    openOrders = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((o) => (o.branchId || '') === session.branchId);
    els.openCount.textContent = String(openOrders.length);
  }, (err) => console.warn('orders', err));

  return () => {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('online', goOnline);
    window.removeEventListener('offline', goOnline);
    stopChange();
    stopOrders();
  };
}

// ------------------------------------------------------------------ catalog

function sellable() {
  return session.products.filter((p) => p.active !== false);
}

function drawAll() {
  drawChips();
  drawTiles();
  drawTicket();
}

function drawChips() {
  const cats = session.categories;
  const chip = (id, label) => h('button', {
    class: category === id ? 'on' : '',
    onclick: () => { category = id; drawChips(); drawTiles(); },
  }, label);
  mount(els.chips, chip('', t('all')), cats.map((c) => chip(c.id, c.name)));
  els.chips.classList.toggle('hidden', cats.length === 0);
}

function drawTiles() {
  const q = search.trim().toLowerCase();
  const list = sellable()
    .filter((p) => !category || p.category === category)
    .filter((p) => !q || (p.name || '').toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
    .sort((a, b) => (a.name || a.barcode).localeCompare(b.name || b.barcode))
    .slice(0, 300);
  if (!list.length) {
    mount(els.tiles, h('p', { class: 'muted' }, session.products.length ? t('noMatch') : t('noProductsYet')));
    return;
  }
  mount(els.tiles, list.map((p) => {
    const cat = session.categories.find((c) => c.id === p.category);
    return h('button', { class: 'tile', onclick: () => addProduct(p) },
      h('div', {
        class: 'pic',
        style: p.photoUrl ? { backgroundImage: `url("${p.photoUrl}")` } : { background: cat?.color || '' },
      }, p.photoUrl ? '' : (p.name || p.barcode).slice(0, 2)),
      h('div', { class: 'info' },
        h('span', { class: 'n' }, p.name || p.barcode),
        h('span', { class: 'p' }, p.priceSen != null ? rm(p.priceSen) : t('noPrice'))));
  }));
}

// ---------------------------------------------------------------- adding

function addByCode(code) {
  const product = session.find(code);
  if (!product) {
    toast(`${t('notFound')}: ${code}`, 'error');
    beep();
    return;
  }
  addProduct(product);
}

async function addProduct(product) {
  let price = product.priceSen;
  if (price == null) {
    price = await askAmount(t('enterPrice'), product.name || product.barcode);
    if (price == null) return;
  }
  let qty = UNIT;
  if (WEIGHED_UNITS.includes((product.unit || '').toLowerCase())) {
    qty = await askQty(product);
    if (qty == null) return;
  }
  let modifiers = [];
  const groups = (product.modifierIds || []).map((id) => session.modifiers.find((m) => m.id === id)).filter(Boolean);
  if (groups.length) {
    modifiers = await askModifiers(product, groups);
    if (modifiers == null) return;
  }
  const unitPriceSen = price + modifiers.reduce((s, m) => s + (m.priceSen || 0), 0);

  // Same product, same options, not yet sent to the kitchen: one line, more of it.
  const sameKey = `${product.barcode}|${modifiers.map((m) => m.name).join(',')}|${unitPriceSen}`;
  const existing = cart.lines.find((l) => l.key === sameKey && !l.sent && !l.note && !WEIGHED_UNITS.includes((product.unit || '').toLowerCase()));
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
      sent: false,
    });
  }
  drawTicket();
  els.scan.focus();
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
  const totals = billTotals(c.lines, {
    discountSen: discounts.filter((d) => d.type === 'AMOUNT').reduce((sum, d) => sum + (d.valueSen || 0), 0),
    discountPct: discounts.filter((d) => d.type === 'PCT').reduce((sum, d) => sum + (Number(d.pct) || 0), 0),
    serviceChargePct: c.orderType === 'DINE_IN' ? Number(s.serviceChargePct) || 0 : 0,
    taxPct: Number(s.taxPct) || 0,
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
  return { ...totals, discounts: named };
}

function drawTicket() {
  const fnb = session.settings.mode !== 'RETAIL';
  mount(els.orderInfo,
    fnb ? h('select', {
      style: { width: 'auto' },
      onchange: (e) => { cart.orderType = e.target.value; drawTicket(); },
    }, ['RETAIL', 'DINE_IN', 'TAKEAWAY', 'DELIVERY'].filter((k) => k !== 'RETAIL' || session.settings.mode === 'BOTH')
      .map((k) => h('option', { value: k, selected: cart.orderType === k }, t(`order_${k}`)))) : null,
    cart.table ? h('span', { class: 'pill good' }, `${t('table')} ${cart.table}`) : null,
    cart.orderId ? h('span', { class: 'pill' }, t('savedTicket')) : null,
    h('span', { class: 'grow' }),
    h('span', { class: 'muted', style: { fontSize: '13px' } }, session.branchName()));

  if (!cart.lines.length) {
    mount(els.lines, h('div', { class: 'empty' }, t('emptyTicket')));
  } else {
    mount(els.lines, cart.lines.map((line, index) => h('div', { class: 'line', onclick: () => editLine(index) },
      h('span', { class: 'name' }, line.name, line.sent ? h('span', { class: 'muted' }, ' ✓') : ''),
      h('span', { class: 'num' }, formatSen(lineTotal(line))),
      h('span', { class: 'muted' }, `${formatQty(line.qtyMilli)}${line.unit && WEIGHED_UNITS.includes(line.unit.toLowerCase()) ? ` ${line.unit}` : ''} × ${formatSen(line.unitPriceSen)}`,
        line.discountSen ? ` · -${formatSen(line.discountSen)}` : ''),
      h('span', {}),
      line.modifiers.length || line.note
        ? h('span', { class: 'mods' }, line.modifiers.map((m) => m.name).join(', '), line.note ? ` · ${line.note}` : '')
        : null)));
  }

  const totals = totalsFor(cart);
  const r = (label, value, cls = '') => h('div', { class: `r ${cls}` }, h('span', {}, label), h('span', { class: 'num' }, value));
  mount(els.sums,
    r(t('subtotal'), formatSen(totals.subtotalSen)),
    totals.discounts.map((d) => r(d.name, `-${formatSen(d.amountSen)}`)),
    totals.serviceChargeSen ? r(`${t('serviceCharge')} ${session.settings.serviceChargePct}%`, formatSen(totals.serviceChargeSen)) : null,
    totals.taxSen ? r(`${session.settings.taxName || t('tax')} ${session.settings.taxPct}%${totals.taxIncluded ? ` (${t('included')})` : ''}`, formatSen(totals.taxSen)) : null,
    r(t('total'), rm(totals.totalSen), 'total'));

  const empty = !cart.lines.length;
  const unsent = cart.lines.some((l) => !l.sent);
  mount(els.buttons,
    h('button', { onclick: chooseDiscounts, disabled: empty || !session.discounts.length }, `🏷 ${t('discount')}`),
    fnb && session.settings.kitchenTicket !== false
      ? h('button', { onclick: sendToKitchen, disabled: empty || !unsent }, `🍳 ${t('sendKitchen')}`)
      : h('button', { onclick: saveTicket, disabled: empty }, `💾 ${t('saveTicket')}`),
    h('button', { class: 'danger', onclick: clearTicket, disabled: empty && !cart.orderId }, t('clear')),
    fnb && session.settings.kitchenTicket !== false ? h('button', { onclick: saveTicket, disabled: empty, style: { gridColumn: '1 / -1' } }, `💾 ${t('saveTicket')}`) : null,
    h('button', {
      class: 'primary pay', disabled: empty,
      onclick: () => openPayment(cart, totalsFor(cart), {
        onPaid: () => { cart = newCart(); drawTicket(); els.scan.focus(); },
      }),
    }, `${t('charge')} ${rm(totals.totalSen)}`));
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
