/**
 * Customers and suppliers: who the documents are to, with what an
 * e-invoice needs of them (TIN, registration or IC number, address), what
 * they owe or are owed, and the till's supplier list brought across.
 */
import { h, modal, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { icon } from '../js/icons.js';
import { session } from '../js/session.js';
import { GENERAL_PUBLIC_TIN } from '../js/einvoice-doc.js';
import { outstanding, DOC_TYPES } from '../js/books.js';
import { books, canPost, saveContact } from './data.js';
import { empty, failed, head, money, stateSelect, table } from './common.js';

const KINDS = ['CUSTOMER', 'SUPPLIER', 'BOTH'];
const ID_TYPES = ['BRN', 'NRIC', 'PASSPORT', 'ARMY'];

/** What [c] owes us (+) or we owe them (-), from issued documents. */
export function balanceWith(c) {
  let sum = 0;
  for (const d of books.docs) {
    if (d.contactId !== c.id || d.status !== 'ISSUED') continue;
    const kind = DOC_TYPES[d.type];
    if (kind.sign < 0 || d.type === 'DEBIT_NOTE') continue;
    const left = outstanding(d, books.payments, books.docs);
    sum += kind.sales ? left : -left;
  }
  return sum;
}

let q = '';

export function render(main) {
  const box = h('div');
  const draw = () => {
    const needle = q.trim().toLowerCase();
    const rows = books.contacts.filter((c) => !needle || `${c.name} ${c.tin || ''} ${c.phone || ''}`.toLowerCase().includes(needle));
    mount(box, rows.length
      ? table([t('name'), t('bkKind'), 'TIN', t('phone'), t('bkBalance')],
        rows.map((c) => {
          const bal = balanceWith(c);
          return [h('strong', {}, c.name, c.active === false ? h('span', { class: 'pill' }, t('bkInactive')) : null), t(`bkKind_${c.kind || 'CUSTOMER'}`),
            c.tin || '', c.phone || '', bal ? h('span', { class: bal > 0 ? '' : 'bk-neg' }, money(Math.abs(bal)), ' ', t(bal > 0 ? 'bkOwesUs' : 'bkWeOwe')) : ''];
        }), { num: [4], onRow: (i) => editContact(rows[i], { onSaved: draw }) })
      : empty(t(books.contacts.length ? 'bkNothingMatches' : 'bkNoContacts')));
  };
  const fromTill = (session.suppliers || []).filter((s) => !books.contacts.some((c) => c.posSupplierId === s.id));
  mount(main,
    head(t('bkContacts'),
      canPost() && fromTill.length ? h('button', { 'data-act': 'import-suppliers', onclick: async (e) => {
        const btn = e.currentTarget;
          btn.disabled = true;
        try {
          for (const s of fromTill) {
            await saveContact({ name: s.name, kind: 'SUPPLIER', phone: s.phone || '', email: s.email || '', address: s.address || '', sstNo: s.taxNo || '',
              note: [s.contact, s.terms, s.note].filter(Boolean).join(' · '), posSupplierId: s.id, country: 'MYS', idType: 'BRN' });
          }
          toast(`${t('bkImported')}: ${fromTill.length}`, 'ok');
        } catch (err) { failed(err); }
      } }, icon('download', 17), `${t('bkImportSuppliers')} (${fromTill.length})`) : null,
      canPost() ? h('button', { class: 'primary', 'data-act': 'new-contact', onclick: () => editContact(null, { onSaved: draw }) }, icon('plus', 17), t('bkNewContact')) : null),
    h('div', { class: 'wh-head' }, h('input', { type: 'search', placeholder: t('bkSearchContacts'), value: q, oninput: (e) => { q = e.target.value; draw(); } })),
    box);
  draw();
  return null;
}

/** The contact form, in a dialog. [onSaved](id) after saving. */
export function editContact(existing, { kind = 'CUSTOMER', onSaved = () => {} } = {}) {
  const c = existing ? { ...existing } : { kind, idType: 'BRN', country: 'MYS', state: '', termsDays: '' };
  const readOnly = !canPost();
  const input = (k, attrs = {}) => h('input', { value: c[k] ?? '', 'data-c': k, disabled: readOnly, ...attrs });
  const f = {
    name: input('name', { autofocus: true }),
    kind: h('select', { 'data-c': 'kind', disabled: readOnly }, KINDS.map((k) => h('option', { value: k, selected: c.kind === k }, t(`bkKind_${k}`)))),
    tin: input('tin', { placeholder: 'C12345678090 / IG12345678100' }),
    idType: h('select', { 'data-c': 'idType', disabled: readOnly }, ID_TYPES.map((k) => h('option', { value: k, selected: c.idType === k }, t(`bkId_${k}`)))),
    idNo: input('idNo'),
    sstNo: input('sstNo'),
    phone: input('phone', { inputmode: 'tel' }),
    email: input('email', { type: 'email' }),
    address: input('address'),
    postcode: input('postcode', { inputmode: 'numeric' }),
    city: input('city'),
    state: stateSelect(c.state, { 'data-c': 'state', disabled: readOnly }),
    country: input('country', { maxlength: 3 }),
    termsDays: input('termsDays', { inputmode: 'numeric', placeholder: '30' }),
    note: input('note'),
  };
  const field = (k, label) => h('label', { class: 'field' }, label, f[k]);
  const publicBuyer = () => {
    f.tin.value = GENERAL_PUBLIC_TIN; f.idType.value = 'NRIC'; f.idNo.value = '000000000000';
    if (!f.name.value.trim()) f.name.value = t('bkGeneralPublic');
  };
  modal((close) => [
    h('h2', {}, existing ? existing.name : t('bkNewContact')),
    h('div', { class: 'grid2' }, field('name', t('name')), field('kind', t('bkKind'))),
    h('div', { class: 'grid2' }, field('tin', 'TIN'), field('sstNo', t('bkSstNo'))),
    h('div', { class: 'grid2' }, field('idType', t('bkIdType')), field('idNo', t('bkIdNo'))),
    readOnly ? null : h('p', { class: 'muted sm' }, t('bkTinHelp'), ' ',
      h('button', { class: 'ghost', type: 'button', 'data-act': 'general-public', onclick: publicBuyer }, t('bkUseGeneralPublic'))),
    h('div', { class: 'grid2' }, field('phone', t('phone')), field('email', t('email'))),
    field('address', t('bkAddress')),
    h('div', { class: 'grid2' }, field('postcode', t('bkPostcode')), field('city', t('bkCity'))),
    h('div', { class: 'grid2' }, field('state', t('bkState')), field('country', t('bkCountry'))),
    h('div', { class: 'grid2' }, field('termsDays', t('bkTermsDays')), field('note', t('note'))),
    existing ? h('p', {}, h('a', { href: '#/reports/statement/' + existing.id, onclick: () => close() }, t('bkStatement'))) : null,
    h('div', { class: 'actions' },
      existing && !readOnly ? h('button', { class: 'ghost', onclick: async () => {
        try { await saveContact({ ...existing, active: existing.active === false }); close(); onSaved(existing.id); } catch (err) { failed(err); }
      } }, t(existing.active === false ? 'bkReactivate' : 'bkDeactivate')) : null,
      h('span', { class: 'grow' }),
      h('button', { onclick: close }, t(readOnly ? 'close' : 'cancel')),
      readOnly ? null : h('button', { class: 'primary', 'data-act': 'save-contact', onclick: async (e) => {
        const name = f.name.value.trim();
        if (!name) return toast(t('bkErrName'), 'error');
        const data = {
          ...c, name, kind: f.kind.value, tin: f.tin.value.trim().toUpperCase(), idType: f.idType.value, idNo: f.idNo.value.trim(),
          sstNo: f.sstNo.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), address: f.address.value.trim(),
          postcode: f.postcode.value.trim(), city: f.city.value.trim(), state: f.state.value, country: (f.country.value.trim() || 'MYS').toUpperCase(),
          termsDays: f.termsDays.value.trim() === '' ? '' : Math.max(0, Math.round(Number(f.termsDays.value) || 0)), note: f.note.value.trim(),
        };
        const btn = e.currentTarget;
          btn.disabled = true;
        try {
          const id = await saveContact(data);
          toast(t('saved'), 'ok');
          close();
          onSaved(id);
        } catch (err) { failed(err); btn.disabled = false; }
      } }, t('save'))),
  ], { wide: true });
}

