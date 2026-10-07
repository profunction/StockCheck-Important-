/**
 * Suppliers: who we buy from, how to reach them, their terms -- and, from
 * the purchase orders already sent to them, what we buy from each and what
 * we paid last time, so the cheaper one is easy to see.
 */
import { db, doc, setDoc } from '../js/fb.js';
import { dateTime, h, modal, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatSen, rm } from '../js/money.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { canBuy, failed, head, loading } from './common.js';
import { loadPurchaseOrders } from './data.js';
import { poTotal } from './purchase.js';

const FIELDS = ['name', 'contact', 'phone', 'email', 'address', 'taxNo', 'terms', 'note'];

export function render(main) {
  const box = h('div');
  const list = () => session.suppliers || [];
  let pos = [];
  const stats = (s) => {
    const mine = pos.filter((p) => p.supplierId === s.id && !['DRAFT', 'SUBMITTED', 'CANCELLED'].includes(p.status));
    return { n: mine.length, spent: mine.reduce((x, p) => x + poTotal(p), 0), last: mine.reduce((x, p) => Math.max(x, p.createdAt || 0), 0) };
  };
  const draw = () => mount(box, list().length ? h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
    h('thead', {}, h('tr', {}, [t('name'), t('whContact'), t('phone'), t('whTerms'), t('whOrders'), t('whSpent'), t('whLastOrder')].map((x, i) => h('th', { class: i === 4 || i === 5 ? 'num' : '' }, x)))),
    h('tbody', {}, list().map((s) => {
      const st = stats(s);
      return h('tr', { class: 'click', onclick: () => show(s) },
        h('td', {}, h('strong', {}, s.name)), h('td', {}, s.contact || ''), h('td', {}, s.phone || ''), h('td', {}, s.terms || ''),
        h('td', { class: 'num' }, String(st.n)), h('td', { class: 'num' }, st.spent ? formatSen(st.spent) : ''), h('td', { class: 'muted' }, st.last ? dateTime(st.last) : ''));
    }))))
    : h('p', { class: 'muted' }, t('noSuppliersYet')));

  const show = (s) => {
    const bought = new Map();
    for (const p of pos.filter((x) => x.supplierId === s.id && !['DRAFT', 'SUBMITTED', 'CANCELLED'].includes(x.status)).sort((a, b) => a.createdAt - b.createdAt)) {
      for (const l of p.lines || []) bought.set(l.barcode, { name: l.name, last: l.costSen || 0, at: p.createdAt, n: (bought.get(l.barcode)?.n || 0) + 1 });
    }
    modal((close) => [
      h('h2', {}, s.name),
      h('p', { class: 'muted', style: { margin: 0 } }, [s.contact, s.phone, s.email, s.address, s.taxNo && `SST/Tax: ${s.taxNo}`, s.terms].filter(Boolean).join(' · ')),
      bought.size ? h('table', { class: 'list' }, h('thead', {}, h('tr', {}, [t('name'), t('whLastPrice'), t('whTimes'), t('date')].map((x, i) => h('th', { class: i === 1 || i === 2 ? 'num' : '' }, x)))),
        h('tbody', {}, [...bought.values()].map((b) => h('tr', {}, h('td', {}, b.name), h('td', { class: 'num' }, formatSen(b.last)), h('td', { class: 'num' }, String(b.n)), h('td', { class: 'muted' }, dateTime(b.at))))))
        : h('p', { class: 'muted' }, t('whNothingBoughtYet')),
      h('div', { class: 'actions' },
        h('button', { onclick: close }, t('close')),
        canBuy() ? h('button', { class: 'primary', onclick: () => { close(); edit(s); } }, t('editSupplier')) : null),
    ], { wide: true });
  };

  const edit = (sup) => {
    const isNew = !sup;
    const s = sup || { id: Math.random().toString(36).slice(2, 10) };
    const inputs = Object.fromEntries(FIELDS.map((k) => [k, h('input', { value: s[k] || '' })]));
    const f = (k) => h('label', { class: 'field' }, t(`sup_${k}`), inputs[k]);
    modal((close) => [
      h('h2', {}, isNew ? t('addSupplier') : t('editSupplier')),
      f('name'),
      h('div', { class: 'grid2' }, f('contact'), f('phone')),
      h('div', { class: 'grid2' }, f('email'), f('taxNo')),
      f('address'),
      h('div', { class: 'grid2' }, f('terms'), f('note')),
      h('div', { class: 'actions' },
        !isNew ? h('button', { class: 'danger', onclick: async () => { if (await save(list().filter((x) => x.id !== s.id))) { close(); draw(); } } }, t('delete')) : null,
        h('span', { class: 'grow' }),
        h('button', { onclick: close }, t('cancel')),
        h('button', { class: 'primary', onclick: async () => {
          if (!inputs.name.value.trim()) return toast(t('errName'), 'error');
          const next = { id: s.id, ...Object.fromEntries(FIELDS.map((k) => [k, inputs[k].value.trim()])) };
          if (await save(isNew ? [...list(), next] : list().map((x) => (x.id === s.id ? next : x)))) { close(); draw(); }
        } }, t('save'))),
    ]);
  };

  mount(main,
    head(t('whSuppliers'), canBuy() ? h('button', { class: 'primary', onclick: () => edit(null) }, icon('plus', 17), t('addSupplier')) : null),
    box);
  draw();
  loading(box);
  loadPurchaseOrders().then((p) => { pos = p; draw(); }).catch((err) => failed(box, err));
  return null;
}

async function save(list) {
  try {
    await setDoc(doc(db, ws('pos/suppliers')), { list, updatedAt: Date.now() });
    session.suppliers = list;
    toast(t('saved'), 'ok');
    return true;
  } catch (err) {
    toast(err.message || String(err), 'error');
    return false;
  }
}
