/**
 * What every TMS page shares: who may do what, the places, the records the
 * pages read, and the audit entry each change leaves -- in the same
 * collections as the warehouse (transfers, reservations, auditLog).
 */
import { collection, db, doc, getDocs, query, where } from '../js/fb.js';
import { h, toast } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { session, ws } from '../js/session.js';
import { menuButton } from './main.js';

/** Plans trips, drives, clocks in: whoever moves stock. */
export const canWork = () => session.can('RECORD_STOCK_MOVEMENTS');
/** Adds lorries and drivers: a manager. */
export const canManage = () => session.isAdmin || session.can('WH_APPROVE') || session.can('POS_MANAGE');

export function places() {
  return [{ id: '', name: t('mainShop'), kind: 'STORE' }, ...session.branches.filter((b) => b.active !== false)
    .map((b) => ({ id: b.id, name: b.name, kind: b.kind === 'WAREHOUSE' ? 'WAREHOUSE' : 'STORE' }))];
}
export const myPlaces = () => places().filter((p) => !session.branchIds.length || session.branchIds.includes(p.id));
export const placeName = (id) => session.branchName(id || '');

export function head(title, ...extra) {
  return h('div', { class: 'page-head' }, menuButton(), h('h1', {}, title), h('span', { class: 'grow' }), ...extra);
}

export const pill = (text, tone = '') => h('span', { class: `pill${tone ? ` ${tone}` : ''}` }, text);
export const TRIP_TONE = { PLANNED: '', LOADING: 'warn', ON_ROAD: 'good', DONE: '', CANCELLED: 'bad' };
export const STOP_TONE = { PENDING: 'warn', DELIVERED: 'good', FAILED: 'bad' };

export const newId = (col) => doc(collection(db, ws(col))).id;

/** "TRP-261011-0930-AB". */
export function refNo(prefix, at = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const tag = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `${prefix}-${String(at.getFullYear()).slice(2)}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}-${tag}`;
}

export function audit(batch, entity, entityId, entityLabel, action, { field = '', oldValue = '', newValue = '' } = {}) {
  batch.set(doc(collection(db, ws('auditLog'))), {
    stockCheckId: '', entity, entityId, entityLabel, action, field,
    oldValue: String(oldValue), newValue: String(newValue),
    actorUid: session.uid, actorName: session.name, at: Date.now(),
  });
}

/** Sends without waiting: offline it is kept and sent later; the screen moves on. */
export function send(batch, okMessage) {
  batch.commit().catch((err) => toast(`${t('errSave')}: ${err.message || err}`, 'error'));
  if (okMessage) toast(navigator.onLine ? okMessage : `${okMessage} · ${t('savedOffline')}`, 'ok');
}

const inList = () => [...session.branchIds, ''].slice(0, 30);
const all = async (col) => (await getDocs(collection(db, ws(col)))).docs.map((d) => ({ ...d.data(), id: d.id }));
const mine = async (col, field = 'branchId') => {
  const c = collection(db, ws(col));
  const snap = await getDocs(session.branchIds.length ? query(c, where(field, 'in', inList())) : c);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
};

/** Lorries, drivers, the last two weeks' shifts, and the trips. */
export async function loadFleet() {
  const since = Date.now() - 14 * 86_400_000;
  const [lorries, drivers, shifts, trips] = await Promise.all([
    all('tmsLorries').catch(() => []),
    all('tmsDrivers').catch(() => []),
    getDocs(query(collection(db, ws('tmsShifts')), where('inAt', '>=', since))).then((s) => s.docs.map((d) => ({ ...d.data(), id: d.id }))).catch(() => []),
    mine('tmsTrips').catch(() => []),
  ]);
  const byName = (a, b) => (a.plate || a.name || '').localeCompare(b.plate || b.name || '');
  return {
    lorries: lorries.sort(byName), drivers: drivers.sort(byName),
    shifts: shifts.sort((a, b) => (b.inAt || 0) - (a.inAt || 0)),
    trips: trips.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
  };
}

/** The warehouse's transfers and reservations: what trips carry. */
export async function loadOrders() {
  const c = collection(db, ws('transfers'));
  const [from, reservations] = await Promise.all([
    getDocs(session.branchIds.length ? query(c, where('fromBranch', 'in', inList())) : c).then((s) => s.docs.map((d) => ({ ...d.data(), id: d.id }))).catch(() => []),
    mine('reservations').catch(() => []),
  ]);
  return { transfers: from, reservations };
}

/** Where a stop goes, in words. */
export const stopTo = (s) => (s.kind === 'TRANSFER' ? placeName(s.to) : s.to || s.name || '—');
export const stopKind = (s) => t(s.kind === 'TRANSFER' ? 'tmTransfer' : s.kind === 'RESERVATION' ? 'tmReservation' : 'tmManual');

/** A signature (counting.js ink: "x,y x,y;...") as a small picture. */
export function inkPicture(ink, { w = 180, hgt = 60 } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const pic = document.createElementNS(NS, 'svg');
  pic.setAttribute('viewBox', '0 0 1000 333');
  pic.setAttribute('width', w);
  pic.setAttribute('height', hgt);
  pic.setAttribute('class', 'tm-ink');
  for (const stroke of String(ink || '').split(';').filter(Boolean)) {
    const pts = stroke.trim().split(/\s+/).map((p) => p.split(',').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
    if (!pts.length) continue;
    const line = document.createElementNS(NS, 'polyline');
    line.setAttribute('points', pts.map(([x, y]) => `${x},${y / 3}`).join(' '));
    pic.append(line);
  }
  return pic;
}

/** Where each place stands on the map (tmsPlaces/, set on the map page): id -> [lat, lng]. */
export async function loadPlacesGeo() {
  const snap = await getDocs(collection(db, ws('tmsPlaces'))).catch(() => null);
  return new Map((snap?.docs || []).map((d) => [d.id === '-' ? '' : d.id, [d.data().lat, d.data().lng]]));
}
