/**
 * Automatic dispatch (自动): with a warehouse switched to Auto, the WMS does
 * the planning on its own, every half minute --
 *
 *   orders ready to pick become picklists, one per lorry they go on (else
 *   per place they go to); picked orders get a packing table (P1-P4) and a
 *   staging lane; lorries whose orders are all packed are called from the
 *   yard to a free dock (web/js/outbound.js autoPlan)
 *
 * -- while people still pick, pack, load and drive, and can change any of
 * it by hand. It runs wherever the WMS is open (the warehouse's screen, a
 * manager's computer): a lease on `whAuto/{place}` lets one of them do it
 * at a time, so two screens never make the same picklist twice. The
 * switch itself (on, who, when) is in the same record; a manager sets it.
 */
import { collection, db, doc, getDocs, runTransaction, setDoc, writeBatch } from '../js/fb.js';
import { session, ws } from '../js/session.js';
import { autoPlan } from '../js/outbound.js';
import { ordersToPick, pickLines, zoneOf } from '../js/picking.js';
import { audit, canApprove, canMove, myPlaces, newId, refNo, shelfOf } from './common.js';
import { loadOutbound } from './data.js';

const EVERY = 30_000;
const LEASE = 75_000;
const placeKey = (id) => id || '-';
const autoRef = (place) => doc(db, ws(`whAuto/${placeKey(place)}`));

/** Who may switch Auto on or off: a manager. */
export const canSwitchAuto = () => session.isAdmin || canApprove();

/** place id -> its Auto record ({ on, updatedByName, updatedAt, lastRun }). */
export async function autoSettings() {
  if (!canMove()) return new Map();
  const snap = await getDocs(collection(db, ws('whAuto')));
  return new Map(snap.docs.map((d) => [d.id === '-' ? '' : d.id, d.data()]));
}

export async function setAuto(place, on) {
  await setDoc(autoRef(place), { on, updatedAt: Date.now(), updatedByName: session.name, updatedByUid: session.uid }, { merge: true });
  if (on) tick();
}

/** One screen at a time: take the lease if it is free, ours, or run out. */
async function claim(place) {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(autoRef(place));
    const d = snap.exists() ? snap.data() : {};
    if (!d.on) return false;
    const now = Date.now();
    if (d.leaseBy && d.leaseBy !== session.uid && (d.leaseUntil || 0) > now) return false;
    tx.update(autoRef(place), { leaseBy: session.uid, leaseUntil: now + LEASE });
    return true;
  });
}

/** Does what the plan says at [place]; returns how much it did. */
export async function runOnce(place, data = null) {
  const all = data || await loadOutbound();
  const plan = autoPlan(all, place, ordersToPick);
  const done = { picklists: plan.picklists.length, stations: plan.stations.length, docks: plan.docks.length };
  if (!done.picklists && !done.stations && !done.docks) return done;
  const now = Date.now();
  const batch = writeBatch(db);
  for (const g of plan.picklists) {
    const id = newId('picklists');
    const lines = pickLines(g.orders, (code) => shelfOf(session.find(code), place));
    const pick = {
      pickNo: refNo('PCK'), branchId: place || '', status: 'WAITING', zone: [...new Set(lines.map((l) => zoneOf(l.bin)).filter(Boolean))].join(' '),
      orders: g.orders.map((o) => ({ kind: o.kind, id: o.id, ref: o.ref, to: o.to ?? '' })),
      lines, pickerUid: '', pickerName: '', auto: true, ...(g.trip ? { tripId: g.trip.id } : {}),
      createdByUid: session.uid, createdByName: session.name, createdAt: now, updatedAt: now,
    };
    batch.set(doc(db, ws(`picklists/${id}`)), pick);
    audit(batch, 'Picklist', id, pick.pickNo, 'CREATE', { newValue: `AUTO ${pick.orders.map((o) => o.ref).join(', ')}` });
  }
  for (const { order: o, station, lane } of plan.stations) {
    const ref = doc(db, ws(`outbound/${o.key}`));
    if (o.pack) batch.update(ref, { station, lane, updatedAt: now });
    else {
      batch.set(ref, {
        kind: o.kind, orderId: o.id, ref: o.ref, to: o.to ?? '', branchId: place || '', status: 'OPEN', urgent: false, station, lane,
        createdByUid: session.uid, createdByName: session.name, createdAt: now, updatedAt: now,
      });
    }
    audit(batch, 'Outbound', o.key, o.ref, 'UPDATE', { field: 'station', newValue: `AUTO ${station} · ${lane}` });
  }
  for (const { trip, dock } of plan.docks) {
    batch.update(doc(db, ws(`tmsTrips/${trip.id}`)), { dock, updatedAt: now });
    audit(batch, 'Trip', trip.id, trip.tripNo || '', 'UPDATE', { field: 'dock', oldValue: '', newValue: `AUTO ${dock}` });
  }
  batch.update(autoRef(place), { lastRun: now, lastDone: done });
  await batch.commit();
  return done;
}

let busy = false;
/** Once round every place switched to Auto that this screen may take. */
export async function tick() {
  if (busy || !canMove() || !session.has('warehouse')) return;
  busy = true;
  try {
    const on = await autoSettings();
    const places = myPlaces().filter((p) => on.get(p.id)?.on);
    if (!places.length) return;
    const data = await loadOutbound();
    for (const p of places) {
      if (await claim(p.id).catch(() => false)) await runOnce(p.id, data).catch((err) => console.warn('auto', err));
    }
  } catch (err) {
    console.warn('auto', err);
  } finally {
    busy = false;
  }
}

let timer = null;
/** Started once the WMS is open; keeps going while it is. */
export function startAutopilot() {
  if (timer || !canMove()) return;
  timer = setInterval(() => { if (!document.hidden) tick(); }, EVERY);
  setTimeout(tick, 2000);
}
