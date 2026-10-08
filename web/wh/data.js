/**
 * Stock as the warehouse sees it. On hand is the shared ledger (last count
 * plus movements since -- ledger.js, the same as the app and the till); on
 * top of it, what is on its way: transfers dispatched to a place and not yet
 * received, and purchase orders not yet delivered.
 *
 *   available = on hand - reserved      (open reservations, reservations.js)
 */
import { collection, db, getDocs, query, where } from '../js/fb.js';
import { levelsFor, loadStockData } from '../js/stockdata.js';
import { session, ws } from '../js/session.js';
import { isLow } from '../js/ledger.js';
import { canApprove, canBuy, canMove, outstanding } from './common.js';
import { reservedAt } from '../js/wms.js';

const inList = () => [...session.branchIds, ''].slice(0, 30);

export async function loadTransfers() {
  const col = collection(db, ws('transfers'));
  const snaps = session.branchIds.length
    ? await Promise.all([query(col, where('fromBranch', 'in', inList())), query(col, where('toBranch', 'in', inList()))].map((q) => getDocs(q)))
    : [await getDocs(col)];
  return [...new Map(snaps.flatMap((s) => s.docs).map((d) => [d.id, { ...d.data(), id: d.id }])).values()]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function loadPurchaseOrders() {
  if (!canBuy() && !canApprove() && !canMove()) return [];
  const col = collection(db, ws('purchaseOrders'));
  const snap = await getDocs(session.branchIds.length ? query(col, where('branchId', 'in', inList())) : col);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** Stock promised to customers and not yet handed over. */
export async function loadReservations() {
  if (!canMove() && !session.can('POS_MANAGE') && !canBuy()) return [];
  const col = collection(db, ws('reservations'));
  const snap = await getDocs(session.branchIds.length ? query(col, where('branchId', 'in', inList())) : col);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** Counts, movements, transfers, purchase orders and reservations, read together. */
export async function loadAll() {
  const [stock, transfers, pos, reservations] = await Promise.all([
    loadStockData(),
    loadTransfers().catch(() => []),
    loadPurchaseOrders().catch(() => []),
    loadReservations().catch(() => []),
  ]);
  return { stock, transfers, pos, reservations };
}

const at = (branch, id) => branch === 'ALL' || (id || '') === branch;

/** barcode -> quantity on its way to [branch] in dispatched transfers. */
export function inTransit(transfers, branch) {
  const out = new Map();
  for (const tr of transfers) {
    if (tr.status !== 'SENT' || !at(branch, tr.toBranch)) continue;
    for (const l of tr.lines || []) out.set(l.barcode, (out.get(l.barcode) || 0) + (l.qtyMilli || 0));
  }
  return out;
}

/** barcode -> quantity still to come on approved purchase orders for [branch]. */
export function onOrder(pos, branch) {
  const out = new Map();
  for (const po of pos) {
    if (!['APPROVED', 'ORDERED', 'PARTIAL'].includes(po.status) || !at(branch, po.branchId)) continue;
    for (const l of po.lines || []) out.set(l.barcode, (out.get(l.barcode) || 0) + outstanding(l));
  }
  return out;
}

/**
 * One row per product for [branch] ('ALL' = every place added up): the
 * ledger's figures plus in transit, on order, available and value. Products
 * with a reorder point that were never counted or moved show as nothing on
 * hand, so they can still be reordered.
 */
export function stockRows(data, branch) {
  const catalogue = new Map(session.products.map((p) => [p.barcode, p]));
  const levels = levelsFor(data.stock, branch, catalogue);
  const seen = new Set(levels.map((l) => l.key));
  for (const p of session.products) {
    if (seen.has(p.barcode) || p.reorderLevelMilli == null || p.trackStock === false || p.active === false) continue;
    seen.add(p.barcode);
    levels.push({ key: p.barcode, barcode: p.barcode, name: p.name || p.barcode, unit: p.unit || '', counted: null, countedAt: null, inSince: 0, outSince: 0, onHand: 0, reorderLevel: p.reorderLevelMilli });
  }
  const transit = inTransit(data.transfers, branch);
  const ordered = onOrder(data.pos, branch);
  const held = reservedAt(data.reservations, branch);
  // On its way here but never held here before: still a row, nothing on hand.
  for (const key of [...transit.keys(), ...ordered.keys(), ...held.keys()]) {
    if (seen.has(key)) continue;
    seen.add(key);
    const p = catalogue.get(key);
    levels.push({ key, barcode: key, name: p?.name || key, unit: p?.unit || '', counted: null, countedAt: null, inSince: 0, outSince: 0, onHand: 0, reorderLevel: p?.reorderLevelMilli ?? null });
  }
  return levels.map((l) => {
    const product = catalogue.get(l.key) || null;
    const reserved = held.get(l.key) || 0;
    return {
      ...l,
      product,
      inTransit: transit.get(l.key) || 0,
      onOrder: ordered.get(l.key) || 0,
      reserved,
      available: l.onHand - reserved,
      valueSen: Math.round(Math.max(0, l.onHand) * (product?.costSen || 0) / 1000),
      low: isLow(l),
      out: l.onHand <= 0,
    };
  }).sort((a, b) => (a.name || a.key).toLowerCase().localeCompare((b.name || b.key).toLowerCase()));
}

/**
 * How much to buy: up to the product's maximum (or twice its reorder point
 * when no maximum is set), less what is on hand and already on order. Only
 * for products at or below their reorder point. A suggestion -- nothing is
 * ordered until somebody raises and approves a purchase order.
 */
export function reorderSuggestions(rows) {
  return rows.filter((r) => r.reorderLevel != null && r.onHand - (r.reserved || 0) + r.onOrder <= r.reorderLevel).map((r) => {
    const target = r.product?.maxStockMilli ?? r.reorderLevel * 2;
    let qty = Math.max(0, target - r.onHand + (r.reserved || 0) - r.onOrder);
    if (!['kg', 'g', 'l', 'ml', 'm'].includes((r.unit || '').toLowerCase())) qty = Math.ceil(qty / 1000) * 1000;
    return { ...r, suggestMilli: qty };
  }).filter((r) => r.suggestMilli > 0);
}
