/**
 * Stock in and out between counts, from the computer: goods received,
 * damaged or expired stock written off. The same movements the app records,
 * so the app's stock levels include them.
 */
import { collection, db, doc, getDocs, query, setDoc, where } from './fb.js';
import { dateTime, h, mount, toast } from './dom.js';
import { t } from './i18n.js';
import { formatQty, parseQty } from './money.js';
import { session, ws } from './session.js';
import { menuButton } from './main.js';

export function render(main) {
  const canRecord = session.can('RECORD_STOCK_MOVEMENTS');
  const code = h('input', { placeholder: t('scanOrType'), autofocus: true, list: 'inv-products' });
  const type = h('select', {}, ['RECEIVE', 'WRITE_OFF'].map((k) => h('option', { value: k }, t(`move_${k}`))));
  const qty = h('input', { inputmode: 'decimal', placeholder: '0' });
  const note = h('input', { placeholder: t('noteRefHint') });
  const found = h('span', { class: 'muted' });
  const recent = h('div');
  code.addEventListener('input', () => {
    const p = session.find(code.value) || session.products.find((x) => (x.name || '').toLowerCase() === code.value.trim().toLowerCase());
    found.textContent = p ? `${p.name || p.barcode} (${p.unit || 'pcs'})` : '';
  });

  const save = async () => {
    const p = session.find(code.value) || session.products.find((x) => (x.name || '').toLowerCase() === code.value.trim().toLowerCase());
    const q = parseQty(qty.value);
    if (!p) return toast(t('notFound'), 'error');
    if (!q) return toast(t('errQty'), 'error');
    const now = Date.now();
    try {
      await setDoc(doc(collection(db, ws('movements'))), {
        barcode: p.barcode, productName: p.name || '', branchId: session.branchId, type: type.value, quantityMilli: q,
        at: now, source: 'MANUAL', reference: '', note: note.value.trim(),
        createdByUid: session.uid, createdByName: session.name, createdAt: now,
      });
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
      const snap = session.branchIds.length
        ? await getDocs(query(col, where('branchId', 'in', [...session.branchIds, ''].slice(0, 30))))
        : await getDocs(query(col, where('at', '>=', since)));
      const rows = snap.docs.map((d) => d.data()).filter((m) => m.at >= since).sort((a, b) => b.at - a.at).slice(0, 200);
      mount(recent, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, [t('date'), t('name'), t('type'), t('quantity'), t('source'), t('employee')].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map((m) => h('tr', {},
          h('td', {}, dateTime(m.at)), h('td', {}, m.productName || m.barcode), h('td', {}, t(`move_${m.type}`)),
          h('td', { class: 'num' }, formatQty(m.quantityMilli)), h('td', {}, m.source), h('td', {}, m.createdByName || ''))))));
    } catch (err) {
      mount(recent, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message}`));
    }
  }

  mount(main,
    h('div', { class: 'page-head' }, menuButton(), h('h1', {}, t('navInventory'))),
    h('p', { class: 'muted' }, t('inventoryHelp')),
    canRecord ? h('div', { class: 'card', style: { display: 'grid', gap: '12px', maxWidth: '720px', marginBottom: '16px' } },
      h('h2', { style: { margin: 0 } }, t('stockAdjustment')),
      h('label', { class: 'field' }, t('product'), code), found,
      h('datalist', { id: 'inv-products' }, session.products.slice(0, 2000).map((p) => h('option', { value: p.barcode }, p.name))),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, t('type'), type), h('label', { class: 'field' }, t('quantity'), qty)),
      h('label', { class: 'field' }, t('note'), note),
      h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: save }, t('save'))))
      : h('p', { class: 'muted' }, t('noStockPermission')),
    h('h2', {}, t('recentMovements')),
    recent);
  loadRecent();
  return null;
}
