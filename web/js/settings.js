/**
 * Register settings, stored in pos/settings and shared by every till in the
 * company -- except "This device", which is about this computer only.
 */
import { db, doc, setDoc } from './fb.js';
import { h, local, mount, toast } from './dom.js';
import { getLang, paymentLabel, t } from './i18n.js';
import { DEFAULT_SETTINGS, session, ws } from './session.js';
import { menuButton } from './main.js';
import { taxList } from './money.js';
import { chosenMode, modeCards } from './modes.js';
import { choosePrinter, directName, directReady, directSupported, forget, openDrawer, printDirect } from './rawprint.js';
import { listTills, removeTill, tillId } from './tills.js';
import { MODULES } from './modules.js';

export function render(main, sub) {
  const pages = { features, payments, taxes, loyalty, receipt, stores, device, addons };
  (pages[sub] || features)(main);
  return null;
}

const canEdit = () => session.can('POS_MANAGE');

function page(main, title, fields, onSave, { wide = false } = {}) {
  const save = h('button', { class: 'primary', disabled: !canEdit() }, t('save'));
  save.onclick = async () => {
    const patch = onSave();
    if (!patch) return;
    save.disabled = true;
    try {
      await setDoc(doc(db, ws('pos/settings')), { ...DEFAULT_SETTINGS, ...session.settings, ...patch, updatedAt: Date.now() });
      toast(t('saved'), 'ok');
    } catch (err) {
      toast(err.message || String(err), 'error');
    }
    save.disabled = false;
  };
  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, title)),
    !canEdit() ? h('p', { class: 'muted' }, t('settingsReadOnly')) : null,
    h('div', { class: 'card', style: { display: 'grid', gap: '14px', maxWidth: wide ? '980px' : '640px' } }, fields, h('div', { class: 'actions' }, save)));
}

function features(main) {
  const s = session.settings;
  let mode = chosenMode(s) || s.mode;
  const cards = h('div', { class: 'modepick', style: { padding: 0, minHeight: 0, justifyItems: 'stretch' } });
  const kitchen = h('input', { type: 'checkbox', checked: s.kitchenTicket !== false });
  const tables = h('textarea', { rows: 3 }, (s.tables || []).join(', '));
  const requireShift = h('input', { type: 'checkbox', checked: s.requireShift === true });
  // Tables and kitchen tickets only mean something to a restaurant.
  const fnbOnly = h('div', { style: { display: 'grid', gap: '14px' } },
    h('label', { class: 'check' }, kitchen, t('kitchenTicketOpt')),
    h('label', { class: 'field' }, t('tableNames'), tables),
    h('p', { class: 'muted', style: { margin: 0 } }, t('tableNamesHelp')));
  const drawCards = () => {
    mount(cards, modeCards(mode, (m) => { mode = m; drawCards(); }));
    fnbOnly.classList.toggle('hidden', mode === 'SUPERMARKET' || mode === 'RETAIL');
  };
  drawCards();
  page(main, t('setFeatures'), [
    h('h3', { style: { margin: 0 } }, t('businessType')),
    cards,
    h('p', { class: 'muted', style: { margin: 0 } }, t('modeHelp')),
    fnbOnly,
    h('label', { class: 'check' }, requireShift, t('requireShift')),
    h('p', { class: 'muted', style: { margin: 0 } }, t('requireShiftHelp')),
  ], () => ({
    mode,
    requireShift: requireShift.checked,
    kitchenTicket: kitchen.checked,
    tables: tables.value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean),
  }), { wide: true });
}

function payments(main) {
  const builtIn = ['CASH', 'QR', 'CARD', 'EWALLET', 'TRANSFER'];
  const chosen = new Set(session.settings.paymentMethods || []);
  const custom = h('input', { value: [...chosen].filter((m) => !builtIn.includes(m)).join(', '), placeholder: 'GrabPay, Boost, Voucher' });
  page(main, t('setPayments'), [
    builtIn.map((m) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: chosen.has(m), onchange: (e) => (e.target.checked ? chosen.add(m) : chosen.delete(m)) }),
      paymentLabel(m))),
    h('label', { class: 'field' }, t('customPayments'), custom),
  ], () => {
    const list = [...builtIn.filter((m) => chosen.has(m)), ...custom.value.split(',').map((x) => x.trim()).filter(Boolean)];
    if (!list.length) { toast(t('errNoPayment'), 'error'); return null; }
    return { paymentMethods: list };
  });
}

function taxes(main) {
  const s = session.settings;
  // Editable copies; the first save turns an old single tax into this list.
  const rows = taxList(s).map((x) => ({ ...x }));
  const list = h('div', { style: { display: 'grid', gap: '10px' } });
  const drawRows = () => mount(list,
    rows.length ? rows.map((x, i) => h('div', { class: 'card', style: { display: 'grid', gap: '8px', padding: '12px' } },
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, t('taxName'), h('input', { value: x.name, oninput: (e) => { x.name = e.target.value; } })),
        h('label', { class: 'field' }, t('taxRate'), h('input', { inputmode: 'decimal', value: String(x.pct), oninput: (e) => { x.pct = e.target.value; } }))),
      h('div', { class: 'row' },
        h('label', { class: 'check grow' }, h('input', { type: 'checkbox', checked: x.byDefault, onchange: (e) => { x.byDefault = e.target.checked; } }), t('taxDefault')),
        h('button', { type: 'button', class: 'danger', onclick: () => { rows.splice(i, 1); drawRows(); } }, t('delete')))))
      : h('p', { class: 'muted', style: { margin: 0 } }, t('noTaxes')));
  drawRows();
  const addBtn = h('button', { type: 'button', onclick: () => {
    rows.push({ id: `tax-${Date.now().toString(36)}`, name: 'SST', pct: 8, byDefault: !rows.some((r) => r.byDefault) });
    drawRows();
  } }, t('addTax'));
  const incl = h('select', {},
    h('option', { value: 'yes', selected: s.pricesIncludeTax !== false }, t('pricesInclude')),
    h('option', { value: 'no', selected: s.pricesIncludeTax === false }, t('pricesExclude')));
  const service = h('input', { inputmode: 'decimal', value: String(s.serviceChargePct ?? 0) });
  page(main, t('setTaxes'), [
    h('p', { class: 'muted', style: { margin: 0 } }, t('taxesHelp')),
    list,
    h('div', {}, addBtn),
    h('label', { class: 'field' }, t('taxMode'), incl),
    h('label', { class: 'field' }, t('serviceChargeRate'), service),
    h('p', { class: 'muted', style: { margin: 0 } }, t('serviceChargeHelp')),
  ], () => {
    const sc = Number(service.value);
    const out = [];
    for (const r of rows) {
      const pct = Number(r.pct);
      if (!String(r.name).trim()) { toast(t('errTaxName'), 'error'); return null; }
      if (!(pct > 0 && pct <= 100)) { toast(t('errPercent'), 'error'); return null; }
      out.push({ id: r.id, name: String(r.name).trim(), pct, byDefault: !!r.byDefault });
    }
    if (!(sc >= 0 && sc <= 100)) { toast(t('errPercent'), 'error'); return null; }
    // taxPct stays at 0 so nothing still reading the old single rate charges it twice.
    return { taxes: out, taxPct: 0, pricesIncludeTax: incl.value === 'yes', serviceChargePct: sc };
  });
}

function loyalty(main) {
  const s = session.settings;
  const on = h('input', { type: 'checkbox', checked: !!s.loyaltyEnabled });
  const earn = h('input', { inputmode: 'decimal', value: String(s.pointsPerRinggit ?? 1) });
  const worth = h('input', { inputmode: 'decimal', value: String(s.pointValueSen ?? 1) });
  const min = h('input', { inputmode: 'numeric', value: String(s.minRedeemPoints ?? 100) });
  page(main, t('setLoyalty'), [
    h('label', { class: 'check' }, on, t('loyaltyOn')),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, t('pointsPerRinggit'), earn),
      h('label', { class: 'field' }, t('pointValueSen'), worth)),
    h('label', { class: 'field' }, t('minRedeemPoints'), min),
    h('p', { class: 'muted', style: { margin: 0 } }, t('loyaltyHelp')),
  ], () => {
    const e = Number(earn.value);
    const w = Number(worth.value);
    const m = parseInt(min.value, 10);
    if (!(e >= 0) || !(w >= 0) || !(m >= 0)) { toast(t('errAmount'), 'error'); return null; }
    return { loyaltyEnabled: on.checked, pointsPerRinggit: e, pointValueSen: w, minRedeemPoints: m };
  });
}

function receipt(main) {
  const s = session.settings;
  const f = (key, placeholder = '') => h('input', { value: s[key] || '', placeholder });
  const shopName = f('shopName', session.companyName);
  const regNo = f('regNo', 'SSM 202601234567');
  const address = h('textarea', { rows: 2 }, s.address || '');
  const phone = f('phone');
  const sstNo = f('sstNo');
  const footer = h('textarea', { rows: 2 }, s.footer || '');
  const width = h('select', {}, [80, 58].map((w) => h('option', { value: w, selected: Number(s.paperWidth) === w }, `${w} mm`)));
  const auto = h('input', { type: 'checkbox', checked: s.autoPrint !== false });
  const drawer = h('input', { type: 'checkbox', checked: s.drawerOnCash !== false });
  const tin = f('tin', 'C12345678090');
  const msic = f('msic', '47111');
  const msicName = f('msicName', 'Retail sale in non-specialised stores');
  const email = f('email');
  page(main, t('setReceipt'), [
    h('label', { class: 'field' }, t('shopName'), shopName),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('regNo'), regNo), h('label', { class: 'field' }, t('sstNo'), sstNo)),
    h('label', { class: 'field' }, t('address'), address),
    h('label', { class: 'field' }, t('phone'), phone),
    h('label', { class: 'field' }, t('receiptFooter'), footer),
    h('label', { class: 'field' }, t('paperWidth'), width),
    h('label', { class: 'check' }, auto, t('autoPrint')),
    h('label', { class: 'check' }, drawer, t('drawerOnCash')),
    h('h3', { style: { margin: '8px 0 0' } }, t('einvoiceSeller')),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('tin'), tin), h('label', { class: 'field' }, t('email'), email)),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('msic'), msic), h('label', { class: 'field' }, t('msicName'), msicName)),
  ], () => ({
    shopName: shopName.value.trim(), regNo: regNo.value.trim(), address: address.value.trim(), phone: phone.value.trim(),
    sstNo: sstNo.value.trim(), footer: footer.value.trim(), paperWidth: Number(width.value), autoPrint: auto.checked,
    drawerOnCash: drawer.checked, tin: tin.value.trim().toUpperCase(), msic: msic.value.trim(), msicName: msicName.value.trim(), email: email.value.trim(),
  }));
}

function stores(main) {
  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('setStores'))),
    h('p', { class: 'muted' }, t('storesHelp')),
    h('table', { class: 'list', style: { maxWidth: '640px' } }, h('tbody', {},
      [{ id: '', name: t('mainShop') }, ...session.branches].map((b) => h('tr', {},
        h('td', {}, b.name),
        h('td', {}, b.active === false ? h('span', { class: 'pill bad' }, t('closed')) : ''),
        h('td', { class: 'num' }, b.id === session.branchId ? h('span', { class: 'pill good' }, t('thisTill')) : ''))))));
}

function device(main) {
  const options = session.sellableBranches();
  const branch = h('select', {}, options.map((b) => h('option', { value: b.id, selected: b.id === session.branchId }, b.name)));
  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('setDevice'))),
    h('div', { class: 'card', style: { display: 'grid', gap: '14px', maxWidth: '640px' } },
      h('label', { class: 'field' }, t('tillBranch'), branch),
      h('div', { class: 'actions' }, h('button', {
        class: 'primary',
        onclick: () => { session.setBranch(branch.value); toast(t('saved'), 'ok'); },
      }, t('save')))),
    printerCard(),
    tillsCard(),
    h('div', { class: 'card', style: { maxWidth: '640px', marginTop: '16px' } },
      h('h2', {}, t('printerSetup')),
      h('ol', {}, t('printerSteps').split('\n').map((line) => h('li', {}, line))),
      h('h2', {}, t('scannerSetup')),
      h('p', {}, t('scannerHelp'))));
}

/** This computer's receipt printer: through the browser, or straight to it (and the drawer). */
function printerCard() {
  const status = h('p', { style: { margin: 0 } });
  const draw = () => {
    mount(status, directReady() ? h('span', { class: 'pill good' }, `${t('printerConnected')}: ${directName()}`) : h('span', { class: 'muted' }, t('printerNone')));
    actions.classList.toggle('hidden', !directReady());
  };
  const connect = (kind) => async () => {
    try { await choosePrinter(kind); local.set('pos.printer', 'direct'); toast(t('printerConnected'), 'ok'); } catch (err) { if (err?.name !== 'NotFoundError') toast(err.message || String(err), 'error'); }
    draw();
  };
  const actions = h('div', { class: 'row' },
    h('button', { onclick: () => printDirect(testSale(), { openDrawer: false }).catch((e) => toast(e.message, 'error')) }, t('printerTest')),
    h('button', { onclick: () => openDrawer().catch((e) => toast(e.message, 'error')) }, t('openDrawer')),
    h('button', { onclick: async () => { await forget(); local.set('pos.printer', 'browser'); draw(); } }, t('printerForget')));
  const card = h('div', { class: 'card', style: { display: 'grid', gap: '12px', maxWidth: '640px', marginTop: '16px' } },
    h('h2', { style: { margin: 0 } }, t('printerTitle')),
    h('p', { class: 'muted', style: { margin: 0 } }, t('printerHelp')),
    status,
    directSupported() ? h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: connect('usb') }, t('printerConnectUsb')),
      h('button', { onclick: connect('serial') }, t('printerConnectSerial'))) : null,
    actions);
  draw();
  return card;
}

const testSale = () => ({
  receiptNo: 'TEST', createdAt: Date.now(), cashierName: session.name,
  lines: [{ name: 'Test item', qtyMilli: 1000, unitPriceSen: 100, lineTotalSen: 100 }],
  subtotalSen: 100, totalSen: 100, payments: [{ method: 'CASH', amountSen: 100 }], taxes: [],
});

/** The tills this company's plan counts, for a plan with a till limit. */
function tillsCard() {
  const box = h('div');
  const card = h('div', { class: 'card', style: { maxWidth: '640px', marginTop: '16px' } }, h('h2', {}, t('tills')), box);
  const draw = async () => {
    const limit = session.plan?.tills;
    if (!limit || limit >= 1e9) { card.classList.add('hidden'); return; }
    const list = await listTills();
    mount(box,
      h('p', { class: 'muted' }, `${list.length} / ${limit}`),
      h('table', { class: 'list' }, h('tbody', {}, list.map((x) => h('tr', {},
        h('td', {}, x.name || x.id, x.id === tillId() ? h('span', { class: 'pill good', style: { marginLeft: '8px' } }, t('thisTill')) : ''),
        h('td', { class: 'num' }, session.can('POS_MANAGE') && x.id !== tillId()
          ? h('button', { class: 'danger', onclick: async () => { await removeTill(x.id); draw(); } }, t('removeTill')) : ''))))));
  };
  draw().catch(() => card.classList.add('hidden'));
  return card;
}

/**
 * Settings -> Add more: what the company has, what it can add as the
 * business grows, and what is coming. Customer words only; switching a
 * part on is a plan change, so it is asked for, not toggled here.
 */
function addons(main) {
  const lang = getLang();
  const order = ['stocktake', 'pos', 'warehouse', 'api', 'ecommerce', 'accounting', 'delivery'];
  const card = (id) => {
    const m = MODULES[id];
    const on = session.has(id);
    const state = m.status === 'planned' ? ['pill', t('addonSoon')] : on ? ['pill good', t('addonOn')] : ['pill warn', t('addonAvailable')];
    return h('div', { class: `addon${on ? ' on' : ''}` },
      h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'baseline' } },
        h('strong', {}, m.name[lang] || m.name.en), h('span', { class: state[0] }, state[1])),
      h('p', { class: 'muted', style: { margin: 0 } }, t(`addonAsk_${id}`)),
      h('p', { style: { margin: 0 } }, t(`addonWhat_${id}`)));
  };
  const core = order.filter((id) => MODULES[id].kind === 'core');
  const extra = order.filter((id) => MODULES[id].kind === 'addon');
  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('setAddons'))),
    h('p', { class: 'muted', style: { maxWidth: '62ch' } }, t('addonsLead')),
    h('h2', {}, t('addonsYouHave')),
    h('div', { class: 'addons' }, core.map(card)),
    h('h2', { style: { marginTop: '22px' } }, t('addonsGrow')),
    h('div', { class: 'addons' }, extra.map(card)),
    h('p', { class: 'muted', style: { marginTop: '16px' } }, t('addonsHow')));
  return null;
}
