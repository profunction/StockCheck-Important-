/**
 * What the SuXin Books pages share: the page head, amounts and dates in
 * fields, pickers for accounts and contacts, status pills, CSV, and the
 * words for an error from data.js.
 */
import { h, toast } from '../js/dom.js';
import { getLang, t } from '../js/i18n.js';
import { formatSen, parseSen } from '../js/money.js';
import { accountName, DOC_TYPES } from '../js/books.js';
import { accounts, books, BooksError, dayMs, ymd } from './data.js';
import { menuButton } from './main.js';

export function head(title, ...extra) {
  return h('div', { class: 'page-head' }, menuButton(), h('h1', {}, title), h('span', { class: 'grow' }), ...extra);
}

/** "1,234.50" -- the books show amounts with thousands, no "RM" on every row. */
export function money(sen) {
  const [whole, frac] = formatSen(Math.abs(sen)).split('.');
  return `${sen < 0 ? '-' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}
export const rmText = (sen) => `RM ${money(sen)}`;

export const amountInput = (sen, attrs = {}) => h('input', { inputmode: 'decimal', class: 'num', value: sen ? formatSen(sen) : '', placeholder: '0.00', ...attrs });
/** Sen from an amount field; 0 when empty, null when not an amount. */
export const senOf = (input) => (input.value.trim() === '' ? 0 : parseSen(input.value));

export const dateInput = (ms, attrs = {}) => h('input', { type: 'date', value: ymd(ms ?? Date.now()), ...attrs });
export const dateOf = (input) => (input.value ? dayMs(input.value) : NaN);

/** Account names in the page's language. */
export const accName = (code) => {
  const a = accounts().find((x) => x.code === code);
  return a ? `${a.code} ${accountName(a, getLang())}` : code;
};

/** A select of accounts, [filter]ed (by type list or a function). */
export function accountSelect(value, filter = null, attrs = {}) {
  const ok = typeof filter === 'function' ? filter : Array.isArray(filter) ? (a) => filter.includes(a.type) : () => true;
  const list = accounts().filter((a) => a.active !== false && ok(a));
  return h('select', attrs, list.map((a) => h('option', { value: a.code, selected: a.code === value }, `${a.code} ${accountName(a, getLang())}`)));
}

/** Where money is kept: cash, bank, e-wallet settlements and any other 10xx account. */
export const moneyAccount = (a) => a.type === 'ASSET' && (['cash', 'bank', 'clearing'].includes(a.role) || /^10\d\d$/.test(a.code));

/** Customers (sales) or suppliers (purchases), active ones. */
export const contactsFor = (sales) => books.contacts.filter((c) => c.active !== false && (c.kind === 'BOTH' || c.kind === (sales ? 'CUSTOMER' : 'SUPPLIER')));

export function contactSelect(value, sales, attrs = {}) {
  return h('select', attrs,
    h('option', { value: '' }, t('bkPickContact')),
    contactsFor(sales).map((c) => h('option', { value: c.id, selected: c.id === value }, c.name)));
}

/** The contact as it is copied onto a document (what the e-invoice needs). */
export function contactCopy(c) {
  if (!c) return {};
  const keep = ['name', 'tin', 'idType', 'idNo', 'sstNo', 'ttxNo', 'address', 'city', 'postcode', 'state', 'country', 'phone', 'email'];
  return Object.fromEntries(keep.map((k) => [k, c[k] || '']));
}

export const statusPill = (status, extra = '') => h('span', { class: `pill bk-${status.toLowerCase()}${extra ? ` ${extra}` : ''}` }, t(`bkSt_${status}`));
export const typeName = (type) => t(`bkType_${type}`);
export const isSales = (type) => Boolean(DOC_TYPES[type]?.sales);

/** Says what went wrong in words, never a code. */
export function failed(err) {
  const known = err?.code ? t(`bkErr_${err.code}`) : '';
  if (err instanceof BooksError || (known && known !== `bkErr_${err.code}`)) return toast(known, 'error');
  console.error(err);
  if (/offline|unavailable|network/i.test(err?.message || '')) return toast(t('bkErr_OFFLINE'), 'error');
  if (/permission/i.test(err?.message || '')) return toast(t('bkErr_PERMISSION'), 'error');
  return toast(`${t('errSave')}: ${err?.message || err}`, 'error');
}

/** A CSV a spreadsheet opens in Malay/Chinese without mangling (BOM, quotes). */
export function csv(rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** A plain table: head row and body rows of cells (strings or nodes); [num] marks right-aligned columns. */
export function table(headRow, rows, { num = [], cls = '', foot = null, onRow = null } = {}) {
  return h('div', { class: 'table-wrap' }, h('table', { class: `list ${cls}` },
    h('thead', {}, h('tr', {}, headRow.map((x, i) => h('th', { class: num.includes(i) ? 'num' : '' }, x)))),
    h('tbody', {}, rows.map((r, ri) => h('tr', { class: onRow ? 'click' : '', onclick: onRow ? () => onRow(ri) : null },
      r.map((x, i) => h('td', { class: num.includes(i) ? 'num' : '' }, x))))),
    foot ? h('tfoot', {}, h('tr', {}, foot.map((x, i) => h('td', { class: num.includes(i) ? 'num' : '' }, x)))) : null));
}

export const empty = (text) => h('p', { class: 'muted bk-empty' }, text);

/** Malaysian states as MyInvois codes them. */
export const STATES = [
  ['01', 'Johor'], ['02', 'Kedah'], ['03', 'Kelantan'], ['04', 'Melaka'], ['05', 'Negeri Sembilan'], ['06', 'Pahang'],
  ['07', 'Pulau Pinang'], ['08', 'Perak'], ['09', 'Perlis'], ['10', 'Selangor'], ['11', 'Terengganu'], ['12', 'Sabah'],
  ['13', 'Sarawak'], ['14', 'W.P. Kuala Lumpur'], ['15', 'W.P. Labuan'], ['16', 'W.P. Putrajaya'], ['17', 'N/A'],
];
export const stateSelect = (value, attrs = {}) => h('select', attrs, h('option', { value: '' }, '—'),
  STATES.map(([code, name]) => h('option', { value: code, selected: code === value }, `${code} ${name}`)));

/**
 * The taxes a line can carry: none, SST on goods (sales tax 5%, 10%),
 * service tax (6%, 8%) and exempt. [type, pct]
 */
export const TAXES = [['06', 0], ['01', 5], ['01', 10], ['02', 6], ['02', 8], ['E', 0]];
export const taxLabel = ([type, pct]) => t(`bkTax_${type}`) + (pct ? ` ${pct}%` : '');
export function taxSelect(line, attrs = {}) {
  const key = `${line.taxType || '06'}|${Number(line.taxPct) || 0}`;
  const list = TAXES.some(([ty, p]) => `${ty}|${p}` === key) ? TAXES : [...TAXES, [line.taxType, Number(line.taxPct)]];
  return h('select', attrs, list.map((x) => h('option', { value: `${x[0]}|${x[1]}`, selected: `${x[0]}|${x[1]}` === key }, taxLabel(x))));
}
