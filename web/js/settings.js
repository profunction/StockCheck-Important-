/**
 * Register settings, stored in pos/settings and shared by every till in the
 * company -- except "This device", which is about this computer only.
 */
import { db, doc, setDoc } from './fb.js';
import { h, mount, toast } from './dom.js';
import { paymentLabel, t } from './i18n.js';
import { DEFAULT_SETTINGS, session, ws } from './session.js';
import { menuButton } from './main.js';

export function render(main, sub) {
  const pages = { features, payments, taxes, loyalty, receipt, stores, device };
  (pages[sub] || features)(main);
  return null;
}

const canEdit = () => session.can('POS_MANAGE');

function page(main, title, fields, onSave) {
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
    h('div', { class: 'card', style: { display: 'grid', gap: '14px', maxWidth: '640px' } }, fields, h('div', { class: 'actions' }, save)));
}

function features(main) {
  const s = session.settings;
  const mode = h('select', {},
    ['RETAIL', 'FNB', 'BOTH'].map((m) => h('option', { value: m, selected: s.mode === m }, t(`mode_${m}`))));
  const kitchen = h('input', { type: 'checkbox', checked: s.kitchenTicket !== false });
  const tables = h('textarea', { rows: 3 }, (s.tables || []).join(', '));
  page(main, t('setFeatures'), [
    h('label', { class: 'field' }, t('businessType'), mode),
    h('p', { class: 'muted', style: { margin: 0 } }, t('modeHelp')),
    h('label', { class: 'check' }, kitchen, t('kitchenTicketOpt')),
    h('label', { class: 'field' }, t('tableNames'), tables),
    h('p', { class: 'muted', style: { margin: 0 } }, t('tableNamesHelp')),
  ], () => ({
    mode: mode.value,
    kitchenTicket: kitchen.checked,
    tables: tables.value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean),
  }));
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
  const name = h('input', { value: s.taxName || 'SST' });
  const pct = h('input', { inputmode: 'decimal', value: String(s.taxPct ?? 0) });
  const incl = h('select', {},
    h('option', { value: 'yes', selected: s.pricesIncludeTax !== false }, t('pricesInclude')),
    h('option', { value: 'no', selected: s.pricesIncludeTax === false }, t('pricesExclude')));
  const service = h('input', { inputmode: 'decimal', value: String(s.serviceChargePct ?? 0) });
  page(main, t('setTaxes'), [
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('taxName'), name), h('label', { class: 'field' }, t('taxRate'), pct)),
    h('label', { class: 'field' }, t('taxMode'), incl),
    h('label', { class: 'field' }, t('serviceChargeRate'), service),
    h('p', { class: 'muted', style: { margin: 0 } }, t('serviceChargeHelp')),
  ], () => {
    const tax = Number(pct.value);
    const sc = Number(service.value);
    if (!(tax >= 0 && tax <= 100) || !(sc >= 0 && sc <= 100)) { toast(t('errPercent'), 'error'); return null; }
    return { taxName: name.value.trim() || 'SST', taxPct: tax, pricesIncludeTax: incl.value === 'yes', serviceChargePct: sc };
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
  page(main, t('setReceipt'), [
    h('label', { class: 'field' }, t('shopName'), shopName),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('regNo'), regNo), h('label', { class: 'field' }, t('sstNo'), sstNo)),
    h('label', { class: 'field' }, t('address'), address),
    h('label', { class: 'field' }, t('phone'), phone),
    h('label', { class: 'field' }, t('receiptFooter'), footer),
    h('label', { class: 'field' }, t('paperWidth'), width),
    h('label', { class: 'check' }, auto, t('autoPrint')),
  ], () => ({
    shopName: shopName.value.trim(), regNo: regNo.value.trim(), address: address.value.trim(), phone: phone.value.trim(),
    sstNo: sstNo.value.trim(), footer: footer.value.trim(), paperWidth: Number(width.value), autoPrint: auto.checked,
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
    h('div', { class: 'card', style: { maxWidth: '640px', marginTop: '16px' } },
      h('h2', {}, t('printerSetup')),
      h('ol', {}, t('printerSteps').split('\n').map((line) => h('li', {}, line))),
      h('h2', {}, t('scannerSetup')),
      h('p', {}, t('scannerHelp'))));
}
