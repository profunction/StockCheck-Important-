/**
 * The warehouse in 3D (仓库 3D): every rack drawn where its shelf codes say
 * it stands (web/js/warehouse3d.js), each slot coloured by what is in it --
 *
 *   存量   on hand: enough, low, none, an empty slot
 *   到期   the earliest expiry date on the slot
 *   拣货   slots with something still to pick on an open picklist
 *   动静   how many times stock moved there in the last 7 days
 *
 * -- and the loading docks in front, with a lorry at each dock that has
 * work: goods arriving (orders to receive, transfers on their way here) and
 * goods leaving (transfers not yet sent). Tap a slot to see what is on it.
 * Nothing here changes stock; it is a picture of what the ledger says.
 */
import { h, mount } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { formatQty } from '../js/money.js';
import { session } from '../js/session.js';
import { isoScene } from '../js/iso.js';
import { lorryBoxes } from '../js/town.js';
import { layout, parseBin } from '../js/warehouse3d.js';
import { shade } from '../js/iso.js';

const shade2 = (c) => (c.startsWith('#') ? shade(c, -0.12) : c);
/** A shelf code as the layout writes it ("a1 l1 03" -> "A1-L1-03"). */
const layoutCode = (bin) => parseBin(bin)?.code || '';
import { lineDone } from '../js/picking.js';
import { expiring } from '../js/wms.js';
import { canMove, failed, head, isMine, loading, myPlaces, pill, placeName, shelfOf } from './common.js';
import { loadAll, stockRows } from './data.js';
import { expiryPill } from './stock.js';
import { go } from './main.js';

const COLOR = {
  ok: '#22a06b', low: '#f0a020', out: '#e5484d', empty: '#d3dce4',
  soon: '#f97316', later: '#facc15', far: '#22a06b', none: '#9fb3c8',
  pick: '#7c3aed', idle: '#c9d4de', heat: ['#c9d4de', '#7dd3c0', '#14b8a6', '#f59e0b', '#ef4444'],
  dock: '#e3e9ef', inbound: '#2f6fde', outbound: '#0d9488', cab: '#334155',
};
const MODES = ['fill', 'expiry', 'pick', 'activity'];
let scope = null;
let mode = 'fill';

/** A small made-up floor, shown faded until shelf codes are filled in. */
const DEMO = ['A1', 'A2', 'B1', 'B2'].flatMap((r) => [1, 2, 3].flatMap((l) => Array.from({ length: 8 }, (_, s) => ({ code: `${r}-L${l}-${s + 1}`, demo: true }))));

export function render(main) {
  const places = myPlaces();
  if (scope == null || !places.some((p) => p.id === scope)) {
    scope = places.find((p) => p.id === session.branchId && p.kind === 'WAREHOUSE')?.id
      ?? places.find((p) => p.kind === 'WAREHOUSE')?.id ?? (places.some((p) => p.id === session.branchId) ? session.branchId : places[0]?.id ?? '');
  }
  const box = h('div');
  mount(main,
    head(t('whMap'), places.length > 1 ? h('select', { style: { width: 'auto' }, 'data-act': 'map-place', onchange: (e) => { scope = e.target.value; render(main); } },
      places.map((p) => h('option', { value: p.id, selected: p.id === scope }, p.name))) : null),
    box);
  loading(box);
  loadAll().then((data) => draw(box, data)).catch((err) => failed(box, err));
  return null;
}

function draw(box, data) {
  const rows = new Map(stockRows(data, scope).map((r) => [r.key, r]));
  const moves = data.stock.moves.filter((m) => (m.branchId || '') === (scope || ''));
  // The earliest date still on the shelf, per product.
  const soonest = new Map();
  for (const lot of expiring([...rows.values()], moves, { days: 36500 })) if (!soonest.has(lot.key)) soonest.set(lot.key, lot);
  const week = Date.now() - 7 * 86_400_000;
  const moved = new Map();
  for (const m of moves) if ((m.at || 0) >= week) moved.set(m.barcode, (moved.get(m.barcode) || 0) + 1);
  const toPick = new Map();
  for (const p of (data.picklists || []).filter((x) => ['WAITING', 'PICKING'].includes(x.status) && (x.branchId || '') === (scope || ''))) {
    for (const l of p.lines || []) if (!lineDone(l)) toPick.set(l.barcode, (toPick.get(l.barcode) || 0) + l.qtyMilli - (l.pickedMilli || 0));
  }

  // One bin per product with a shelf here.
  const bins = session.products.filter((p) => p.active !== false && shelfOf(p, scope)).map((p) => ({ code: shelfOf(p, scope), product: p, row: rows.get(p.barcode) || null }));
  const demo = !bins.length;
  const floor = layout(demo ? DEMO : bins);

  const cellTone = (cell) => {
    const items = cell.bins.filter((b) => b.product);
    if (!items.length) return demo ? COLOR.empty : COLOR.empty;
    if (mode === 'fill') {
      if (items.every((b) => !(b.row?.onHand > 0))) return COLOR.out;
      return items.some((b) => b.row?.low) ? COLOR.low : COLOR.ok;
    }
    if (mode === 'expiry') {
      const d = Math.min(...items.map((b) => soonest.get(b.product.barcode)?.daysLeft ?? Infinity));
      return d === Infinity ? COLOR.none : d <= 0 ? COLOR.out : d <= 30 ? COLOR.soon : d <= 90 ? COLOR.later : COLOR.far;
    }
    if (mode === 'pick') return items.some((b) => toPick.has(b.product.barcode)) ? COLOR.pick : COLOR.idle;
    const n = items.reduce((s, b) => s + (moved.get(b.product.barcode) || 0), 0);
    return COLOR.heat[n === 0 ? 0 : n < 3 ? 1 : n < 6 ? 2 : n < 12 ? 3 : 4];
  };

  // The floor plan, as a warehouse is laid out: racks at the back with their
  // names painted at the head of each row; in front of them the staging
  // lanes (goods picked, waiting to leave) and receiving (goods come in);
  // packing, QC and the forklifts' charging to the side; the docks along
  // the front wall, and the yard outside where lorries wait.
  const here = (id) => (id || '') === (scope || '');
  const linesIn = (po) => `${(po.lines || []).filter((l) => (l.receivedMilli || 0) + (l.damagedMilli || 0) >= (l.qtyMilli || 0)).length}/${(po.lines || []).length}`;
  const arriving = [
    ...data.pos.filter((p) => ['ORDERED', 'PARTIAL'].includes(p.status) && here(p.branchId))
      .map((p) => ({ ref: p.poNo, who: p.supplierName || '', tag: `${p.poNo.split('-').slice(0, 2).join('-')} · ${linesIn(p)}`, go: () => go('receive', p.id) })),
    ...data.transfers.filter((tr) => tr.status === 'SENT' && here(tr.toBranch) && isMine(tr.toBranch))
      .map((tr) => ({ ref: tr.transferNo, who: placeName(tr.fromBranch), tag: tr.transferNo.split('-').slice(0, 2).join('-'), go: () => go('transfers', tr.id) })),
  ];
  const leaving = data.transfers.filter((tr) => ['DRAFT', 'PENDING', 'APPROVED'].includes(tr.status) && here(tr.fromBranch) && (tr.lines || []).length)
    .map((tr) => ({ ref: tr.transferNo, who: placeName(tr.toBranch), tag: `${tr.transferNo.split('-').slice(0, 2).join('-')} → ${placeName(tr.toBranch)}`, go: () => go('transfers', tr.id) }));
  const picks = (data.picklists || []).filter((x) => (x.branchId || '') === (scope || ''));
  const RX = 2.4;
  const RY = 1.2;
  const RW = Math.max(floor.W, 12);
  const SIDE = RX + RW + 1.2;
  const ZONE_Y = RY + floor.D + 1;
  const ZONE_D = 2.6;
  const dockY = ZONE_Y + ZONE_D + 0.8;
  const W = SIDE + 6;
  const docksOut = Math.max(2, Math.min(4, leaving.length));
  const docksIn = Math.max(2, Math.min(4, arriving.length));
  const boxes = [];
  const tile = (id, x, y, w, d, color) => boxes.push({ id, x, y, w, d, h: 0, color, pick: false });
  const words = (id, x, y, w, d, label, size = 0.5) => boxes.push({ id, x, y, w, d, h: 0, color: 'transparent', pick: false, label, labelCls: 'floor', labelSize: size, noFill: true });

  // The building's floor, and the yard outside it.
  tile('floor-in', 0.2, 0.2, W - 0.4, dockY + 1.2, '#eef2f5');
  tile('yard', 0.2, dockY + 1.5, W - 0.4, 7.2, '#c3ccd5');
  // The zones in front of the racks.
  const half = (RX + RW - 0.6) / 2;
  tile('z-staging', 0.6, ZONE_Y, half, ZONE_D, '#dcefe9');
  words('w-staging', 0.6, ZONE_Y + 0.2, half, 0.6, t('whMapStaging'));
  tile('z-receiving', 0.6 + half + 0.4, ZONE_Y, half - 0.4, ZONE_D, '#dbeafe');
  words('w-receiving', 0.6 + half + 0.4, ZONE_Y + 0.2, half - 0.4, 0.6, t('whMapReceiving'));
  // To the side: packing stations, QC and returns, the forklifts' charging.
  tile('z-packing', SIDE, RY, 4.6, 4.4, '#ede9fe');
  words('w-packing', SIDE, RY + 0.1, 4.6, 0.6, t('whMapPacking'));
  [[0.5, 1.2], [2.6, 1.2], [0.5, 2.9], [2.6, 2.9]].forEach(([dx, dy], i) => {
    boxes.push({ id: `pack-${i}`, x: SIDE + dx, y: RY + dy, w: 1.4, d: 0.8, h: 0.55, color: '#cbd5e1', pick: false, label: `P${i + 1}`, labelCls: 'small' });
    boxes.push({ id: `pack-${i}-box`, x: SIDE + dx + 0.2, y: RY + dy + 0.15, z: 0.55, w: 0.45, d: 0.4, h: 0.3, color: '#c8a26b', kind: 'carton', pick: false, noShadow: true });
  });
  tile('z-qc', SIDE, RY + 5, 4.6, 3, '#e0f2fe');
  words('w-qc', SIDE, RY + 5.1, 4.6, 0.6, t('whMapQc'));
  boxes.push({ id: 'qc-1', x: SIDE + 0.8, y: RY + 6.2, w: 1, d: 1, h: 0.7, color: '#94a3b8', pick: false }, { id: 'qc-2', x: SIDE + 2.4, y: RY + 6.4, w: 0.8, d: 0.8, h: 0.5, color: '#94a3b8', pick: false });
  tile('z-charge', SIDE, RY + 8.6, 4.6, 2.6, '#f1f5f9');
  words('w-charge', SIDE, RY + 8.7, 4.6, 0.6, t('whMapCharging'));
  // A forklift, out of its charging bay and back.
  const forkMove = { path: [[-1.6, 0], [-1.6, 0], [-1.6, -3.2], [-1.6, -3.2], [-1.6, 0], [0, 0], [0, 0]], dur: 16, ease: true };
  boxes.push({ id: 'fork-body', x: SIDE + 1, y: RY + 9.7, w: 0.9, d: 1.2, h: 0.6, color: '#f59e0b', pick: false },
    { id: 'fork-mast', x: SIDE + 1.05, y: RY + 9.55, w: 0.8, d: 0.12, h: 1.5, color: '#334155', pick: false, noShadow: true },
    { id: 'fork-tine', x: SIDE + 1.15, y: RY + 9, w: 0.6, d: 0.55, h: 0.05, color: '#334155', pick: false, noShadow: true },
    { id: 'charger', x: SIDE + 3, y: RY + 9.8, w: 0.4, d: 0.4, h: 0.9, color: '#10b981', pick: false });

  // Docks along the front wall: OUT on the left (by staging), IN on the right (by receiving).
  const dockAt = (i, kind) => {
    const n = kind === 'OUT' ? docksOut : docksIn;
    const x0 = kind === 'OUT' ? 0.6 : 0.6 + half + 0.4;
    const span = kind === 'OUT' ? half : half - 0.4;
    return x0 + (i + 0.5) * span / n - 0.8;
  };
  const dock = (i, kind) => {
    const x = dockAt(i, kind);
    const job = (kind === 'IN' ? arriving : leaving)[i];
    boxes.push({ id: `dock-${kind}-${i + 1}`, x, y: dockY, z: 0, w: 1.6, d: 1.2, h: 0, color: kind === 'IN' ? '#bfdbfe' : '#fde68a', label: `${kind}-${i + 1}`, labelCls: 'dock', pick: false });
    boxes.push({ id: `bump-${kind}-${i + 1}`, x: x + 0.1, y: dockY + 1.15, w: 1.4, d: 0.1, h: 0.22, color: '#facc15', pick: false, noShadow: true });
    if (!job) return;
    boxes.push(...lorryBoxes(`lorry-${job.ref}`, x + 0.35, dockY + 1.4, { along: 'y', color: kind === 'IN' ? COLOR.inbound : COLOR.outbound, title: `${job.ref} · ${job.who}`, label: job.tag, labelCls: 'grn', lorry: job }));
    // Goods coming off, or waiting to go on, at the dock.
    // A carton going between the lorry and the dock: off it (in), onto it (out).
    boxes.push({ id: `dock-${kind}-${i + 1}-pallet`, x: x + 0.45, y: dockY + 0.2, w: 0.7, d: 0.6, h: 0.45, color: '#c8a26b', kind: 'carton', pick: false,
      anim: { path: [[0, 1.3], [0, 1.3], [0, 0], [0, 0]], dur: 5, ease: true, begin: `${i * 0.7}s` } });
  };
  for (let i = 0; i < docksOut; i++) dock(i, 'OUT');
  for (let i = 0; i < docksIn; i++) dock(i, 'IN');
  // The yard: the rest wait in marked bays.
  const queue = [...arriving.slice(docksIn).map((j) => ({ ...j, kind: 'IN' })), ...leaving.slice(docksOut).map((j) => ({ ...j, kind: 'OUT' }))];
  for (let k = 0; k < 8; k++) {
    const x = 1 + k * 2.2;
    if (x + 1.4 > W) break;
    boxes.push({ id: `bay-${k}`, x, y: dockY + 5.2, w: 0.06, d: 2.6, h: 0, color: '#facc15', pick: false });
    const job = queue[k];
    if (job) boxes.push(...lorryBoxes(`lorry-${job.ref}`, x + 0.4, dockY + 5.1, { along: 'y', color: job.kind === 'IN' ? COLOR.inbound : COLOR.outbound, title: `${job.ref} · ${job.who}`, label: job.tag, labelCls: 'grn', lorry: job }));
  }

  // Staging: what has been picked and waits to leave, a stack per finished picklist.
  picks.filter((x) => x.status === 'DONE').slice(0, 8).forEach((x, i) => {
    const lane = i % Math.max(1, docksOut);
    const bx = dockAt(lane, 'OUT') + 0.2 + Math.floor(i / docksOut) * 0.75;
    boxes.push({ id: `staged-${x.id}`, x: bx, y: ZONE_Y + 1, w: 0.6, d: 0.6, h: 0.5, color: '#c8a26b', kind: 'carton', title: x.pickNo, pick: false },
      { id: `staged-${x.id}-2`, x: bx + 0.05, y: ZONE_Y + 1.05, z: 0.5, w: 0.5, d: 0.5, h: 0.35, color: '#d6b98c', kind: 'carton', pick: false, noShadow: true });
  });

  // Pickers: where their next line is, with how far they have got.
  const cellOf = new Map(floor.cells.filter((c) => c.code).map((c) => [c.code, c]));
  const people = [];
  picks.filter((x) => x.status === 'PICKING').forEach((x, i) => {
    const next = (x.lines || []).find((l) => !lineDone(l));
    const done = (x.lines || []).filter(lineDone).length;
    const code = next?.bin ? layoutCode(next.bin) : '';
    const c = cellOf.get(code);
    // In the aisle in front of the bin; else waiting in staging.
    const px = c ? RX + c.x + 0.3 : 1 + i;
    const py = c ? RY + c.y + (Math.floor(c.y) % 2 ? 1.05 : -0.55) : ZONE_Y + 0.6;
    people.push({ id: `picker-${x.id}`, x: px, y: py, w: 0.34, d: 0.34, h: 0.55, color: '#f97316', kind: 'person',
      label: `${x.pickerName || t('whPickBy')} · ${done}/${(x.lines || []).length}`, labelCls: 'task', title: x.pickNo, pickList: x,
      // Walking up and down the aisle, looking for the next item.
      anim: { path: [[0.9, 0], [0.9, 0], [-0.7, 0], [-0.7, 0]], dur: 7, ease: true, bob: true } });
  });

  // Each slot: an orange beam, and on it cartons coloured by what they hold (none when empty).
  const cellBoxes = () => floor.cells.flatMap((c, i) => {
    const tone = cellTone(c);
    const used = c.bins.some((b) => b.product);
    const title = c.code ? `${c.code}${c.bins.filter((b) => b.product).map((b) => `\n${b.product.name} · ${formatQty(b.row?.onHand || 0)}`).join('')}` : `${c.rack}-L${c.level}-${c.slot}`;
    const cls = [demo ? 'demo' : '', mode === 'pick' && tone === COLOR.pick ? 'pulse' : ''].filter(Boolean).join(' ');
    const x = RX + c.x;
    const y = RY + c.y;
    const beam = { id: `c${i}-beam`, x, y, z: c.z, w: 1, d: 0.94, h: 0.07, color: '#f08c00', cell: c, title, noShadow: c.z > 0, cls: demo ? 'demo' : '' };
    if (!used && !demo) return [beam];
    const color = demo ? '#d6b98c' : mode === 'fill' && tone === COLOR.ok ? '#c8a26b' : tone;
    return [beam,
      { id: `c${i}`, x: x + 0.06, y: y + 0.1, z: c.z + 0.07, w: 0.5, d: 0.74, h: 0.5, color, cell: c, title, cls, kind: 'carton', noShadow: true },
      { id: `c${i}-b`, x: x + 0.58, y: y + 0.16, z: c.z + 0.07, w: 0.36, d: 0.62, h: 0.38, color: shade2(color), cell: c, title, cls, kind: 'carton', noShadow: true }];
  });
  // Steel uprights every second slot, both sides of each rack.
  const uprights = () => floor.racks.flatMap((r) => {
    const tall = Math.max(...floor.cells.filter((c) => c.rack === r.name).map((c) => c.z)) + 0.8;
    const out = [];
    const post = (k, dy, tag) => out.push({ id: `up-${r.name}-${tag}-${dy}`, x: RX + k - 0.05, y: RY + r.y + dy, w: 0.1, d: 0.1, h: tall, color: '#64748b', pick: false });
    for (let k = 0; k <= r.w; k += 2) for (const dy of [-0.02, 0.9]) post(Math.min(k, r.w), dy, k);
    if (r.w % 2) for (const dy of [-0.02, 0.9]) post(r.w, dy, 'end');
    return out;
  });
  // Yellow lines along each aisle; the rack's name painted at its head.
  const aisles = () => floor.racks.filter((_, i) => i % 2 === 1).flatMap((r) => [
    { id: `aisle-${r.name}-a`, x: RX - 0.3, y: RY + r.y + 1.12, w: RW + 0.6, d: 0.06, h: 0, color: '#facc15', pick: false },
    { id: `aisle-${r.name}-b`, x: RX - 0.3, y: RY + r.y + 2.48, w: RW + 0.6, d: 0.06, h: 0, color: '#facc15', pick: false },
  ]);
  const rackLabels = () => floor.racks.map((r) => ({ id: `rack-${r.name}`, x: RX - 1.8, y: RY + r.y, z: 0, w: 1.4, d: 0.9, h: 0, color: 'transparent', label: r.name, labelCls: 'floor', labelSize: 0.55, pick: false, noFill: true }));
  const all = () => [...boxes.filter((b) => b.h === 0), ...aisles(), ...rackLabels(), ...uprights(), ...cellBoxes(), ...boxes.filter((b) => b.h !== 0), ...people];
  const info = h('div', { class: 'card map-info' });
  let panels = true;
  const stage = h('div', { class: 'map-stage wh3d' });
  const scene = isoScene({
    boxes: all(), W, D: dockY + 9, height: 760, hint: t('whMapHint'),
    onPick: (b) => { scene.select(b.id); showInfo(b); },
    extraTools: [{ label: '▤', act: 'iso-panel', title: t('whMapTasks'), onClick: () => { panels = !panels; stage.classList.toggle('no-panels', !panels); } }],
  });

  const showInfo = (b) => {
    if (b.pickList) {
      const x = b.pickList;
      mount(info, h('h3', {}, `${x.pickerName || ''} · ${x.pickNo}`), h('p', { class: 'muted' }, `${(x.lines || []).filter(lineDone).length}/${(x.lines || []).length} ${t('whLines')}`),
        h('button', { class: 'primary', onclick: () => go('picking', x.id) }, t('whMapOpen')));
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
        const lot = soonest.get(x.product.barcode);
        return h('button', { class: 'wh-row', 'data-bin-item': x.product.barcode, onclick: () => go('stock', encodeURIComponent(x.product.barcode)) },
          h('span', { class: 'grow' }, x.product.name || x.product.barcode),
          h('b', {}, formatQty(x.row?.onHand || 0)),
          lot ? expiryPill(lot.expiry) : null,
          toPick.has(x.product.barcode) ? pill(`${t('whPicking')} ${formatQty(toPick.get(x.product.barcode))}`, 'good') : null);
      }) : h('p', { class: 'muted', style: { margin: 0 } }, demo ? t('whMapDemo') : t('whMapEmptySlot')));
  };

  const used = floor.cells.filter((c) => c.bins.some((b) => b.product)).length;
  const units = bins.reduce((s, b) => s + Math.max(0, b.row?.onHand || 0), 0);
  const soonN = bins.filter((b) => (soonest.get(b.product.barcode)?.daysLeft ?? Infinity) <= 30).length;
  const stat = (label, value, tone = '') => h('div', { class: `card stat${tone ? ` ${tone}` : ''}` }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value));
  const legend = h('div', { class: 'map-legend' });
  const chips = h('div', { class: 'wh-chips map-modes' });
  const drawMode = () => {
    mount(chips, MODES.map((m) => h('button', { class: mode === m ? 'on' : '', 'data-mode': m, onclick: () => { mode = m; drawMode(); scene.draw(all()); } }, t(`whMap_${m}`))));
    const keys = {
      fill: [['ok', 'whMapOk'], ['low', 'lowStock'], ['out', 'whOutOfStock'], ['empty', 'whMapEmpty']],
      expiry: [['out', 'whExpired'], ['soon', 'whMap30'], ['later', 'whMap90'], ['far', 'whMapLater'], ['none', 'whMapNoDate']],
      pick: [['pick', 'whMapToPick'], ['idle', 'whMapNothing']],
      activity: [['heat', 'whMapQuiet', 0], ['heat', 'whMapBusy', 4]],
    }[mode];
    mount(legend, keys.map(([k, label, i]) => h('span', {}, h('i', { style: { background: i != null ? COLOR[k][i] : COLOR[k] } }), t(label))),
      h('span', {}, h('i', { style: { background: COLOR.inbound } }), t('whMapIn')), h('span', {}, h('i', { style: { background: COLOR.outbound } }), t('whMapOut')));
  };
  drawMode();
  mount(box,
    demo ? h('div', { class: 'card map-demo' }, h('b', {}, t('whMapDemoTitle')), h('p', { class: 'muted', style: { margin: '4px 0 0' } }, t('whMapDemoHelp')),
      canMove() ? h('button', { style: { marginTop: '8px' }, onclick: () => go('stock') }, t('whStock')) : null) : null,
    h('div', { class: 'cards map-kpis' },
      stat(t('whMapBins'), `${used}/${floor.cells.length}`),
      stat(t('whMapUnits'), formatQty(units)),
      stat(t('whExpiring'), String(soonN), soonN ? 'warn' : ''),
      stat(t('whMapDocks'), `${arriving.length} ↓ · ${leaving.length} ↑`)),
    chips,
    stage,
    info,
    queue.length ? h('section', { class: 'card', 'data-card': 'yard' }, h('h3', {}, `${t('whMapYard')} (${queue.length})`),
      queue.map((j) => h('button', { class: 'wh-row', onclick: j.go }, h('span', { class: 'grow' }, h('b', {}, j.ref), ` · ${j.who}`), pill(j.kind === 'IN' ? t('whMapIn') : t('whMapOut'), j.kind === 'IN' ? 'warn' : 'good')))) : null);
  // The work going on, over the picture: tap one to go to it.
  const tasks = [
    ...picks.filter((x) => ['WAITING', 'PICKING'].includes(x.status)).flatMap((x) => {
      const l = (x.lines || []).find((y) => !lineDone(y));
      if (!l) return [];
      const c = cellOf.get(layoutCode(l.bin || ''));
      const i = c ? floor.cells.indexOf(c) : -1;
      return [{ key: `pick-${x.id}`, text: `${t('whMapTaskPick')} ${formatQty(l.qtyMilli - (l.pickedMilli || 0))} × ${l.name} → ${l.bin || '—'}${x.pickerName ? ` · ${x.pickerName}` : ''}`, focus: i >= 0 ? `c${i}-beam` : `picker-${x.id}`, tone: 'pick' }];
    }),
    ...arriving.map((j) => ({ key: `in-${j.ref}`, text: `${t('whMapTaskIn')} ${j.ref} · ${j.who}`, focus: `lorry-${j.ref}`, tone: 'in' })),
    ...leaving.map((j) => ({ key: `out-${j.ref}`, text: `${t('whMapTaskOut')} ${j.ref} → ${j.who}`, focus: `lorry-${j.ref}`, tone: 'out' })),
  ].slice(0, 6);
  mount(stage, scene.el, tasks.length ? h('div', { class: 'wh3d-tasks', 'data-card': 'tasks' }, tasks.map((x) => h('button', { class: `wh3d-task ${x.tone}`, 'data-task': x.key, onclick: () => scene.focus(x.focus) }, h('i'), x.text))) : null, legend);
  mount(info, h('p', { class: 'muted', style: { margin: 0 } }, t('whMapTap')));
}
