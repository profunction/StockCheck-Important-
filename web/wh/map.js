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
import { layout } from '../js/warehouse3d.js';
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

  // Docks in front of the racks, a lorry at each one with work.
  const here = (id) => (id || '') === (scope || '');
  const arriving = [
    ...data.pos.filter((p) => ['ORDERED', 'PARTIAL'].includes(p.status) && here(p.branchId)).map((p) => ({ ref: p.poNo, who: p.supplierName || '', go: () => go('receive', p.id) })),
    ...data.transfers.filter((tr) => tr.status === 'SENT' && here(tr.toBranch) && isMine(tr.toBranch)).map((tr) => ({ ref: tr.transferNo, who: placeName(tr.fromBranch), go: () => go('transfers', tr.id) })),
  ];
  const leaving = data.transfers.filter((tr) => ['DRAFT', 'PENDING', 'APPROVED'].includes(tr.status) && here(tr.fromBranch) && (tr.lines || []).length)
    .map((tr) => ({ ref: tr.transferNo, who: placeName(tr.toBranch), go: () => go('transfers', tr.id) }));
  const W = Math.max(floor.W, 10);
  const docksIn = Math.max(2, Math.min(4, arriving.length));
  const docksOut = Math.max(2, Math.min(4, leaving.length));
  const dockY = floor.D + 1.4;
  const boxes = [];
  const dock = (i, kind, n) => {
    const step = W / (docksIn + docksOut);
    const x = (kind === 'IN' ? i : docksIn + i) * step + (step - 1.6) / 2;
    const job = (kind === 'IN' ? arriving : leaving)[i];
    boxes.push({ id: `dock-${kind}-${n}`, x, y: dockY, z: 0, w: 1.6, d: 1.2, h: 0, color: COLOR.dock, label: `${kind}-${n}`, labelCls: 'dock', pick: false });
    // The dock's bumper, yellow, where the lorry backs up.
    boxes.push({ id: `bump-${kind}-${n}`, x: x + 0.1, y: dockY + 1.1, w: 1.4, d: 0.1, h: 0.22, color: '#facc15', pick: false, noShadow: true });
    if (!job) return;
    const color = kind === 'IN' ? COLOR.inbound : COLOR.outbound;
    boxes.push(...lorryBoxes(`lorry-${job.ref}`, x + 0.35, dockY + 1.35, { along: 'y', color, title: `${job.ref} · ${job.who}`, label: job.ref.split('-').slice(0, 2).join('-'), lorry: job }));
  };
  for (let i = 0; i < docksIn; i++) dock(i, 'IN', i + 1);
  for (let i = 0; i < docksOut; i++) dock(i, 'OUT', i + 1);
  const queue = [...arriving.slice(docksIn).map((j) => ({ ...j, kind: 'IN' })), ...leaving.slice(docksOut).map((j) => ({ ...j, kind: 'OUT' }))];

  // Each slot: an orange beam, and on it a carton coloured by what it holds (none when empty).
  const cellBoxes = () => floor.cells.flatMap((c, i) => {
    const tone = cellTone(c);
    const used = c.bins.some((b) => b.product);
    const title = c.code ? `${c.code}${c.bins.filter((b) => b.product).map((b) => `\n${b.product.name} · ${formatQty(b.row?.onHand || 0)}`).join('')}` : `${c.rack}-L${c.level}-${c.slot}`;
    const cls = [demo ? 'demo' : '', mode === 'pick' && tone === COLOR.pick ? 'pulse' : ''].filter(Boolean).join(' ');
    const beam = { id: `c${i}-beam`, x: c.x, y: c.y, z: c.z, w: 1, d: 0.94, h: 0.07, color: '#f08c00', cell: c, title, noShadow: c.z > 0, cls: demo ? 'demo' : '' };
    if (!used && !demo) return [beam];
    return [beam, { id: `c${i}`, x: c.x + 0.1, y: c.y + 0.1, z: c.z + 0.07, w: 0.8, d: 0.74, h: 0.56, color: demo ? '#d6b98c' : tone, cell: c, title, cls, kind: 'carton', noShadow: true }];
  });
  // Blue uprights every second slot, both sides of each rack.
  const uprights = () => floor.racks.flatMap((r) => {
    const tall = Math.max(...floor.cells.filter((c) => c.rack === r.name).map((c) => c.z)) + 0.8;
    const out = [];
    for (let k = 0; k <= r.w; k += 2) for (const dy of [-0.02, 0.9]) out.push({ id: `up-${r.name}-${k}-${dy}`, x: Math.min(k, r.w) - 0.05, y: r.y + dy, w: 0.1, d: 0.1, h: tall, color: '#2b59c3', pick: false });
    if (r.w % 2) for (const dy of [-0.02, 0.9]) out.push({ id: `up-${r.name}-end-${dy}`, x: r.w - 0.05, y: r.y + dy, w: 0.1, d: 0.1, h: tall, color: '#2b59c3', pick: false });
    return out;
  });
  // Yellow lines along each aisle.
  const aisles = () => floor.racks.filter((_, i) => i % 2 === 1).flatMap((r) => [
    { id: `aisle-${r.name}-a`, x: -0.3, y: r.y + 1.12, w: W + 0.6, d: 0.06, h: 0, color: '#facc15', pick: false },
    { id: `aisle-${r.name}-b`, x: -0.3, y: r.y + 2.48, w: W + 0.6, d: 0.06, h: 0, color: '#facc15', pick: false },
  ]);
  const rackLabels = () => floor.racks.map((r) => ({ id: `rack-${r.name}`, x: -1.2, y: r.y, z: 0, w: 0.9, d: 0.9, h: 0, color: '#0f766e', label: r.name, labelCls: 'rack', pick: false }));
  // Everything moved right by the width of the rack names in front of each row.
  const all = () => [...aisles(), ...rackLabels(), ...uprights(), ...cellBoxes(), ...boxes].map((b) => ({ ...b, x: b.x + 1.4 }));
  const info = h('div', { class: 'card map-info' });
  const scene = isoScene({
    boxes: all(), W: W + 1.6, D: dockY + 4.6, height: 720,
    onPick: (b) => { scene.select(b.id); showInfo(b); },
  });

  const showInfo = (b) => {
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
    h('div', { class: 'map-stage' }, scene.el, legend),
    info,
    queue.length ? h('section', { class: 'card', 'data-card': 'yard' }, h('h3', {}, `${t('whMapYard')} (${queue.length})`),
      queue.map((j) => h('button', { class: 'wh-row', onclick: j.go }, h('span', { class: 'grow' }, h('b', {}, j.ref), ` · ${j.who}`), pill(j.kind === 'IN' ? t('whMapIn') : t('whMapOut'), j.kind === 'IN' ? 'warn' : 'good')))) : null);
  mount(info, h('p', { class: 'muted', style: { margin: 0 } }, t('whMapTap')));
}
