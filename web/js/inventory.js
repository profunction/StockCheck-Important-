/**
 * Inventory: stock on hand, adjustments, suppliers, purchase orders and
 * transfers between branches.
 *
 * Everything that changes stock is a movement -- the same documents the
 * Stock Check app writes -- so the app and the website always agree.
 */
import { collection, db, deleteDoc, doc, getDocs, limit, orderBy, query, setDoc, where, writeBatch } from './fb.js';
import { confirmBox, dateTime, h, modal, mount, toast } from './dom.js';
import { t } from './i18n.js';
import { formatQty, formatSen, parseQty, parseSen, receiptNo, rm } from './money.js';
import { isLow } from './ledger.js';
import { branchQuery, levelsFor, loadStockData } from './stockdata.js';
import { session, ws } from './session.js';
import { menuButton } from './main.js';
import { scanWithCamera } from './camera.js';

export function render(main, sub) {
  const pages = { levels: levelsPage, adjust: adjustPage, purchase: purchasePage, transfers: transferPage, suppliers: supplierPage };
  (pages[sub] || levelsPage)(main);
  return null;
}

const head = (title, ...extra) => h('div', { class: 'page-head' }, menuButton(), h('h1', {}, title), h('span', { class: 'grow' }), ...extra);
const canMove = () => session.can('RECORD_STOCK_MOVEMENTS');
const allBranches = () => [{ id: '', name: t('mainShop') }, ...session.branches.filter((b) => b.active !== false)];
const productFor = (text) => session.find(text) ||
  session.products.find((p) => (p.name || '').toLowerCase() === String(text).trim().toLowerCase()) || null;

function movement(p, type, qtyMilli, branchId, reference, note) {
  const now = Date.now();
  return {
    barcode: p.barcode, productName: p.name || '', branchId, type, quantityMilli: qtyMilli, at: now,
    source: 'MANUAL', reference, note, createdByUid: session.uid, createdByName: session.name, createdAt: now,
  };
}

// --------------------------------------------------------------- stock levels

function levelsPage(main) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  let data = null;
  let branch = 'ALL';
  let filter = 'all';
  let q = '';
  const catalogue = new Map(session.products.map((p) => [p.barcode, p]));

  const draw = () => {
    if (!data) return;
    let rows = levelsFor(data, branch, catalogue);
    if (filter === 'low') rows = rows.filter(isLow);
    if (filter === 'uncounted') rows = rows.filter((r) => r.counted == null);
    const text = q.trim().toLowerCase();
    if (text) rows = rows.filter((r) => (r.name || '').toLowerCase().includes(text) || r.key.toLowerCase().includes(text));
    const value = rows.reduce((s, r) => s + Math.max(0, r.onHand) * (catalogue.get(r.key)?.costSen || 0) / 1000, 0);
    mount(box,
      h('div', { class: 'cards' },
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('itemsCount')), h('div', { class: 'value' }, String(rows.length))),
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('lowStock')), h('div', { class: 'value' }, String(rows.filter(isLow).length))),
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, t('stockValue')), h('div', { class: 'value' }, rm(Math.round(value))))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, [[t('name')], [t('lastCount')], [t('inSince'), 1], [t('outSince'), 1], [t('onHand'), 1]].map(([x, n]) => h('th', { class: n ? 'num' : '' }, x)))),
        h('tbody', {}, rows.slice(0, 1000).map((r) => h('tr', {},
          h('td', {}, h('div', {}, r.name || r.key), h('div', { class: 'muted', style: { fontSize: '12px' } }, r.barcode)),
          h('td', {}, r.counted == null ? h('span', { class: 'muted' }, t('neverCounted')) : `${formatQty(r.counted)} · ${dateTime(r.countedAt)}`),
          h('td', { class: 'num' }, r.inSince ? `+${formatQty(r.inSince)}` : ''),
          h('td', { class: 'num' }, r.outSince ? `−${formatQty(r.outSince)}` : ''),
          h('td', { class: 'num', style: { fontWeight: 700, color: isLow(r) ? 'var(--danger)' : '' } }, `${formatQty(r.onHand)} ${r.unit || ''}`)))))));
  };

  mount(main,
    head(t('invLevels'), h('button', { onclick: () => location.reload() }, `↻ ${t('refresh')}`)),
    h('p', { class: 'muted' }, t('levelsHelp')),
    h('div', { class: 'row', style: { marginBottom: '12px' } },
      h('input', { type: 'search', placeholder: t('searchProducts'), style: { maxWidth: '280px' }, oninput: (e) => { q = e.target.value; draw(); } }),
      h('select', { style: { width: 'auto' }, onchange: (e) => { filter = e.target.value; draw(); } },
        h('option', { value: 'all' }, t('all')), h('option', { value: 'low' }, t('lowStock')), h('option', { value: 'uncounted' }, t('neverCounted'))),
      session.branches.length ? h('select', { style: { width: 'auto' }, onchange: (e) => { branch = e.target.value; draw(); } },
        h('option', { value: 'ALL' }, t('allBranches')), allBranches().map((b) => h('option', { value: b.id }, b.name))) : null),
    box);
  loadStockData().then((d) => { data = d; draw(); }).catch((err) => mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message}`)));
}

// ----------------------------------------------------------------- adjust

function adjustPage(main) {
  const code = h('input', { placeholder: t('scanOrType'), autofocus: true, list: 'inv-products' });
  const type = h('select', {}, ['RECEIVE', 'WRITE_OFF'].map((k) => h('option', { value: k }, t(`move_${k}`))));
  const qty = h('input', { inputmode: 'decimal', placeholder: '0' });
  const note = h('input', { placeholder: t('noteRefHint') });
  const found = h('span', { class: 'muted' });
  const recent = h('div');
  code.addEventListener('input', () => {
    const p = productFor(code.value);
    found.textContent = p ? `${p.name || p.barcode} (${p.unit || 'pcs'})` : '';
  });
  const save = async () => {
    const p = productFor(code.value);
    const q = parseQty(qty.value);
    if (!p) return toast(t('notFound'), 'error');
    if (!q) return toast(t('errQty'), 'error');
    try {
      await setDoc(doc(collection(db, ws('movements'))), movement(p, type.value, q, session.branchId, '', note.value.trim()));
      toast(t('saved'), 'ok');
      code.value = ''; qty.value = ''; note.value = ''; found.textContent = '';
      code.focus();
      loadRecent();
    } catch (err) {
      toast(err.message || String(err), 'error');
    }
  };
  async function loadRecent() {
    const since = Date.now() - 30 * 24 * 3600 * 1000;
    const col = collection(db, ws('movements'));
    try {
      const snap = await getDocs(session.branchIds.length ? branchQuery(col) : query(col, where('at', '>=', since)));
      const rows = snap.docs.map((d) => d.data()).filter((m) => m.at >= since).sort((a, b) => b.at - a.at).slice(0, 200);
      mount(recent, h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, [t('date'), t('name'), t('type'), t('quantity'), t('branch'), t('employee')].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map((m) => h('tr', {},
          h('td', {}, dateTime(m.at)), h('td', {}, m.productName || m.barcode), h('td', {}, t(`move_${m.type}`)),
          h('td', { class: 'num' }, formatQty(m.quantityMilli)), h('td', {}, session.branchName(m.branchId || '')), h('td', {}, m.createdByName || '')))))));
    } catch (err) {
      mount(recent, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message}`));
    }
  }
  mount(main,
    head(t('invAdjust')),
    h('p', { class: 'muted' }, t('inventoryHelp')),
    canMove() ? h('div', { class: 'card', style: { display: 'grid', gap: '12px', maxWidth: '720px', marginBottom: '16px' } },
      h('label', { class: 'field' }, t('product'), h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        h('div', { class: 'grow', style: { flex: 1 } }, code),
        h('button', { type: 'button', title: t('scanCamera'), onclick: async () => { const c = await scanWithCamera(); if (c) { code.value = c; code.dispatchEvent(new Event('input')); } } }, '📷'))), found,
      h('datalist', { id: 'inv-products' }, session.products.slice(0, 3000).map((p) => h('option', { value: p.barcode }, p.name))),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('type'), type), h('label', { class: 'field' }, t('quantity'), qty)),
      h('label', { class: 'field' }, t('note'), note),
      h('p', { class: 'muted', style: { margin: 0 } }, `${t('branch')}: ${session.branchName()}`),
      h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: save }, t('save'))))
      : h('p', { class: 'muted' }, t('noStockPermission')),
    h('h2', {}, t('recentMovements')),
    recent);
  loadRecent();
}

// ----------------------------------------------------------------- lines

/** An editable list of { barcode, name, qtyMilli, costSen? } with a product picker. */
function lineEditor(lines, { withCost = false } = {}) {
  const box = h('div', { style: { display: 'grid', gap: '8px' } });
  const pick = h('input', { placeholder: t('scanOrType'), list: 'line-products' });
  const add = () => {
    const p = productFor(pick.value);
    if (!p) return toast(t('notFound'), 'error');
    const existing = lines.find((l) => l.barcode === p.barcode);
    if (existing) existing.qtyMilli += 1000;
    else lines.push({ barcode: p.barcode, name: p.name || p.barcode, qtyMilli: 1000, ...(withCost ? { costSen: p.costSen ?? 0 } : {}) });
    pick.value = '';
    draw();
    pick.focus();
  };
  pick.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const draw = () => mount(box,
    lines.map((l, i) => h('div', { class: 'row' },
      h('span', { class: 'grow', style: { flex: 1 } }, l.name),
      h('input', { style: { width: '90px' }, inputmode: 'decimal', value: formatQty(l.qtyMilli), onchange: (e) => { l.qtyMilli = parseQty(e.target.value) || l.qtyMilli; e.target.value = formatQty(l.qtyMilli); } }),
      withCost ? h('input', { style: { width: '100px' }, inputmode: 'decimal', value: formatSen(l.costSen || 0), title: t('cost'), onchange: (e) => { l.costSen = parseSen(e.target.value) ?? l.costSen; } }) : null,
      h('button', { class: 'ghost', type: 'button', onclick: () => { lines.splice(i, 1); draw(); } }, '✕'))),
    h('div', { class: 'row' }, h('div', { class: 'grow', style: { flex: 1 } }, pick),
      h('button', { type: 'button', title: t('scanCamera'), onclick: async () => { const c = await scanWithCamera(); if (c) { pick.value = c; add(); } } }, '📷'),
      h('button', { type: 'button', onclick: add }, `+ ${t('add')}`)),
    h('datalist', { id: 'line-products' }, session.products.slice(0, 3000).map((p) => h('option', { value: p.barcode }, p.name))));
  draw();
  return box;
}

// -------------------------------------------------------------- suppliers

function supplierPage(main) {
  const list = () => session.suppliers || [];
  const edit = (sup) => {
    const isNew = !sup;
    const s = sup || { id: Math.random().toString(36).slice(2, 10), name: '', phone: '', email: '', address: '', note: '' };
    const f = (k) => h('input', { value: s[k] || '' });
    const name = f('name'); const phone = f('phone'); const email = f('email'); const address = f('address'); const note = f('note');
    modal((close) => [
      h('h2', {}, isNew ? t('addSupplier') : t('editSupplier')),
      h('label', { class: 'field' }, t('name'), name),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('phone'), phone), h('label', { class: 'field' }, t('email'), email)),
      h('label', { class: 'field' }, t('address'), address),
      h('label', { class: 'field' }, t('note'), note),
      h('div', { class: 'actions' },
        !isNew ? h('button', { class: 'danger', onclick: async () => { await saveSuppliers(list().filter((x) => x.id !== s.id)); close(); supplierPage(main); } }, t('delete')) : null,
        h('span', { class: 'grow' }),
        h('button', { onclick: close }, t('cancel')),
        h('button', {
          class: 'primary',
          onclick: async () => {
            if (!name.value.trim()) return toast(t('errName'), 'error');
            const next = { id: s.id, name: name.value.trim(), phone: phone.value.trim(), email: email.value.trim(), address: address.value.trim(), note: note.value.trim() };
            await saveSuppliers(isNew ? [...list(), next] : list().map((x) => (x.id === s.id ? next : x)));
            close();
            supplierPage(main);
          },
        }, t('save'))),
    ]);
  };
  mount(main,
    head(t('invSuppliers'), session.can('POS_MANAGE') ? h('button', { class: 'primary', onclick: () => edit(null) }, `+ ${t('addSupplier')}`) : null),
    list().length ? h('table', { class: 'list' }, h('tbody', {}, list().map((s) => h('tr', { class: 'click', onclick: () => session.can('POS_MANAGE') && edit(s) },
      h('td', {}, h('b', {}, s.name)), h('td', {}, s.phone || ''), h('td', {}, s.email || '')))))
      : h('p', { class: 'muted' }, t('noSuppliersYet')));
}

async function saveSuppliers(list) {
  try {
    await setDoc(doc(db, ws('pos/suppliers')), { list, updatedAt: Date.now() });
    session.suppliers = list;
    toast(t('saved'), 'ok');
  } catch (err) {
    toast(err.message || String(err), 'error');
  }
}

// -------------------------------------------------------- purchase orders

const PO_STATUS = ['DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'];

function purchasePage(main) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  const load = async () => {
    try {
      const snap = await getDocs(branchQuery(collection(db, ws('purchaseOrders'))));
      const pos = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => b.createdAt - a.createdAt);
      mount(box, pos.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, [t('poNo'), t('supplier'), t('branch'), t('date'), t('status'), t('total')].map((x) => h('th', {}, x)))),
        h('tbody', {}, pos.map((po) => h('tr', { class: 'click', onclick: () => editPo(po, load) },
          h('td', {}, po.poNo), h('td', {}, po.supplierName || ''), h('td', {}, session.branchName(po.branchId || '')),
          h('td', {}, dateTime(po.createdAt)), h('td', {}, h('span', { class: `pill${po.status === 'RECEIVED' ? ' good' : ''}` }, t(`po_${po.status}`))),
          h('td', { class: 'num' }, formatSen(poTotal(po))))))))
        : h('p', { class: 'muted' }, t('noPosYet')));
    } catch (err) {
      mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message}`));
    }
  };
  mount(main, head(t('invPurchase'), h('button', { class: 'primary', onclick: () => editPo(null, load) }, `+ ${t('newPo')}`)), box);
  load();
}

const poTotal = (po) => (po.lines || []).reduce((s, l) => s + Math.round((l.qtyMilli * (l.costSen || 0)) / 1000), 0);

function editPo(existing, reload) {
  const isNew = !existing;
  const po = existing ? structuredClone(existing) : {
    poNo: `PO-${receiptNo()}`, supplierId: '', supplierName: '', branchId: session.branchId, status: 'DRAFT',
    lines: [], note: '', createdByUid: session.uid, createdByName: session.name, createdAt: Date.now(),
  };
  const editable = po.status === 'DRAFT';
  const supplier = h('select', { disabled: !editable }, h('option', { value: '' }, '—'),
    (session.suppliers || []).map((s) => h('option', { value: s.id, selected: s.id === po.supplierId }, s.name)));
  const branch = h('select', { disabled: !editable }, session.sellableBranches().map((b) => h('option', { value: b.id, selected: b.id === po.branchId }, b.name)));
  const note = h('input', { value: po.note || '', disabled: !editable });
  const ref = existing ? doc(db, ws(`purchaseOrders/${existing.id}`)) : doc(collection(db, ws('purchaseOrders')));

  const collect = () => {
    const s = (session.suppliers || []).find((x) => x.id === supplier.value);
    return { ...po, supplierId: supplier.value, supplierName: s?.name || '', branchId: branch.value, note: note.value.trim(), updatedAt: Date.now() };
  };
  const save = async (patch = {}) => {
    const next = { ...collect(), ...patch };
    if (!next.lines.length) { toast(t('errNoLines'), 'error'); return false; }
    try { await setDoc(ref, next); toast(t('saved'), 'ok'); reload(); return true; } catch (err) { toast(err.message, 'error'); return false; }
  };

  modal((close) => [
    h('h2', {}, `${po.poNo} · ${t(`po_${po.status}`)}`),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('supplier'), supplier), h('label', { class: 'field' }, t('branch'), branch)),
    editable ? lineEditor(po.lines, { withCost: true })
      : h('table', { class: 'list' }, h('tbody', {}, po.lines.map((l) => h('tr', {},
        h('td', {}, l.name), h('td', { class: 'num' }, `${formatQty(l.receivedMilli || 0)} / ${formatQty(l.qtyMilli)}`), h('td', { class: 'num' }, formatSen(l.costSen || 0)))))),
    h('label', { class: 'field' }, t('note'), note),
    h('p', { class: 'muted', style: { margin: 0 } }, `${t('total')}: ${rm(poTotal(po))}`),
    h('div', { class: 'actions' },
      po.status === 'DRAFT' && !isNew ? h('button', { class: 'danger', onclick: async () => {
        if (!await confirmBox(t('deletePoQ'), t('delete'), t('cancel'))) return;
        try { await deleteDoc(ref); close(); reload(); } catch (err) { toast(err.message, 'error'); }
      } }, t('delete')) : null,
      ['ORDERED', 'PARTIAL'].includes(po.status) ? h('button', { class: 'danger', onclick: async () => { if (await save({ status: 'CANCELLED' })) close(); } }, t('cancelPo')) : null,
      h('span', { class: 'grow' }),
      h('button', { onclick: () => { printPo(collect()); } }, `🖨 ${t('print')}`),
      editable ? h('button', { onclick: async () => { if (await save()) close(); } }, t('saveDraft')) : null,
      editable ? h('button', { class: 'primary', onclick: async () => { if (await save({ status: 'ORDERED' })) close(); } }, t('markOrdered')) : null,
      ['ORDERED', 'PARTIAL'].includes(po.status) ? h('button', { class: 'primary', onclick: () => { close(); receivePo(po, ref, reload); } }, t('receiveGoods')) : null),
  ], { wide: true });
}

function receivePo(po, ref, reload) {
  if (!canMove()) return toast(t('noStockPermission'), 'error');
  const inputs = po.lines.map((l) => h('input', { style: { width: '100px' }, inputmode: 'decimal', value: formatQty(Math.max(0, l.qtyMilli - (l.receivedMilli || 0))) }));
  // Changing a product's cost is managing the product list, a separate
  // permission from receiving goods; without it the box stays off.
  const mayPrice = session.can('POS_MANAGE') || session.can('IMPORT_PRODUCTS') || session.can('EDIT_TEMPLATE');
  const updateCost = h('input', { type: 'checkbox', checked: mayPrice, disabled: !mayPrice });
  modal((close) => [
    h('h2', {}, `${t('receiveGoods')} · ${po.poNo}`),
    h('table', { class: 'list' }, h('tbody', {}, po.lines.map((l, i) => h('tr', {},
      h('td', {}, l.name), h('td', { class: 'num muted' }, `${formatQty(l.receivedMilli || 0)} / ${formatQty(l.qtyMilli)}`), h('td', {}, inputs[i]))))),
    h('label', { class: 'check' }, updateCost, t('updateCost')),
    h('div', { class: 'actions' },
      h('button', { onclick: close }, t('cancel')),
      h('button', {
        class: 'primary',
        onclick: async () => {
          const batch = writeBatch(db);
          const lines = po.lines.map((l, i) => {
            const got = parseQty(inputs[i].value) || 0;
            if (got > 0) {
              const p = session.find(l.barcode) || { barcode: l.barcode, name: l.name };
              batch.set(doc(collection(db, ws('movements'))), movement(p, 'RECEIVE', got, po.branchId || '', po.poNo, po.supplierName || ''));
              if (updateCost.checked && l.costSen && session.find(l.barcode)) {
                batch.update(doc(db, ws(`products/${session.find(l.barcode).barcode}`)), { costSen: l.costSen, updatedAt: Date.now() });
              }
            }
            return { ...l, receivedMilli: (l.receivedMilli || 0) + got };
          });
          const all = lines.every((l) => l.receivedMilli >= l.qtyMilli);
          batch.update(ref, { lines, status: all ? 'RECEIVED' : 'PARTIAL', receivedAt: Date.now(), updatedAt: Date.now() });
          try { await batch.commit(); toast(t('received'), 'ok'); close(); reload(); } catch (err) { toast(err.message, 'error'); }
        },
      }, t('receiveGoods'))),
  ], { wide: true });
}

function printPo(po) {
  const w = window.open('', '_blank');
  if (!w) return;
  const rows = po.lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.barcode)}</td><td style="text-align:right">${formatQty(l.qtyMilli)}</td><td style="text-align:right">${formatSen(l.costSen || 0)}</td></tr>`).join('');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(po.poNo)}</title>
<body style="font:14px system-ui;margin:24px"><h2>${esc(session.settings.shopName || session.companyName)}</h2>
<h1>${esc(t('purchaseOrder'))} ${esc(po.poNo)}</h1><p>${esc(t('supplier'))}: ${esc(po.supplierName)}<br>${esc(t('date'))}: ${new Date(po.createdAt).toLocaleDateString()}<br>${esc(t('deliverTo'))}: ${esc(session.branchName(po.branchId || ''))}</p>
<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>${esc(t('name'))}</th><th>Barcode</th><th>${esc(t('quantity'))}</th><th>${esc(t('cost'))}</th></tr>${rows}</table>
<p><b>${esc(t('total'))}: RM ${formatSen(poTotal(po))}</b></p><p>${esc(po.note || '')}</p><script>print()</script>`);
  w.document.close();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// -------------------------------------------------------------- transfers

function transferPage(main) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  const load = async () => {
    try {
      const col = collection(db, ws('transfers'));
      const snaps = session.branchIds.length
        ? await Promise.all([branchQuery(col, 'fromBranch'), branchQuery(col, 'toBranch')].map((q) => getDocs(q)))
        : [await getDocs(col)];
      const list = [...new Map(snaps.flatMap((s) => s.docs).map((d) => [d.id, { ...d.data(), id: d.id }])).values()].sort((a, b) => b.createdAt - a.createdAt);
      mount(box, list.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, [t('transferNo'), t('fromBranch'), t('toBranch'), t('date'), t('status')].map((x) => h('th', {}, x)))),
        h('tbody', {}, list.map((tr) => h('tr', { class: 'click', onclick: () => editTransfer(tr, load) },
          h('td', {}, tr.transferNo), h('td', {}, session.branchName(tr.fromBranch)), h('td', {}, session.branchName(tr.toBranch)),
          h('td', {}, dateTime(tr.createdAt)), h('td', {}, h('span', { class: 'pill' }, t(`tr_${tr.status}`))))))))
        : h('p', { class: 'muted' }, t('noTransfersYet')));
    } catch (err) {
      mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message}`));
    }
  };
  mount(main,
    head(t('invTransfers'), canMove() && session.branches.length ? h('button', { class: 'primary', onclick: () => editTransfer(null, load) }, `+ ${t('newTransfer')}`) : null),
    !session.branches.length ? h('p', { class: 'muted' }, t('transfersNeedBranches')) : null,
    box);
  load();
}

function editTransfer(existing, reload) {
  const isNew = !existing;
  const tr = existing ? structuredClone(existing) : {
    transferNo: `TR-${receiptNo()}`, fromBranch: session.branchId, toBranch: '', status: 'DRAFT', lines: [], note: '',
    createdByUid: session.uid, createdByName: session.name, createdAt: Date.now(),
  };
  const ref = existing ? doc(db, ws(`transfers/${existing.id}`)) : doc(collection(db, ws('transfers')));
  const from = h('select', { disabled: tr.status !== 'DRAFT' }, session.sellableBranches().map((b) => h('option', { value: b.id, selected: b.id === tr.fromBranch }, b.name)));
  const to = h('select', { disabled: tr.status !== 'DRAFT' }, allBranches().map((b) => h('option', { value: b.id, selected: b.id === tr.toBranch }, b.name)));
  const mine = (b) => !session.branchIds.length || session.branchIds.includes(b);

  const send = async (close) => {
    if (from.value === to.value) return toast(t('errSameBranch'), 'error');
    if (!tr.lines.length) return toast(t('errNoLines'), 'error');
    const batch = writeBatch(db);
    const next = { ...tr, fromBranch: from.value, toBranch: to.value, status: 'SENT', sentAt: Date.now(), updatedAt: Date.now() };
    batch.set(ref, next);
    tr.lines.forEach((l) => batch.set(doc(collection(db, ws('movements'))),
      movement(session.find(l.barcode) || l, 'TRANSFER_OUT', l.qtyMilli, from.value, tr.transferNo, session.branchName(to.value))));
    try { await batch.commit(); toast(t('sent'), 'ok'); close(); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  const receive = async (close) => {
    const batch = writeBatch(db);
    batch.update(ref, { status: 'RECEIVED', receivedAt: Date.now(), receivedByName: session.name, updatedAt: Date.now() });
    tr.lines.forEach((l) => batch.set(doc(collection(db, ws('movements'))),
      movement(session.find(l.barcode) || l, 'TRANSFER_IN', l.qtyMilli, tr.toBranch, tr.transferNo, session.branchName(tr.fromBranch))));
    try { await batch.commit(); toast(t('received'), 'ok'); close(); reload(); } catch (err) { toast(err.message, 'error'); }
  };

  modal((close) => [
    h('h2', {}, `${tr.transferNo} · ${t(`tr_${tr.status}`)}`),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('fromBranch'), from), h('label', { class: 'field' }, t('toBranch'), to)),
    tr.status === 'DRAFT' ? lineEditor(tr.lines)
      : h('table', { class: 'list' }, h('tbody', {}, tr.lines.map((l) => h('tr', {}, h('td', {}, l.name), h('td', { class: 'num' }, formatQty(l.qtyMilli)))))),
    h('div', { class: 'actions' },
      h('span', { class: 'grow' }),
      h('button', { onclick: close }, t('close')),
      tr.status === 'DRAFT' ? h('button', {
        onclick: async () => {
          try { await setDoc(ref, { ...tr, fromBranch: from.value, toBranch: to.value, updatedAt: Date.now() }); toast(t('saved'), 'ok'); close(); reload(); } catch (err) { toast(err.message, 'error'); }
        },
      }, t('saveDraft')) : null,
      tr.status === 'DRAFT' && mine(from.value) ? h('button', { class: 'primary', onclick: () => send(close) }, t('sendTransfer')) : null,
      tr.status === 'SENT' && mine(tr.toBranch) ? h('button', { class: 'primary', onclick: () => receive(close) }, t('receiveTransfer')) : null),
  ], { wide: true });
}
