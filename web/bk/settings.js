/**
 * The books' settings: the company as it appears on every invoice and
 * e-invoice (taken from the till's settings until changed here), payment
 * terms, bank details for the invoice, and the lock date -- nothing on or
 * before it can be posted, changed or voided. Only the accountant
 * (BOOKS_ADMIN) changes them.
 */
import { h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { books, canAdmin, company, dayEnd, saveSettings, ymd } from './data.js';
import { failed, head, stateSelect } from './common.js';

export function render(main) {
  const s = company();
  const ro = !canAdmin();
  const input = (k, attrs = {}) => h('input', { value: s[k] ?? '', disabled: ro, 'data-s': k, ...attrs });
  const f = {
    name: input('name'), brn: input('brn'), tin: input('tin', { placeholder: 'C12345678090' }), sstNo: input('sstNo'), ttxNo: input('ttxNo'),
    msic: input('msic', { placeholder: '47111', maxlength: 5 }), msicName: input('msicName'),
    address: input('address'), postcode: input('postcode', { inputmode: 'numeric' }), city: input('city'),
    state: stateSelect(s.state, { disabled: ro, 'data-s': 'state' }),
    phone: input('phone', { inputmode: 'tel' }), email: input('email', { type: 'email' }),
    termsDays: input('termsDays', { inputmode: 'numeric' }), bank: input('bank', { placeholder: t('bkBankPh') }), footer: input('footer'),
  };
  const lock = h('input', { type: 'date', value: books.settings.lockDate ? ymd(books.settings.lockDate) : '', disabled: ro, 'data-s': 'lockDate' });
  const field = (k, label) => h('label', { class: 'field' }, label, f[k]);
  mount(main,
    head(t('bkSettings')),
    ro ? h('p', { class: 'muted' }, t('bkSettingsReadOnly')) : null,
    h('section', { class: 'card bk-form', 'data-editing': '' },
      h('h2', {}, t('bkCompany')),
      h('p', { class: 'muted sm' }, t('bkCompanyHelp')),
      field('name', t('bkCompanyName')),
      h('div', { class: 'grid2' }, field('brn', t('bkBrn')), field('tin', 'TIN')),
      h('div', { class: 'grid2' }, field('sstNo', t('bkSstNo')), field('ttxNo', t('bkTtxNo'))),
      h('div', { class: 'grid2' }, field('msic', t('bkMsic')), field('msicName', t('bkMsicName'))),
      field('address', t('bkAddress')),
      h('div', { class: 'grid2' }, field('postcode', t('bkPostcode')), field('city', t('bkCity'))),
      h('div', { class: 'grid2' }, field('state', t('bkState')), field('phone', t('phone'))),
      field('email', t('email')),
      h('h2', {}, t('bkInvoiceSettings')),
      h('div', { class: 'grid2' }, field('termsDays', t('bkTermsDays')), field('bank', t('bkBankDetails'))),
      field('footer', t('bkFooter')),
      h('h2', {}, t('bkLockDate')),
      h('p', { class: 'muted sm' }, t('bkLockHelp')),
      h('label', { class: 'field' }, t('bkLockDate'), lock),
      ro ? null : h('div', { class: 'actions' }, h('span', { class: 'grow' }),
        h('button', { class: 'primary', 'data-act': 'save-settings', onclick: async (e) => {
          const patch = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
          patch.tin = patch.tin.toUpperCase();
          patch.termsDays = Math.max(0, Math.round(Number(patch.termsDays) || 0));
          patch.lockDate = lock.value ? dayEnd(lock.value) : 0;
          const btn = e.currentTarget;
          btn.disabled = true;
          try { await saveSettings(patch); toast(t('saved'), 'ok'); } catch (err) { failed(err); } finally { btn.disabled = false; }
        } }, t('save')))));
  return null;
}
