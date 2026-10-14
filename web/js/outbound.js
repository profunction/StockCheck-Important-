/**
 * Outbound (出货): every order leaving a warehouse, from the moment it is
 * made to the moment it is signed for, on one line:
 *
 *   CREATED -> PICKING -> PACKING -> PACKED -> LOADED -> ON_ROAD -> DELIVERED
 *
 * Nothing here is stored as "the stage": it is read off what each step
 * already records -- the picklist (picking.js), the packing record
 * (`outbound/{kind}-{id}`: cartons, staging lane, loaded), the TMS trip
 * that carries it (tms.js) and the order itself (a transfer received, a
 * reservation handed over). So the board can never disagree with the
 * pages that do the work. No Firebase here; tested in outbound.test.mjs.
 */

export const STAGES = ['CREATED', 'PICKING', 'PACKING', 'PACKED', 'LOADED', 'ON_ROAD', 'DELIVERED'];

/** The loading bays for lorries going out, and the lanes packed goods wait in. */
export const OUT_DOCKS = ['OUT-1', 'OUT-2', 'OUT-3', 'OUT-4'];
export const LANES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

/** The id of an order's packing record: one per order. */
export const packKey = (kind, id) => `${kind === 'TRANSFER' ? 'TR' : 'RS'}-${id}`;

const DAY = 86_400_000;
const units = (lines = []) => lines.reduce((s, l) => s + (l.qtyMilli || 0), 0);

/** Loaded onto this very trip (not one before it that came back). */
export const loadedOn = (pack, trip) => !!(pack && trip && pack.status === 'LOADED' && pack.tripId === trip.id);

/**
 * Where one order is. [order] is {kind, status}; the rest are what the
 * other steps recorded about it, each optional.
 */
export function stageOf({ order, pick, pack, trip, stop }) {
  if (order.kind === 'TRANSFER' ? order.status === 'RECEIVED' : order.status === 'DELIVERED') return 'DELIVERED';
  if (stop?.status === 'DELIVERED') return 'DELIVERED';
  if (trip?.status === 'ON_ROAD' || (trip?.status === 'DONE' && stop?.status !== 'FAILED')) return 'ON_ROAD';
  // Sent without a lorry of ours (a courier, their own van): on its way all the same.
  if (order.kind === 'TRANSFER' && order.status === 'SENT' && !trip) return 'ON_ROAD';
  if (loadedOn(pack, trip) && ['PLANNED', 'LOADING'].includes(trip.status)) return 'LOADED';
  // Packed, or loaded on a lorry that brought it back: waiting in its lane.
  if (pack?.status === 'PACKED' || pack?.status === 'LOADED') return 'PACKED';
  if (pick?.status === 'DONE') return 'PACKING';
  if (pick && ['WAITING', 'PICKING'].includes(pick.status)) return 'PICKING';
  return 'CREATED';
}

/**
 * Every order going out of [branch], with its stage and what carries it:
 * transfers out of it (not drafts, not cancelled) and reservations held
 * there. Those finished more than [keepDays] ago drop off the board.
 * Urgent first, then oldest first: first in, first out.
 */
export function outboundOrders({ transfers = [], reservations = [], picklists = [], packs = [], trips = [] }, branch, { now = Date.now(), keepDays = 3 } = {}) {
  const here = (id) => (id || '') === (branch || '');
  const pickOf = new Map();
  for (const p of picklists) {
    if (p.status === 'CANCELLED') continue;
    for (const o of p.orders || []) {
      const k = `${o.kind}:${o.id}`;
      // The newest picklist wins (one cancelled and picked again).
      if (!pickOf.has(k) || (pickOf.get(k).createdAt || 0) < (p.createdAt || 0)) pickOf.set(k, p);
    }
  }
  const packOf = new Map(packs.map((p) => [`${p.kind}:${p.orderId}`, p]));
  const tripOf = new Map();
  for (const tr of trips) {
    if (tr.status === 'CANCELLED') continue;
    for (const s of tr.stops || []) {
      const k = `${s.kind}:${s.refId}`;
      const had = tripOf.get(k);
      // A stop that failed on one trip and went again on the next: the later trip.
      if (!had || (had.trip.createdAt || 0) < (tr.createdAt || 0)) tripOf.set(k, { trip: tr, stop: s });
    }
  }
  const list = [
    ...transfers.filter((x) => here(x.fromBranch) && (x.toBranch ?? null) !== null && ['PENDING', 'APPROVED', 'SENT', 'RECEIVED'].includes(x.status))
      .map((x) => ({ kind: 'TRANSFER', id: x.id, ref: x.transferNo, to: x.toBranch, status: x.status, at: x.approvedAt || x.submittedAt || x.createdAt || 0, closedAt: x.receivedAt || 0, lines: x.lines || [] })),
    ...reservations.filter((r) => here(r.branchId) && ['OPEN', 'DELIVERED'].includes(r.status))
      .map((r) => ({ kind: 'RESERVATION', id: r.id, ref: r.reservationNo, to: r.forWhom || '', status: r.status, at: r.createdAt || 0, closedAt: r.closedAt || 0, lines: r.lines || [] })),
  ].map((o) => {
    const k = `${o.kind}:${o.id}`;
    const carried = tripOf.get(k) || {};
    const pick = pickOf.get(k) || null;
    const pack = packOf.get(k) || null;
    const stage = stageOf({ order: o, pick, pack, trip: carried.trip, stop: carried.stop });
    return { ...o, key: packKey(o.kind, o.id), units: units(o.lines), stage, urgent: !!pack?.urgent, pick, pack, trip: carried.trip || null, stop: carried.stop || null };
  }).filter((o) => o.stage !== 'DELIVERED' || now - (o.closedAt || o.stop?.at || o.trip?.doneAt || now) <= keepDays * DAY);
  return list.sort((a, b) => (b.urgent - a.urgent) || (a.at - b.at));
}

/** How many orders stand at each stage. */
export function stageCounts(orders) {
  const out = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const o of orders) out[o.stage] += 1;
  return out;
}

/**
 * The loading docks: for each OUT dock the trip called to it (planned or
 * loading) and its orders; then the yard -- trips planned at [branch] with
 * no dock yet, oldest first -- and the docks still free.
 */
export function dockBoard(trips = [], orders = [], branch = '') {
  const live = trips.filter((tr) => (tr.branchId || '') === (branch || '') && ['PLANNED', 'LOADING'].includes(tr.status));
  const byKey = new Map(orders.map((o) => [`${o.kind}:${o.id}`, o]));
  const withOrders = (tr) => ({ trip: tr, orders: (tr.stops || []).map((s) => byKey.get(`${s.kind}:${s.refId}`) || { kind: s.kind, id: s.refId, ref: s.ref, to: s.to, stage: 'CREATED', pack: null, missing: true }) });
  const docks = OUT_DOCKS.map((dock) => {
    const tr = live.find((x) => x.dock === dock);
    return { dock, ...(tr ? withOrders(tr) : { trip: null, orders: [] }) };
  });
  const yard = live.filter((x) => !x.dock || !OUT_DOCKS.includes(x.dock)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map(withOrders);
  return { docks, yard, free: docks.filter((d) => !d.trip).map((d) => d.dock) };
}

/** A trip can leave the dock when every order on it is loaded. */
export const allLoaded = (trip, orders) => orders.length > 0 && orders.every((o) => loadedOn(o.pack, trip));

/** Packed orders waiting in each staging lane, not yet on a lorry. */
export function laneBoard(orders) {
  const out = new Map(LANES.map((l) => [l, []]));
  for (const o of orders) {
    if (o.stage !== 'PACKED') continue;
    const lane = LANES.includes(o.pack?.lane) ? o.pack.lane : LANES[0];
    out.get(lane).push(o);
  }
  return out;
}

/** The packing tables. */
export const STATIONS = ['P1', 'P2', 'P3', 'P4'];

/**
 * Automatic dispatch (自动): what the warehouse would do next on its own at
 * [branch], worked out from the same records as the board --
 *
 *   picklists  orders ready to pick (transfers approved, reservations held,
 *              not on a picklist yet), one picklist per lorry they are
 *              planned on, else per place they go to
 *   stations   orders picked and not packed yet, each given the packing
 *              table with the fewest waiting (and the first empty lane)
 *   docks      lorries waiting in the yard whose orders are all packed,
 *              urgent first, each called to a free dock
 *
 * [ordersToPick] is picking.js's, passed in so this file stays alone.
 * Nothing is written here; the WMS (web/wh/auto.js) writes it.
 */
export function autoPlan(data, branch, ordersToPick) {
  const orders = outboundOrders(data, branch);
  const live = (data.trips || []).filter((tr) => ['PLANNED', 'LOADING'].includes(tr.status) && (tr.branchId || '') === (branch || ''));
  const tripOf = new Map(live.flatMap((tr) => (tr.stops || []).map((s) => [`${s.kind}:${s.refId}`, tr])));

  const groups = new Map();
  for (const o of ordersToPick(data, branch).filter((x) => x.kind === 'RESERVATION' || x.status === 'APPROVED')) {
    const tr = tripOf.get(`${o.kind}:${o.id}`);
    const key = tr ? `trip:${tr.id}` : o.kind === 'TRANSFER' ? `to:${o.to ?? ''}` : `customer:${o.to || o.id}`;
    if (!groups.has(key)) groups.set(key, { key, trip: tr || null, orders: [] });
    groups.get(key).orders.push(o);
  }

  const load = new Map(STATIONS.map((s) => [s, 0]));
  for (const o of orders) if (o.stage === 'PACKING' && STATIONS.includes(o.pack?.station)) load.set(o.pack.station, load.get(o.pack.station) + 1);
  const lanes = laneBoard(orders);
  const laneLoad = new Map(LANES.map((l) => [l, lanes.get(l).length]));
  const stations = [];
  for (const o of orders.filter((x) => x.stage === 'PACKING' && !STATIONS.includes(x.pack?.station))) {
    const station = [...load.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0][0];
    const lane = o.pack?.lane || [...laneLoad.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0][0];
    load.set(station, load.get(station) + 1);
    laneLoad.set(lane, laneLoad.get(lane) + 1);
    stations.push({ order: o, station, lane });
  }

  const board = dockBoard(data.trips || [], orders, branch);
  const free = [...board.free];
  const ready = board.yard.filter((y) => y.orders.length && y.orders.every((o) => ['PACKED', 'LOADED'].includes(o.stage)))
    .sort((a, b) => (b.orders.some((o) => o.urgent) - a.orders.some((o) => o.urgent)) || ((a.trip.createdAt || 0) - (b.trip.createdAt || 0)));
  const docks = ready.slice(0, free.length).map((y, i) => ({ trip: y.trip, dock: free[i] }));

  return { picklists: [...groups.values()], stations, docks };
}
