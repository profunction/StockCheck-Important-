/**
 * JSOX TMS -- the lorries, the drivers and the trips that take the goods
 * out. The sums behind web/tm/; no Firebase here, so they are tested alone
 * (tms.test.mjs).
 *
 *   trip   PLANNED -> LOADING -> ON_ROAD -> DONE, or CANCELLED
 *   stop   PENDING -> DELIVERED (who received it, their signature) or FAILED
 *
 * A trip carries goods the warehouse already decided to send: transfers to
 * another place not yet received there, and reservations still to hand to
 * a customer. Delivering a stop records the proof; the stock itself moves
 * where it always did (the transfer received at the branch, the
 * reservation handed over in the WMS).
 */

export const TRIP_LIVE = ['PLANNED', 'LOADING', 'ON_ROAD'];

/**
 * Stops waiting for a lorry at depot [branch]: transfers out of it that are
 * approved or already sent and not yet received, and reservations held
 * there -- less those already on a trip that is live or done.
 */
export function stopsToPlan({ transfers = [], reservations = [], trips = [] }, branch) {
  const taken = new Set(trips.filter((t) => t.status !== 'CANCELLED')
    .flatMap((t) => (t.stops || []).filter((s) => s.status !== 'FAILED' || t.status !== 'DONE').map((s) => `${s.kind}:${s.refId}`)));
  const here = (id) => (id || '') === (branch || '');
  return [
    ...transfers.filter((tr) => ['APPROVED', 'SENT'].includes(tr.status) && here(tr.fromBranch) && (tr.toBranch ?? null) !== null)
      .map((tr) => ({ kind: 'TRANSFER', refId: tr.id, ref: tr.transferNo, to: tr.toBranch, units: units(tr.lines), at: tr.sentAt || tr.approvedAt || tr.createdAt || 0 })),
    ...reservations.filter((r) => r.status === 'OPEN' && here(r.branchId))
      .map((r) => ({ kind: 'RESERVATION', refId: r.id, ref: r.reservationNo, to: r.forWhom || '', units: units(r.lines), at: r.createdAt || 0 })),
  ].filter((s) => !taken.has(`${s.kind}:${s.refId}`)).sort((a, b) => a.at - b.at);
}

const units = (lines = []) => lines.reduce((s, l) => s + (l.qtyMilli || 0), 0);

/** How far a trip has got. */
export function tripProgress(trip) {
  const stops = trip?.stops || [];
  const delivered = stops.filter((s) => s.status === 'DELIVERED').length;
  const failed = stops.filter((s) => s.status === 'FAILED').length;
  return { total: stops.length, delivered, failed, left: stops.length - delivered - failed, finished: stops.length > 0 && delivered + failed === stops.length };
}

/** The next stop to drive to, or null. */
export const nextStop = (trip) => (trip?.stops || []).find((s) => (s.status || 'PENDING') === 'PENDING') || null;

/** What a trip may become next, from what it is now and its stops. */
export function nextStatuses(trip) {
  const p = tripProgress(trip);
  switch (trip?.status) {
    case 'PLANNED': return p.total ? ['LOADING', 'CANCELLED'] : ['CANCELLED'];
    case 'LOADING': return ['ON_ROAD', 'PLANNED'];
    case 'ON_ROAD': return p.finished ? ['DONE'] : [];
    default: return [];
  }
}

const DAY = 86_400_000;

/** Days from [now] to the end of [date] ("2026-10-31"); null without one. */
export function daysTo(date, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
  const end = Date.parse(`${date}T23:59:59+08:00`);
  return Math.floor((end - now) / DAY);
}

/**
 * A lorry's papers running out (road tax, insurance, inspection) or a
 * driver's licence: [{ key, date, days }] for those within [within] days
 * or past, soonest first.
 */
export function papersDue(item, keys, { now = Date.now(), within = 30 } = {}) {
  return keys.map((key) => ({ key, date: item?.[key] || '', days: daysTo(item?.[key], now) }))
    .filter((x) => x.days != null && x.days <= within).sort((a, b) => a.days - b.days);
}

/** A shift's length in minutes; an open one counts to [now]. */
export const shiftMinutes = (s, now = Date.now()) => Math.max(0, Math.round(((s.outAt ?? now) - (s.inAt ?? now)) / 60000));

/** "7h 05m". */
export const hoursText = (min) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;

/** Kilometres between two odometer readings, or null. */
export const kmDriven = (s) => (Number.isFinite(s.odoIn) && Number.isFinite(s.odoOut) && s.odoOut >= s.odoIn ? s.odoOut - s.odoIn : null);

/**
 * Who is on duty: the open shift per driver and per lorry (a later shift
 * wins if two were left open).
 */
export function onDuty(shifts = []) {
  const drivers = new Map();
  const lorries = new Map();
  for (const s of [...shifts].filter((x) => !x.outAt).sort((a, b) => (a.inAt || 0) - (b.inAt || 0))) {
    drivers.set(s.driverId, s);
    if (s.lorryId) lorries.set(s.lorryId, s);
  }
  return { drivers, lorries };
}
