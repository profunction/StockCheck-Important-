/**
 * What every warehouse page shares: who may do what, where stock is, the
 * movement and audit records each operation writes, and a product box that
 * takes a scanner, the camera or typing.
 *
 * Every change to stock is a movement in the same collection the Stock
 * Check app and the till use -- there is no warehouse copy of the stock to
 * fall out of step -- and every operation leaves an audit entry in the same
 * batch, so the two can never disagree about whether it happened.
 */
import { collection, db, doc } from '../js/fb.js';
import { h, mount, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { session, ws } from '../js/session.js';
import { icon } from '../js/icons.js';
import { scanWithCamera } from '../js/camera.js';
import { normalizeTag } from '../js/nfc.js';
import { menuButton } from './main.js';

export const canMove = () => session.can('RECORD_STOCK_MOVEMENTS');
export const canBuy = () => session.can('WH_PURCHASE') || session.can('POS_MANAGE');
export const canApprove = () => session.can('WH_APPROVE');

/** Every place stock is kept: the main site, then each branch or warehouse still open. */
export function places() {
  return [{ id: '', name: t('mainShop'), kind: 'STORE' }, ...session.branches.filter((b) => b.active !== false)
    .map((b) => ({ id: b.id, name: b.name, kind: b.kind === 'WAREHOUSE' ? 'WAREHOUSE' : 'STORE' }))];
}
/** The places this account works at. */
export const myPlaces = () => places().filter((p) => !session.branchIds.length || session.branchIds.includes(p.id));
export const isMine = (id) => !session.branchIds.length || session.branchIds.includes(id || '');
export const placeName = (id) => session.branchName(id || '');

export function head(title, ...extra) {
  return h('div', { class: 'page-head' }, menuButton(), h('h1', {}, title), h('span', { class: 'grow' }), ...extra);
}

/** A fresh document id, made here so a write retried offline lands on the same record. */
export const newId = (col) => doc(collection(db, ws(col))).id;

/** "GRN-261007-1432-AB": readable, sortable, unique enough between two phones. */
export function refNo(prefix, at = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const tag = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `${prefix}-${String(at.getFullYear()).slice(2)}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}-${tag}`;
}

/** One stock movement, as the app and the till write them, marked as the warehouse's. */
export function movement(p, type, qtyMilli, branchId, { reference = '', note = '', reason = '', kind = '' } = {}) {
  const now = Date.now();
  return {
    barcode: p.barcode, productName: p.name || '', branchId: branchId || '', type, quantityMilli: qtyMilli, at: now,
    source: 'WAREHOUSE', reference, note, ...(reason ? { reason } : {}), ...(kind ? { kind } : {}),
    createdByUid: session.uid, createdByName: session.name, createdAt: now,
  };
}

/** Adds an audit entry to [batch]: who did what to which record, before and after. */
export function audit(batch, entity, entityId, entityLabel, action, { field = '', oldValue = '', newValue = '' } = {}) {
  batch.set(doc(collection(db, ws('auditLog'))), {
    stockCheckId: '', entity, entityId, entityLabel, action, field,
    oldValue: String(oldValue), newValue: String(newValue),
    actorUid: session.uid, actorName: session.name, at: Date.now(),
  });
}

/**
 * Sends a batch without waiting for the server: with no signal it is kept on
 * the phone and sent when the connection returns, and the screen moves on.
 * Firestore shows the change locally at once either way.
 */
export function send(batch, okMessage) {
  batch.commit().catch((err) => toast(`${t('errSave')}: ${err.message || err}`, 'error'));
  if (okMessage) toast(navigator.onLine ? okMessage : `${okMessage} · ${t('savedOffline')}`, 'ok');
}

/** A product from a scan, a tag, or what was typed (barcode or exact name). */
export function findProduct(text) {
  const code = String(text || '').trim();
  if (!code) return null;
  return session.find(code) || session.find(normalizeTag(code))
    || session.products.find((p) => (p.name || '').toLowerCase() === code.toLowerCase()) || null;
}

let listId = 0;
/**
 * A scan box: a USB scanner types and presses Enter; the camera button
 * reads a barcode; typing a name offers matches. [onPick] gets the product,
 * [onUnknown] the code when nothing matches (default: says so).
 */
export function productBox({ onPick, onUnknown, placeholder = t('scanOrType'), big = false, autofocus = true } = {}) {
  const id = `wh-products-${++listId}`;
  const input = h('input', {
    class: big ? 'scan big' : 'scan', placeholder, autocomplete: 'off', list: id, autofocus, 'aria-label': placeholder,
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      take(input.value);
    },
  });
  const take = (raw) => {
    const code = String(raw || '').trim();
    input.value = '';
    if (!code) return;
    const p = findProduct(code);
    if (p) onPick(p);
    else if (onUnknown) onUnknown(code);
    else toast(`${t('notFound')}: ${code}`, 'error');
    input.focus();
  };
  const box = h('div', { class: 'scanwrap' },
    h('div', { class: 'search-box' }, icon('barcode', big ? 22 : 18), input),
    h('button', { type: 'button', class: 'icon-btn', title: t('scanCamera'), style: big ? { width: '56px', minHeight: '56px' } : {},
      onclick: async () => { const c = await scanWithCamera(); if (c) take(c); else input.focus(); } }, icon('camera', 20)),
    h('datalist', { id }, session.products.filter((p) => p.active !== false).slice(0, 3000).map((p) => h('option', { value: p.name || p.barcode }, p.barcode))));
  box.focus = () => input.focus();
  return box;
}

/** A coloured status chip. */
export function pill(text, tone = '') {
  return h('span', { class: `pill${tone ? ` ${tone}` : ''}` }, text);
}

export const PO_TONE = { DRAFT: '', SUBMITTED: 'warn', APPROVED: 'good', ORDERED: 'good', PARTIAL: 'warn', RECEIVED: 'good', CLOSED: '', CANCELLED: 'bad' };
export const TR_TONE = { DRAFT: '', SENT: 'warn', RECEIVED: 'good', CANCELLED: 'bad' };

/** What is still to come on a purchase order line: damaged goods count as delivered, rejected ones do not. */
export const outstanding = (l) => Math.max(0, (l.qtyMilli || 0) - (l.receivedMilli || 0) - (l.damagedMilli || 0));

export function loading(box) {
  mount(box, h('p', { class: 'muted' }, t('loading')));
}
export function failed(box, err) {
  mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`));
}

/** A big tappable tile, for the phone home screen. */
export function actionTile(iconName, label, sub, onClick, tone = '') {
  return h('button', { class: `wh-tile${tone ? ` ${tone}` : ''}`, onclick: onClick },
    h('span', { class: 'ic-wrap' }, icon(iconName, 26)), h('span', { class: 't' }, label), sub ? h('span', { class: 's' }, sub) : null);
}
