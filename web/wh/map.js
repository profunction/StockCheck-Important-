/**
 * The warehouse in 3D (仓库 3D): the whole site as one live picture, with
 * what to do next beside it.
 *
 * Every rack is drawn where its shelf codes say it stands
 * (web/js/warehouse3d.js); each slot is coloured by the layer chosen at the
 * bottom of the picture --
 *
 *   存量   how full the slot is against the product's maximum (a heat map)
 *   到期   the earliest expiry date on the slot
 *   拣货   slots with something still to pick on an open picklist
 *   动静   how recently stock moved there
 *   纸箱   cartons stacked as high as there are cartons
 *
 * -- the loading docks in front with the lorries the docks page called in
 * (docks.js) and those arriving, the staging lanes with what is packed, the
 * packing tables with what is being packed, pickers at their next shelf,
 * and the latest moves running along the bottom. Beside it (below it on a
 * phone): what is waiting for you, the key figures and the outbound line;
 * the racks at a glance (empty, nearly full, expired, first to expire); and
 * whatever was tapped. It looks again every half minute, keeping the view.
 * Nothing here changes stock; it is a picture of what the ledger says.
 */
import { h, mount } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty } from '../js/money.js';
import { session } from '../js/session.js';
import { shade } from '../js/iso.js';
import { night3d, scene3d } from '../js/view3d.js';
import { lorryBoxes } from '../js/town.js';
import { layout, parseBin } from '../js/warehouse3d.js';
import { lineDone } from '../js/picking.js';
import { expiring, packOf } from '../js/wms.js';
import { dockBoard, LANES, laneBoard, loadedOn, OUT_DOCKS, outboundOrders, STAGES, STATIONS, stageCounts } from '../js/outbound.js';
import { canMove, failed, head, isMine, loading, myPlaces, pill, placeName, shelfOf } from './common.js';
import { loadAll, stockRows } from './data.js';
import { expiryPill } from './stock.js';
import { go } from './main.js';

const shade2 = (c) => (c.startsWith('#') ? shade(c, -0.12) : c);
/** A shelf code as the layout writes it ("a1 l1 03" -> "A1-L1-03"). */
const layoutCode = (bin) => parseBin(bin)?.code || '';

const COLOR = {
  out: '#e5484d', empty: '#d3dce4', kraft: '#c8a26b',
  fill: ['#93c5fd', '#5eead4', '#22c55e', '#facc15', '#f97316'],
  soon: '#f97316', later: '#facc15', far: '#22a06b', none: '#9fb3c8',
  pick: '#7c3aed', idle: '#c9d4de',
  act: ['#ef4444', '#f59e0b', '#14b8a6', '#c9d4de'],
  inbound: '#2f6fde', outbound: '#0d9488',
};
/** The floor's own colours: by day, and at night (the dark showroom look). */
const PALETTES = {
  day: { floor: '#eef2f5', yard: '#c3ccd5', staging: '#dcefe9', receiving: '#dbeafe', packing: '#ede9fe', qc: '#e0f2fe', charge: '#f1f5f9',
    deck: '#c3ccd5', road: '#5b6876', dash: '#f8fafc', laneLine: '#facc15', laneSep: '#94a3b8', dockOut: '#fde68a', dockIn: '#bfdbfe', aisle: '#facc15', table: '#cbd5e1', qcBox: '#94a3b8' },
  night: { floor: '#13263a', yard: '#0b1824', staging: '#123236', receiving: '#132c45', packing: '#1f2247', qc: '#12304a', charge: '#16263a',
    deck: '#2a3a4c', road: '#070f19', dash: '#52606f', laneLine: '#b7791f', laneSep: '#2b3a4a', dockOut: '#b7791f', dockIn: '#1e4fbf', aisle: '#f59e0b', table: '#d7dee6', qcBox: '#475569' },
};
const FILL_KEYS = ['< 20%', '20–40%', '40–60%', '60–80%', '> 80%'];
const MODES = ['fill', 'expiry', 'pick', 'activity', 'cartons'];
const REFRESH = 30_000;
let scope = null;
let mode = 'fill';
let tab = 'overview';

/** A small made-up floor, shown faded until shelf codes are filled in. */
const DEMO = ['A1', 'A2', 'B1', 'B2'].flatMap((r) => [1, 2, 3].flatMap((l) => Array.from({ length: 8 }, (_, s) => ({ code: `${r}-L${l}-${s + 1}`, demo: true }))));

/** How full a product's slot may get: its maximum, else three times its reorder point. */
const capacityOf = (p) => p?.maxStockMilli || (p?.reorderLevelMilli ? p.reorderLevelMilli * 3 : 0);

/** "just now" / "5 min ago" / "2 h ago" / "3 days ago". */
export function ago(at, now = Date.now()) {
  const min = Math.max(0, Math.round((now - (at || 0)) / 60000));
  if (min < 1) return t('whAgoNow');
  if (min < 60) return t('whAgoMin').replace('{n}', min);
  if (min < 1440) return t('whAgoHour').replace('{n}', Math.round(min / 60));
  return t('whAgoDay').replace('{n}', Math.round(min / 1440));
}

export function render(main) {
  const places = myPlaces();
  if (scope == null || !places.some((p) => p.id === scope)) {
    scope = places.find((p) => p.id === session.branchId && p.kind === 'WAREHOUSE')?.id
      ?? places.find((p) => p.kind === 'WAREHOUSE')?.id ?? (places.some((p) => p.id === session.branchId) ? session.branchId : places[0]?.id ?? '');
  }
  const clock = h('span', { class: 'map-live', 'data-card': 'live' });
  const tick = () => mount(clock, h('i'), `${t('whMapLive')} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
  tick();
  const box = h('div');
  let view = null;
  let busy = false;
  const timers = [setInterval(tick, 1000), setInterval(() => {
    if (!view || busy || document.hidden) return;
    busy = true;
    loadAll().then((data) => view.update(data)).catch(() => {}).finally(() => { busy = false; });
  }, REFRESH)];
  const stop = () => timers.forEach(clearInterval);
  mount(main,
    head(t('whMap'), clock, places.length > 1 ? h('select', { style: { width: 'auto' }, 'data-act': 'map-place', onchange: (e) => { scope = e.target.value; stop(); render(main); } },
      places.map((p) => h('option', { value: p.id, selected: p.id === scope }, p.name))) : null),
    box);
  loading(box);
  loadAll().then((data) => { view = draw(box, data); }).catch((err) => failed(box, err));
  return stop;
}

/** Everything the picture and the panel show, worked out from one read. */
function build(data) {
  const rows = new Map(stockRows(data, scope).map((r) => [r.key, r]));
  const moves = data.stock.moves.filter((m) => (m.branchId || '') === (scope || ''));
  // The earliest date still on the shelf, per product; every lot with a date.
  const lots = expiring([...rows.values()], moves, { days: 36500 });
  const soonest = new Map();
  for (const lot of lots) if (!soonest.has(lot.key)) soonest.set(lot.key, lot);
  const lastMoved = new Map();
  for (const m of moves) if ((m.at || 0) > (lastMoved.get(m.barcode) || 0)) lastMoved.set(m.barcode, m.at || 0);
  const toPick = new Map();
  for (const p of (data.picklists || []).filter((x) => ['WAITING', 'PICKING'].includes(x.status) && (x.branchId || '') === (scope || ''))) {
    for (const l of p.lines || []) if (!lineDone(l)) toPick.set(l.barcode, (toPick.get(l.barcode) || 0) + l.qtyMilli - (l.pickedMilli || 0));
  }

  // One bin per product with a shelf here.
  const bins = session.products.filter((p) => p.active !== false && shelfOf(p, scope)).map((p) => ({ code: shelfOf(p, scope), product: p, row: rows.get(p.barcode) || null }));
  const demo = !bins.length;
  const floor = layout(demo ? DEMO : bins);
  const stocked = (c) => c.bins.filter((b) => b.product);
  const onHand = (b) => Math.max(0, b.row?.onHand || 0);
  /** How full a slot is, 0..1+, or null when no maximum is known. */
  const fullness = (c) => {
    const items = stocked(c);
    const cap = items.reduce((s, b) => s + capacityOf(b.product), 0);
    return cap ? items.reduce((s, b) => s + onHand(b), 0) / cap : null;
  };
  const cartonsIn = (c) => stocked(c).reduce((s, b) => {
    const pack = packOf(b.product);
    return s + (pack ? Math.floor(onHand(b) / (pack.size * 1000)) : Math.ceil(onHand(b) / 12000));
  }, 0);
  const mostCartons = Math.max(1, ...floor.cells.map(cartonsIn));

  const cellTone = (cell) => {
    const items = stocked(cell);
    if (!items.length) return COLOR.empty;
    if (mode === 'fill' || mode === 'cartons') {
      if (items.every((b) => !(b.row?.onHand > 0))) return COLOR.out;
      if (mode === 'cartons') return COLOR.kraft;
      const f = fullness(cell);
      return f == null ? COLOR.kraft : COLOR.fill[Math.min(4, Math.floor(f * 5))];
    }
    if (mode === 'expiry') {
      const d = Math.min(...items.map((b) => soonest.get(b.product.barcode)?.daysLeft ?? Infinity));
      return d === Infinity ? COLOR.none : d <= 0 ? COLOR.out : d <= 30 ? COLOR.soon : d <= 90 ? COLOR.later : COLOR.far;
    }
    if (mode === 'pick') return items.some((b) => toPick.has(b.product.barcode)) ? COLOR.pick : COLOR.idle;
    const last = Math.max(0, ...items.map((b) => lastMoved.get(b.product.barcode) || 0));
    const min = (Date.now() - last) / 60000;
    return COLOR.act[min < 10 ? 0 : min < 60 ? 1 : min < 1440 ? 2 : 3];
  };
  const recent = (cell) => stocked(cell).some((b) => Date.now() - (lastMoved.get(b.product.barcode) || 0) < 10 * 60000);

  // What leaves and what comes: the outbound line (outbound.js), the lorries
  // the docks page called in, and what is due to arrive.
  const here = (id) => (id || '') === (scope || '');
  const orders = outboundOrders(data, scope);
  const board = dockBoard(data.trips || [], orders, scope);
  const lanes = laneBoard(orders);
  const packing = orders.filter((o) => o.stage === 'PACKING');
  // At its packing table when it has one (auto.js gives them); the rest fill the free tables.
  const atTable = STATIONS.map(() => null);
  for (const o of packing) { const i = STATIONS.indexOf(o.pack?.station); if (i >= 0 && !atTable[i]) atTable[i] = o; }
  for (const o of packing) if (!atTable.includes(o)) { const i = atTable.indexOf(null); if (i >= 0) atTable[i] = o; }
  const linesIn = (po) => `${(po.lines || []).filter((l) => (l.receivedMilli || 0) + (l.damagedMilli || 0) >= (l.qtyMilli || 0)).length}/${(po.lines || []).length}`;
  const arriving = [
    ...data.pos.filter((p) => ['ORDERED', 'PARTIAL'].includes(p.status) && here(p.branchId))
      .map((p) => ({ ref: p.poNo, who: p.supplierName || '', tag: `${p.poNo.split('-').slice(0, 2).join('-')} · ${linesIn(p)}`, go: () => go('receive', p.id) })),
    ...data.transfers.filter((tr) => tr.status === 'SENT' && here(tr.toBranch) && isMine(tr.toBranch))
      .map((tr) => ({ ref: tr.transferNo, who: placeName(tr.fromBranch), tag: tr.transferNo.split('-').slice(0, 2).join('-'), go: () => go('transfers', tr.id) })),
  ];
  const tripJob = ({ trip, orders: on }) => ({
    ref: trip.plate || trip.tripNo || trip.id, who: trip.driverName || '', trip,
    tag: `${trip.plate || trip.tripNo || ''} · ${on.filter((o) => loadedOn(o.pack, trip)).length}/${on.length}`, go: () => go('docks'),
  });
  const picks = (data.picklists || []).filter((x) => (x.branchId || '') === (scope || ''));

  // The floor plan, as a warehouse is laid out: racks at the back with their
  // names painted at the head of each row; in front of them the staging
  // lanes (packed, waiting for a lorry) and receiving; packing, QC and the
  // forklifts' charging to the side; the docks along the front wall, and
  // the yard outside where lorries wait.
  const RX = 2.4;
  const RY = 1.2;
  const RW = Math.max(floor.W, 12);
  const SIDE = RX + RW + 1.2;
  const ZONE_Y = RY + floor.D + 1;
  const ZONE_D = 2.6;
  const dockY = ZONE_Y + ZONE_D + 0.8;
  const W = SIDE + 6;
  const docksIn = Math.max(2, Math.min(4, arriving.length));
  const PAL = PALETTES[night3d() ? 'night' : 'day'];
  const boxes = [];
  const tile = (id, x, y, w, d, color) => boxes.push({ id, x, y, w, d, h: 0, color, pick: false });
  const words = (id, x, y, w, d, label, size = 0.5) => boxes.push({ id, x, y, w, d, h: 0, color: 'transparent', pick: false, label, labelCls: 'floor', labelSize: size, noFill: true });

  // The yard: the docked lorries, a road along the front, then a queue lane behind each dock.
  const roadY = dockY + 4.3;
  const laneY = roadY + 2.1;
  const LANE_D = 9.4;
  tile('floor-in', 0.2, 0.2, W - 0.4, dockY + 1.2, PAL.floor);
  tile('yard', 0.2, dockY + 1.5, W - 0.4, laneY + LANE_D + 0.6 - dockY - 1.5, PAL.yard);
  const half = (RX + RW - 0.6) / 2;
  tile('z-staging', 0.6, ZONE_Y, half, ZONE_D, PAL.staging);
  words('w-staging', 0.6, ZONE_Y + 0.2, half, 0.6, t('whMapStaging'));
  tile('z-receiving', 0.6 + half + 0.4, ZONE_Y, half - 0.4, ZONE_D, PAL.receiving);
  words('w-receiving', 0.6 + half + 0.4, ZONE_Y + 0.2, half - 0.4, 0.6, t('whMapReceiving'));
  // The staging lanes, S1..S6, with a carton stack for each packed order.
  const laneW = half / LANES.length;
  LANES.forEach((l, i) => {
    const x = 0.6 + i * laneW;
    if (i) boxes.push({ id: `lane-line-${l}`, x, y: ZONE_Y + 0.9, w: 0.04, d: ZONE_D - 1, h: 0, color: PAL.laneSep, pick: false });
    words(`lane-${l}`, x, ZONE_Y + ZONE_D - 0.6, laneW, 0.5, l, 0.32);
    lanes.get(l).slice(0, 3).forEach((o, k) => {
      const bx = x + 0.12 + (k % 2) * 0.42;
      const by = ZONE_Y + 0.95 + Math.floor(k / 2) * 0.5;
      const n = Math.max(1, Math.min(3, o.pack?.cartons || 1));
      for (let j = 0; j < n; j++) {
        boxes.push({ id: `staged-${o.key}-${j}`, x: bx, y: by, z: j * 0.3, w: 0.38, d: 0.4, h: 0.3, color: j % 2 ? '#d6b98c' : COLOR.kraft, kind: 'carton', title: `${o.ref} · ${l}`, order: o, noShadow: j > 0 });
      }
    });
  });
  // To the side: the packing tables, QC and returns, the forklifts' charging.
  tile('z-packing', SIDE, RY, 4.6, 4.4, PAL.packing);
  words('w-packing', SIDE, RY + 0.1, 4.6, 0.6, t('whMapPacking'));
  [[0.5, 1.2], [2.6, 1.2], [0.5, 2.9], [2.6, 2.9]].forEach(([dx, dy], i) => {
    const o = atTable[i];
    boxes.push({ id: `pack-${i}`, x: SIDE + dx, y: RY + dy, w: 1.4, d: 0.8, h: 0.55, color: o ? '#a78bfa' : PAL.table, pick: !!o, order: o,
      label: o ? `P${i + 1} · ${o.ref}` : `P${i + 1}`, labelCls: o ? 'task' : 'small', title: o ? `${o.ref} · ${t('ob_PACKING')}` : `P${i + 1}` });
    boxes.push({ id: `pack-${i}-box`, x: SIDE + dx + 0.2, y: RY + dy + 0.15, z: 0.55, w: 0.45, d: 0.4, h: 0.3, color: COLOR.kraft, kind: 'carton', pick: false, noShadow: true,
      ...(o ? { anim: { path: [[0, 0], [0.5, 0], [0.5, 0], [0, 0]], dur: 4, ease: true, begin: `${i * 0.6}s` } } : {}) });
  });
  tile('z-qc', SIDE, RY + 5, 4.6, 3, PAL.qc);
  words('w-qc', SIDE, RY + 5.1, 4.6, 0.6, t('whMapQc'));
  boxes.push({ id: 'qc-1', x: SIDE + 0.8, y: RY + 6.2, w: 1, d: 1, h: 0.7, color: PAL.qcBox, pick: false }, { id: 'qc-2', x: SIDE + 2.4, y: RY + 6.4, w: 0.8, d: 0.8, h: 0.5, color: PAL.qcBox, pick: false });
  tile('z-charge', SIDE, RY + 8.6, 4.6, 2.6, PAL.charge);
  words('w-charge', SIDE, RY + 8.7, 4.6, 0.6, t('whMapCharging'));
  // A forklift, out of its charging bay and back.
  const forkMove = { path: [[-1.6, 0], [-1.6, 0], [-1.6, -3.2], [-1.6, -3.2], [-1.6, 0], [0, 0], [0, 0]], dur: 16, ease: true };
  boxes.push({ id: 'fork-body', x: SIDE + 1, y: RY + 9.7, w: 0.9, d: 1.2, h: 0.6, color: '#f59e0b', pick: false, anim: forkMove },
    { id: 'fork-mast', x: SIDE + 1.05, y: RY + 9.55, w: 0.8, d: 0.12, h: 1.5, color: '#334155', pick: false, noShadow: true, anim: forkMove },
    { id: 'fork-tine', x: SIDE + 1.15, y: RY + 9, w: 0.6, d: 0.55, h: 0.05, color: '#334155', pick: false, noShadow: true, anim: forkMove },
    { id: 'fork-load', x: SIDE + 1.2, y: RY + 9.05, z: 0.05, w: 0.5, d: 0.45, h: 0.35, color: COLOR.kraft, kind: 'carton', pick: false, noShadow: true, anim: forkMove },
    { id: 'charger', x: SIDE + 3, y: RY + 9.8, w: 0.4, d: 0.4, h: 0.9, color: '#10b981', pick: false });

  // Docks along the front wall: OUT on the left (by staging), IN on the right (by receiving).
  const dockAt = (i, kind) => {
    const n = kind === 'OUT' ? OUT_DOCKS.length : docksIn;
    const x0 = kind === 'OUT' ? 0.6 : 0.6 + half + 0.4;
    const span = kind === 'OUT' ? half : half - 0.4;
    return x0 + (i + 0.5) * span / n - 0.8;
  };
  const lorry = (job, kind, x, y) => boxes.push(...lorryBoxes(`lorry-${job.ref}`, x, y, {
    along: 'y', color: kind === 'IN' ? COLOR.inbound : COLOR.outbound, title: `${job.ref} · ${job.who}`, label: job.tag, labelCls: 'grn', lorry: job,
  }));
  const dock = (i, kind, job) => {
    const x = dockAt(i, kind);
    const name = kind === 'OUT' ? OUT_DOCKS[i] : `IN-${i + 1}`;
    boxes.push({ id: `dock-${name}`, x, y: dockY, z: 0, w: 1.6, d: 1.2, h: 0, color: kind === 'IN' ? PAL.dockIn : PAL.dockOut, label: name, labelCls: 'dock', pick: false });
    boxes.push({ id: `bump-${name}`, x: x + 0.1, y: dockY + 1.15, w: 1.4, d: 0.1, h: 0.22, color: '#facc15', pick: false, noShadow: true });
    if (!job) return;
    lorry(job, kind, x + 0.35, dockY + 1.4);
    // A carton going between the lorry and the dock: off it (in), onto it (out).
    boxes.push({ id: `dock-${name}-pallet`, x: x + 0.45, y: dockY + 0.2, w: 0.7, d: 0.6, h: 0.45, color: COLOR.kraft, kind: 'carton', pick: false,
      anim: { path: kind === 'IN' ? [[0, 1.3], [0, 1.3], [0, 0], [0, 0]] : [[0, 0], [0, 0], [0, 1.3], [0, 1.3]], dur: 5, ease: true, begin: `${i * 0.7}s` } });
  };
  board.docks.forEach((d, i) => dock(i, 'OUT', d.trip ? tripJob(d) : null));
  for (let i = 0; i < docksIn; i++) dock(i, 'IN', arriving[i]);
  // The road along the front of the docks, a dashed line down its middle.
  tile('road', 0.2, roadY, W - 0.4, 1.8, PAL.road);
  for (let x = 0.6; x + 0.7 < W - 0.4; x += 1.4) tile(`road-dash-${x.toFixed(1)}`, x, roadY + 0.86, 0.7, 0.08, PAL.dash);
  // Behind it a queue lane for each dock; the lorries waiting line up in the lanes of their kind.
  const outQ = board.yard.map((y) => ({ ...tripJob(y), kind: 'OUT' }));
  const inQ = arriving.slice(docksIn).map((j) => ({ ...j, kind: 'IN' }));
  const queue = [...outQ, ...inQ];
  const lanesAll = [...OUT_DOCKS.map((name, i) => ({ name, kind: 'OUT', x: dockAt(i, 'OUT') })),
    ...Array.from({ length: docksIn }, (_, i) => ({ name: `IN-${i + 1}`, kind: 'IN', x: dockAt(i, 'IN') }))];
  const inLane = new Map(lanesAll.map((l) => [l.name, []]));
  outQ.forEach((j, k) => inLane.get(OUT_DOCKS[k % OUT_DOCKS.length]).push(j));
  inQ.forEach((j, k) => inLane.get(`IN-${(k % docksIn) + 1}`).push(j));
  for (const l of lanesAll) {
    for (let y = laneY; y + 0.5 < laneY + LANE_D; y += 0.9) {
      tile(`q-${l.name}-a-${y.toFixed(1)}`, l.x + 0.02, y, 0.05, 0.5, PAL.laneLine);
      tile(`q-${l.name}-b-${y.toFixed(1)}`, l.x + 1.53, y, 0.05, 0.5, PAL.laneLine);
    }
    words(`q-${l.name}`, l.x - 0.2, laneY + LANE_D - 0.1, 2, 0.5, `${t('whMapQueue')} ${l.name}`, 0.26);
    inLane.get(l.name).slice(0, 3).forEach((j, k) => lorry(j, l.kind, l.x + 0.35, laneY + 0.25 + k * 3));
  }

  // Pickers: where their next line is, with how far they have got.
  const cellOf = new Map(floor.cells.filter((c) => c.code).map((c) => [c.code, c]));
  const people = [];
  picks.filter((x) => x.status === 'PICKING').forEach((x, i) => {
    const next = (x.lines || []).find((l) => !lineDone(l));
    const done = (x.lines || []).filter(lineDone).length;
    const c = cellOf.get(next?.bin ? layoutCode(next.bin) : '');
    // In the aisle in front of the bin; else waiting in staging.
    const px = c ? RX + c.x + 0.3 : 1 + i;
    const py = c ? RY + c.y + (Math.floor(c.y) % 2 ? 1.05 : -0.55) : ZONE_Y + 0.6;
    people.push({ id: `picker-${x.id}`, x: px, y: py, w: 0.34, d: 0.34, h: 0.55, color: '#f97316', kind: 'person',
      label: `${x.pickerName || t('whPickBy')} · ${done}/${(x.lines || []).length}`, labelCls: 'task', title: x.pickNo, pickList: x,
      anim: { path: [[0.9, 0], [0.9, 0], [-0.7, 0], [-0.7, 0]], dur: 7, ease: true, bob: true } });
  });

  // Each slot: an orange beam, and on it cartons coloured by the layer (none when empty).
  const cellBoxes = () => floor.cells.flatMap((c, i) => {
    const tone = cellTone(c);
    const used = stocked(c).length > 0;
    const title = c.code ? `${c.code}${stocked(c).map((b) => `\n${b.product.name} · ${formatQty(b.row?.onHand || 0)}`).join('')}` : `${c.rack}-L${c.level}-${c.slot}`;
    const cls = [demo ? 'demo' : '', (mode === 'pick' && tone === COLOR.pick) || (mode === 'activity' && recent(c)) ? 'pulse' : ''].filter(Boolean).join(' ');
    const x = RX + c.x;
    const y = RY + c.y;
    // The shelf: a steel deck with the orange beam along its front edge.
    const beam = { id: `c${i}-beam`, x, y, z: c.z, w: 1, d: 0.94, h: 0.05, color: PAL.deck, cell: c, title, noShadow: c.z > 0, cls: demo ? 'demo' : '' };
    const lip = { id: `c${i}-lip`, x, y: y + (Math.floor(c.y) % 2 ? 0.86 : 0), z: c.z, w: 1, d: 0.08, h: 0.11, color: '#f08c00', cell: c, title, noShadow: true };
    if (!used && !demo) return [beam, lip];
    const color = demo ? '#d6b98c' : tone;
    // Cartons: as high as there are cartons, against the fullest slot in view.
    const tall = mode === 'cartons' && !demo ? 0.12 + 0.6 * Math.min(1, cartonsIn(c) / mostCartons) : 0.5;
    return [beam, lip,
      { id: `c${i}`, x: x + 0.06, y: y + 0.1, z: c.z + 0.07, w: 0.5, d: 0.74, h: tall, color, cell: c, title, cls, kind: 'carton', noShadow: true },
      { id: `c${i}-b`, x: x + 0.58, y: y + 0.16, z: c.z + 0.07, w: 0.36, d: 0.62, h: tall * 0.76, color: shade2(color), cell: c, title, cls, kind: 'carton', noShadow: true }];
  });
  const uprights = () => floor.racks.flatMap((r) => {
    const tall = Math.max(...floor.cells.filter((c) => c.rack === r.name).map((c) => c.z)) + 0.8;
    const out = [];
    const post = (k, dy, tag) => out.push({ id: `up-${r.name}-${tag}-${dy}`, x: RX + k - 0.05, y: RY + r.y + dy, w: 0.1, d: 0.1, h: tall, color: '#64748b', pick: false });
    for (let k = 0; k <= r.w; k += 2) for (const dy of [-0.02, 0.9]) post(Math.min(k, r.w), dy, k);
    if (r.w % 2) for (const dy of [-0.02, 0.9]) post(r.w, dy, 'end');
    return out;
  });
  const aisles = () => floor.racks.filter((_, i) => i % 2 === 1).flatMap((r) => [
    { id: `aisle-${r.name}-a`, x: RX - 0.3, y: RY + r.y + 1.12, w: RW + 0.6, d: 0.06, h: 0, color: PAL.aisle, pick: false },
    { id: `aisle-${r.name}-b`, x: RX - 0.3, y: RY + r.y + 2.48, w: RW + 0.6, d: 0.06, h: 0, color: PAL.aisle, pick: false },
  ]);
  const rackLabels = () => floor.racks.map((r) => ({ id: `rack-${r.name}`, x: RX - 1.8, y: RY + r.y, z: 0, w: 1.4, d: 0.9, h: 0, color: 'transparent', label: r.name, labelCls: 'floor', labelSize: 0.55, pick: false, noFill: true }));
  const all = () => [...boxes.filter((b) => b.h === 0), ...aisles(), ...rackLabels(), ...uprights(), ...cellBoxes(), ...boxes.filter((b) => b.h !== 0), ...people];

  // The racks at a glance.
  const stockedCells = floor.cells.filter((c) => stocked(c).length);
  const emptyCells = floor.cells.filter((c) => !stocked(c).some((b) => onHand(b) > 0));
  const nearFull = stockedCells.filter((c) => (fullness(c) ?? 0) > 0.8);
  const binOf = (key) => shelfOf(session.find(key), scope);
  const expired = lots.filter((l) => l.daysLeft <= 0);
  const within30 = lots.filter((l) => l.daysLeft > 0 && l.daysLeft <= 30);
  // The work waiting, in the order it should be done.
  const tasks = [
    ...picks.filter((x) => ['WAITING', 'PICKING'].includes(x.status)).flatMap((x) => {
      const l = (x.lines || []).find((y) => !lineDone(y));
      if (!l) return [];
      const c = cellOf.get(layoutCode(l.bin || ''));
      return [{ key: `pick-${x.id}`, tone: 'pick', text: `${t('whMapTaskPick')} ${formatQty(l.qtyMilli - (l.pickedMilli || 0))} × ${l.name} → ${l.bin || '—'}${x.pickerName ? ` · ${x.pickerName}` : ''}`,
        focus: c ? `c${floor.cells.indexOf(c)}-beam` : `picker-${x.id}`, go: () => go('picking', x.id) }];
    }),
    ...packing.map((o) => { const i = atTable.indexOf(o); return { key: `pack-${o.key}`, tone: 'pack', text: `${t('whMapTaskPack')} ${o.urgent ? '⚡ ' : ''}${o.ref}${i >= 0 ? ` → ${STATIONS[i]}` : ''}`, focus: i >= 0 ? `pack-${i}` : '', go: () => go('outbound', o.key) }; }),
    ...board.yard.map((y) => ({ key: `yard-${y.trip.id}`, tone: 'out', text: `${t('whMapTaskYard')} 🚚 ${y.trip.plate || ''}`, focus: `lorry-${tripJob(y).ref}`, go: () => go('docks') })),
    ...arriving.map((j) => ({ key: `in-${j.ref}`, tone: 'in', text: `${t('whMapTaskIn')} ${j.ref} · ${j.who}`, focus: `lorry-${j.ref}`, go: j.go })),
  ];
  // The latest moves on the floor, newest first.
  const feed = [...moves].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 4).map((m) => {
    const kind = ['RECEIVE', 'TRANSFER_IN', 'TRANSFER_OUT', 'SALE', 'WRITE_OFF'].includes(m.type) ? m.type : 'OTHER';
    const bin = binOf(m.barcode);
    const c = cellOf.get(layoutCode(bin || ''));
    return { key: m.id || `${m.barcode}-${m.at}`, kind, at: m.at, focus: c ? `c${floor.cells.indexOf(c)}-beam` : '',
      text: `${t(`whFeed_${kind}`)} ${formatQty(Math.abs(m.quantityMilli || 0))} × ${m.productName || m.barcode}${bin ? ` · ${bin}` : ''}` };
  });
  const units = bins.reduce((s, b) => s + onHand(b), 0);
  return {
    all, W, D: laneY + LANE_D + 0.8, demo, floor,
    // Where the picture starts (and ⌂ goes back to): the racks, filling it.
    home: { x: RX - 2, y: RY - 0.6, w: floor.W + 2.6, d: floor.D + 1.2, h: Math.max(1, ...floor.cells.map((c) => c.z)) + 0.8 },
    cellOf, soonest, toPick, tasks, feed, queue, orders,
    stats: { used: stockedCells.length, total: floor.cells.length, units, onRoad: (data.trips || []).filter((x) => x.status === 'ON_ROAD' && here(x.branchId)).length, soon: lots.filter((l) => l.daysLeft <= 30).length },
    racks: { empty: emptyCells.length, nearFull: nearFull.length, expired, within30, first: lots.slice(0, 8).map((l) => ({ ...l, bin: binOf(l.key) })) },
    flows: stageCounts(orders),
  };
}

function draw(box, data) {
  let m = build(data);
  const info = h('div', { class: 'map-info', 'data-card': 'info' });
  // The side panel can be put away, and stays away next time (this phone or computer only).
  let panelOn = true;
  try { panelOn = localStorage.getItem('jsox-map-panel') !== 'off'; } catch { /* no storage */ }
  const layoutEl = h('div', { class: 'map-layout' });
  const stage = h('div', { class: 'map-stage wh3d' });
  const scene = scene3d({
    boxes: m.all(), W: m.W, D: m.D, height: 820, fillHeight: true, home: m.home, hint: t('whMapHint'),
    onPick: (b) => { scene.select(b.id); showInfo(b); },
    extraTools: [{ label: '▤', act: 'iso-panel', title: t('whMapPanelToggle'), onClick: () => setPanel(!panelOn) }],
  });
  const feedBox = h('div', { class: 'wh3d-tasks wh3d-feed', 'data-card': 'feed' });
  const layers = h('div', { class: 'map-layers' });
  const tabs = h('div', { class: 'seg map-tabs' });
  const panelBody = h('div', { class: 'map-panel-body' });
  const panel = h('aside', { class: 'card map-panel' },
    h('div', { class: 'row map-panel-top' }, tabs, h('button', { class: 'ghost map-panel-hide', 'data-act': 'panel-hide', title: t('whMapPanelHide'), 'aria-label': t('whMapPanelHide'), onclick: () => setPanel(false) }, '›')),
    panelBody);
  const reopen = h('button', { class: 'map-panel-open', 'data-act': 'panel-show', onclick: () => setPanel(true) }, `‹ ${t('whMapPanelShow')}`);
  const setPanel = (on) => {
    panelOn = on;
    try { localStorage.setItem('jsox-map-panel', on ? 'on' : 'off'); } catch { /* no storage */ }
    layoutEl.classList.toggle('panel-off', !on);
  };

  const showInfo = (b) => {
    tab = 'info';
    drawPanel();
    if (b.pickList) {
      const x = b.pickList;
      mount(info, h('h3', {}, `${x.pickerName || ''} · ${x.pickNo}`), h('p', { class: 'muted' }, `${(x.lines || []).filter(lineDone).length}/${(x.lines || []).length} ${t('whLines')}`),
        h('button', { class: 'primary', onclick: () => go('picking', x.id) }, t('whMapOpen')));
      return;
    }
    if (b.order) {
      const o = b.order;
      mount(info, h('h3', {}, `${o.urgent ? '⚡ ' : ''}${o.ref}`), h('p', { class: 'muted' }, `${t(`ob_${o.stage}`)}${o.pack?.lane ? ` · ${o.pack.lane}` : ''}${o.pack?.cartons ? ` · 📦 ${o.pack.cartons}` : ''}`),
        h('button', { class: 'primary', onclick: () => go('outbound', o.key) }, t('whMapOpen')));
      return;
    }
    if (b.lorry) {
      mount(info, h('h3', {}, b.lorry.ref), h('p', { class: 'muted' }, b.lorry.who), h('button', { class: 'primary', onclick: b.lorry.go }, t('whMapOpen')));
      return;
    }
    const c = b.cell;
    if (!c) return;
    const items = c.bins.filter((x) => x.product);
    mount(info,
      h('div', { class: 'row' }, h('h3', { class: 'grow mono', style: { margin: 0 } }, c.code || `${c.rack}-L${c.level}-${c.slot}`),
        h('span', { class: 'muted' }, `${t('whMapRack')} ${c.rack} · L${c.level} · #${c.slot}`)),
      items.length ? items.map((x) => {
        const lot = m.soonest.get(x.product.barcode);
        return h('button', { class: 'wh-row', 'data-bin-item': x.product.barcode, onclick: () => go('stock', encodeURIComponent(x.product.barcode)) },
          h('span', { class: 'grow' }, x.product.name || x.product.barcode),
          h('b', {}, formatQty(x.row?.onHand || 0)),
          lot ? expiryPill(lot.expiry) : null,
          m.toPick.has(x.product.barcode) ? pill(`${t('whPicking')} ${formatQty(m.toPick.get(x.product.barcode))}`, 'good') : null);
      }) : h('p', { class: 'muted', style: { margin: 0 } }, m.demo ? t('whMapDemo') : t('whMapEmptySlot')));
  };
  mount(info, h('p', { class: 'muted', style: { margin: 0 } }, t('whMapTap')));

  const focusOn = (id) => { if (!id) return; scene.focus(id); scene.select(id); };
  const kpi = (label, value, sub = '', tone = '') => h('div', { class: `card stat${tone ? ` ${tone}` : ''}` }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'muted sub' }, sub) : null);

  const overview = () => {
    const s = m.stats;
    const most = Math.max(1, ...STAGES.map((k) => m.flows[k]));
    return [
      h('section', { class: 'map-waiting', 'data-card': 'tasks' },
        h('h3', {}, `${t('whMapWaiting')} · ${m.tasks.length}`),
        m.tasks.length ? m.tasks.slice(0, 6).map((x) => h('div', { class: `wh3d-task ${x.tone}`, 'data-task': x.key },
          h('button', { class: 'linkish grow', onclick: () => focusOn(x.focus) }, h('i'), x.text),
          h('button', { class: 'ghost', 'data-act': 'task-go', onclick: x.go }, t('whMapOpen'))))
          : h('p', { class: 'muted', style: { margin: 0 } }, t('whMapNothingWaiting'))),
      h('div', { class: 'cards map-kpis' },
        kpi(t('whMapBins'), `${s.used}/${s.total}`, s.total ? `${Math.round(100 * s.used / s.total)}%` : ''),
        kpi(t('whMapUnits'), formatQty(s.units)),
        kpi(t('whMapOnRoad'), String(s.onRoad)),
        kpi(t('whExpiring'), String(s.soon), t('whMap30'), s.soon ? 'warn' : '')),
      h('section', { 'data-card': 'flow' }, h('h3', {}, t('whMapFlow')),
        h('div', { class: 'map-flow' }, STAGES.map((k) => h('button', { class: 'map-flow-row', 'data-flow': k, onclick: () => go('outbound') },
          h('span', {}, t(`ob_${k}`)), h('span', { class: 'bar' }, h('i', { style: { width: `${Math.round(100 * m.flows[k] / most)}%` } })), h('b', {}, String(m.flows[k])))))),
    ];
  };
  const racks = () => {
    const r = m.racks;
    const firstCell = (bin) => { const c = m.cellOf.get(layoutCode(bin || '')); return c ? `c${m.floor.cells.indexOf(c)}-beam` : ''; };
    return [
      h('div', { class: 'cards map-kpis' },
        kpi(t('whMapEmptyBins'), String(r.empty), t('whMapEmptyBinsSub')),
        kpi(t('whMapNearFull'), String(r.nearFull), t('whMapNearFullSub'), r.nearFull ? 'warn' : ''),
        kpi(t('whMapExpiredLots'), String(r.expired.length), t('whMapExpiredSub'), r.expired.length ? 'bad' : ''),
        kpi(t('whMap30d'), String(r.within30.length), t('whMap30dSub'), r.within30.length ? 'warn' : '')),
      h('section', { 'data-card': 'first-expiry' },
        h('h3', {}, t('whMapFirstExpiry')),
        r.first.length ? r.first.map((l) => h('div', { class: 'wh-row map-lot', 'data-lot': l.key },
          h('span', { class: 'mono' }, l.bin || '—'), h('span', { class: 'grow' }, l.name || l.key), expiryPill(l.expiry),
          firstCell(l.bin) ? h('button', { class: 'ghost', 'data-act': 'show-on-map', onclick: () => { mode = 'expiry'; refreshScene(); focusOn(firstCell(l.bin)); } }, t('whMapShowOnMap')) : null))
          : h('p', { class: 'muted', style: { margin: 0 } }, t('whMapNoDates'))),
    ];
  };
  const drawPanel = () => {
    mount(tabs, ['overview', 'racks', 'info'].map((k) => h('button', { class: tab === k ? 'on' : '', 'data-tab': k, onclick: () => { tab = k; drawPanel(); } }, t(`whMapTab_${k}`))));
    mount(panelBody, tab === 'overview' ? overview() : tab === 'racks' ? racks() : info);
  };
  const drawFeed = () => mount(feedBox, m.feed.length ? [h('div', { class: 'map-feed-head' }, t('whMapFeed')),
    ...m.feed.map((x) => h('button', { class: `wh3d-task feed ${x.kind}`, 'data-feed': x.key, onclick: () => focusOn(x.focus) }, h('i'), h('span', { class: 'grow' }, x.text), h('small', {}, ago(x.at))))] : null);
  const drawLayers = () => {
    const keys = {
      fill: [...FILL_KEYS.map((k, i) => [COLOR.fill[i], k]), [COLOR.out, t('whOutOfStock')], [COLOR.empty, t('whMapEmpty')]],
      expiry: [[COLOR.out, t('whExpired')], [COLOR.soon, t('whMap30')], [COLOR.later, t('whMap90')], [COLOR.far, t('whMapLater')], [COLOR.none, t('whMapNoDate')]],
      pick: [[COLOR.pick, t('whMapToPick')], [COLOR.idle, t('whMapNothing')]],
      activity: [[COLOR.act[0], t('whMapAct10m')], [COLOR.act[1], t('whMapAct1h')], [COLOR.act[2], t('whMapAct1d')], [COLOR.act[3], t('whMapQuiet')]],
      cartons: [[COLOR.kraft, t('whMapCartonsKey')], [COLOR.out, t('whOutOfStock')]],
    }[mode];
    mount(layers,
      h('div', { class: 'wh-chips map-modes' }, MODES.map((k) => h('button', { class: mode === k ? 'on' : '', 'data-mode': k, onclick: () => { mode = k; refreshScene(); } }, t(`whMap_${k}`)))),
      h('div', { class: 'map-legend' }, keys.map(([c, label]) => h('span', {}, h('i', { style: { background: c } }), label)),
        h('span', {}, h('i', { style: { background: COLOR.inbound } }), t('whMapIn')), h('span', {}, h('i', { style: { background: COLOR.outbound } }), t('whMapOut'))));
  };
  const refreshScene = () => { scene.draw(m.all(), m.W, m.D); drawLayers(); };

  drawLayers();
  drawPanel();
  drawFeed();
  // 3D turned off for this company: the panel stays, the picture's extras go.
  mount(stage, h('div', { class: 'map-pic' }, scene.el, scene.off ? null : feedBox), scene.off ? null : layers);
  mount(box,
    m.demo ? h('div', { class: 'card map-demo' }, h('b', {}, t('whMapDemoTitle')), h('p', { class: 'muted', style: { margin: '4px 0 0' } }, t('whMapDemoHelp')),
      canMove() ? h('button', { style: { marginTop: '8px' }, onclick: () => go('stock') }, t('whStock')) : null) : null,
    mount(layoutEl, stage, panel, reopen));
  setPanel(panelOn);

  return {
    /** A fresh read: the same view, the new picture. */
    update(next) {
      m = build(next);
      refreshScene();
      if (tab !== 'info') drawPanel();
      drawFeed();
    },
  };
}
