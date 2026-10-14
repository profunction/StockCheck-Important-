/**
 * The warehouse's own sums, shared by JSOX WMS (web/wh/) and the API's
 * morning report (api/wms.js is a copy; CI checks the two match). Pure, no
 * imports: tested in wms.test.mjs. Quantities are thousandths of the
 * product's unit, as everywhere else (UNIT = 1000).
 *
 * - Cartons: a product may say how many pieces come in one carton
 *   (packSize, packName). Stock is still kept in pieces; cartons are only
 *   how people type and read it.
 * - Expiry: a delivery may carry an expiry date. What is on the shelf is
 *   taken to be what came in most recently (older stock sells first), so
 *   the dates still on the shelf are those of the latest deliveries.
 * - Reservations: stock promised to a customer is still on hand but not
 *   available to promise again.
 * - Month end: a frozen copy of stock and its value on the last day.
 */

const UNIT = 1000;
const DAY = 86_400_000;
const MY = 8 * 3600_000; // Malaysia is UTC+8 all year

// ------------------------------------------------------------------ cartons

/** The product's carton, or null when it has none: { size, name }. */
export function packOf(product) {
  const size = Math.round(Number(product?.packSize) || 0);
  if (size < 2) return null;
  return { size, name: String(product?.packName || '').trim() || 'ctn' };
}

/** Cartons and loose pieces -> thousandths of a piece. */
export function fromPacks(packs, pieces, size) {
  const p = Math.max(0, Math.round(Number(packs) || 0));
  const loose = Math.max(0, Number(pieces) || 0);
  return Math.round((p * Math.max(1, size) + loose) * UNIT);
}

/** Thousandths of a piece -> { packs, pieces } (pieces may be fractional). */
export function toPacks(qtyMilli, size) {
  const whole = Math.max(1, size) * UNIT;
  const packs = Math.floor(Math.max(0, qtyMilli) / whole);
  return { packs, pieces: (Math.max(0, qtyMilli) - packs * whole) / UNIT };
}

// ------------------------------------------------------------------- expiry

const IN = new Set(['RECEIVE', 'TRANSFER_IN', 'REFUND']);

/** "2026-12-31" -> that day's end in Malaysia, ms; null for no date. */
export function expiryEnd(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3] + 1) - MY - 1;
}

/** Whole days from [now] to the end of [date]: 0 = today, negative = past. */
export function daysLeft(date, now = Date.now()) {
  const end = expiryEnd(date);
  if (end == null) return null;
  const today = Math.floor((now + MY) / DAY);
  const day = Math.floor((end + MY) / DAY);
  return day - today;
}

/**
 * What is still on the shelf of one product at one place, by delivery.
 * [moves] are that product's movements there; [onHandMilli] is the ledger's
 * figure. The newest goods in are taken to be what is left. Returns the
 * deliveries still (partly) there, newest first: { expiry, qtyMilli, at,
 * reference }; stock older than every delivery (from a count) has no date.
 */
export function lotsLeft(moves, onHandMilli) {
  let left = Math.max(0, onHandMilli || 0);
  const out = [];
  const ins = moves.filter((m) => IN.has(m.type) && m.quantityMilli > 0).sort((a, b) => b.at - a.at);
  for (const m of ins) {
    if (left <= 0) break;
    const q = Math.min(left, m.quantityMilli);
    left -= q;
    out.push({ expiry: m.expiry || '', qtyMilli: q, at: m.at, reference: m.reference || '' });
  }
  if (left > 0) out.push({ expiry: '', qtyMilli: left, at: 0, reference: '' });
  return out;
}

/** The earliest expiry date among [lots], or ''. */
export function firstExpiry(lots) {
  return lots.map((l) => l.expiry).filter(Boolean).sort()[0] || '';
}

/**
 * Lots that run out within [days] (or already have), soonest first:
 * { ...lot, daysLeft }. [levels] are ledger rows for one place (key, name,
 * onHand); [moves] that place's movements.
 */
export function expiring(levels, moves, { now = Date.now(), days = 30 } = {}) {
  const byKey = new Map();
  for (const m of moves) {
    if (!m.barcode) continue;
    if (!byKey.has(m.barcode)) byKey.set(m.barcode, []);
    byKey.get(m.barcode).push(m);
  }
  const out = [];
  for (const level of levels) {
    if (!(level.onHand > 0)) continue;
    for (const lot of lotsLeft(byKey.get(level.key) || [], level.onHand)) {
      const d = daysLeft(lot.expiry, now);
      if (d != null && d <= days) out.push({ ...lot, key: level.key, name: level.name || level.key, unit: level.unit || '', daysLeft: d });
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------- reservations

/** barcode -> quantity promised and not yet delivered at [branch] ('ALL' = everywhere). */
export function reservedAt(reservations, branch) {
  const out = new Map();
  for (const r of reservations || []) {
    if (r.status !== 'OPEN' || (branch !== 'ALL' && (r.branchId || '') !== branch)) continue;
    for (const l of r.lines || []) out.set(l.barcode, (out.get(l.barcode) || 0) + (l.qtyMilli || 0));
  }
  return out;
}

/** Lines asking for more than is free to promise: [{ ...line, availableMilli }]. */
export function overPromised(lines, available) {
  return lines.filter((l) => (l.qtyMilli || 0) > (available.get(l.barcode) ?? 0))
    .map((l) => ({ ...l, availableMilli: available.get(l.barcode) ?? 0 }));
}

// --------------------------------------------------------------- month end

/** "2026-10" for [now], in Malaysia. */
export const monthOf = (now = Date.now()) => new Date(now + MY).toISOString().slice(0, 7);

/** The month before "2026-10": "2026-09". */
export function monthBefore(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** The last moment of "2026-09" in Malaysia, ms. */
export function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  return Date.UTC(y, m, 1) - MY - 1;
}

/**
 * A month-end copy of stock rows (data.js stockRows, or ledger levels with
 * costs): only what is needed to read it back, and the total value.
 */
export function closingRows(rows, costOf) {
  const lines = rows.filter((r) => r.onHand !== 0).map((r) => {
    const costSen = costOf(r.key) ?? 0;
    return {
      barcode: r.barcode || r.key, name: r.name || r.key, unit: r.unit || '',
      onHandMilli: r.onHand, costSen, valueSen: Math.round(Math.max(0, r.onHand) * costSen / UNIT),
    };
  });
  return { lines, valueSen: lines.reduce((s, l) => s + l.valueSen, 0), qtyMilli: lines.reduce((s, l) => s + l.onHandMilli, 0) };
}
