/**
 * Where the company's places stand in the 3D town (city3d.js draws it): a
 * lot per place on a square-ish grid, roads between, lorries on the road.
 * No DOM here, so it is tested alone (iso.test.mjs).
 */
const LOT = 4;
const ROAD = 1.4;

/**
 * A lorry as boxes: a box trailer, a white cab with its windscreen, a dark
 * chassis and wheels, [along] 'x' or 'y' (the cab at the far end). The
 * trailer carries [id] and everything in [extra] (what a tap is about);
 * the other parts carry the same, under ids of their own.
 */
export function lorryBoxes(id, x, y, { along = 'y', color = '#2f6fde', label = null, labelCls = 'lorry', ...extra } = {}) {
  // Laid out along y, then swapped for x.
  const parts = [
    { id: `${id}-chassis`, x: 0.08, y: 0.1, z: 0.14, w: 0.74, d: 2.6, h: 0.1, color: '#1f2937' },
    // A white box trailer with a band in the lorry's colour, and the cab in that colour.
    { id, x: 0, y: 0, z: 0.24, w: 0.9, d: 1.85, h: 0.95, color: '#eef3f1', label, labelCls, main: true },
    { id: `${id}-band`, x: -0.01, y: -0.01, z: 0.26, w: 0.92, d: 1.87, h: 0.14, color },
    { id: `${id}-cab`, x: 0.04, y: 1.95, z: 0.24, w: 0.82, d: 0.72, h: 0.78, color },
    { id: `${id}-glass`, x: 0.1, y: 2.62, z: 0.58, w: 0.7, d: 0.06, h: 0.32, color: '#1e293b' },
    ...[[0.0, 0.25], [0.74, 0.25], [0.0, 1.35], [0.74, 1.35], [0.0, 2.2], [0.74, 2.2]].map(([wx, wy], i) => ({ id: `${id}-w${i}`, x: wx, y: wy, z: 0, w: 0.16, d: 0.34, h: 0.28, color: '#111827' })),
  ];
  return parts.map((p) => {
    const q = along === 'x' ? { ...p, x: x + p.y, y: y + p.x, w: p.d, d: p.w } : { ...p, x: x + p.x, y: y + p.y };
    return { ...extra, ...q, noShadow: !p.main, pick: extra.pick };
  });
}

/**
 * Buildings for [places] ({ id, name, kind, salesSen, valueSen }), on a
 * square-ish grid of lots with roads between, trees on the lots, and
 * lorries for [moving] ({ from, to, ref }) on the road part of the way.
 * Heights from the figures, so the busiest shop stands tallest.
 */
export function cityLayout(places, moving = []) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(places.length)));
  const rows = Math.max(1, Math.ceil(places.length / cols));
  const top = (k) => Math.max(1, ...places.map((p) => p[k] || 0));
  const maxSales = top('salesSen');
  const maxValue = top('valueSen');
  const at = new Map();
  const boxes = [];
  const pitch = LOT + ROAD;
  // Roads first: one along every row and every column of lots, a dashed line down the middle.
  const W = cols * pitch + ROAD;
  const D = rows * pitch + ROAD;
  for (let r = 0; r <= rows; r++) boxes.push({ id: `road-r${r}`, x: 0, y: r * pitch, w: W, d: ROAD, h: 0, color: '#4b5866', pick: false, road: true });
  for (let c = 0; c <= cols; c++) boxes.push({ id: `road-c${c}`, x: c * pitch, y: 0, w: ROAD, d: D, h: 0, color: '#4b5866', pick: false, road: true });
  for (let r = 0; r <= rows; r++) for (let x = 0.3; x + 0.6 < W; x += 1.3) boxes.push({ id: `dash-r${r}-${x.toFixed(1)}`, x, y: r * pitch + ROAD / 2 - 0.04, w: 0.6, d: 0.08, h: 0, color: '#f1f5f9', pick: false });
  for (let c = 0; c <= cols; c++) for (let y = 0.3; y + 0.6 < D; y += 1.3) boxes.push({ id: `dash-c${c}-${y.toFixed(1)}`, x: c * pitch + ROAD / 2 - 0.04, y, w: 0.08, d: 0.6, h: 0, color: '#f1f5f9', pick: false });
  places.forEach((p, i) => {
    const x0 = ROAD + (i % cols) * pitch;
    const y0 = ROAD + Math.floor(i / cols) * pitch;
    at.set(p.id, { x: x0 + LOT / 2, y: y0 + LOT / 2 });
    boxes.push({ id: `lot-${p.id}`, x: x0 + 0.12, y: y0 + 0.12, w: LOT - 0.24, d: LOT - 0.24, h: 0, color: p.kind === 'WAREHOUSE' ? '#d5dde3' : p.kind === 'HOME' ? '#efe3cc' : '#bfe6cf', pick: false });
    // Two trees on every lot.
    boxes.push({ id: `tree-${p.id}-a`, x: x0 + LOT - 0.75, y: y0 + 0.25, w: 0.5, d: 0.5, h: 0.75, kind: 'tree', pick: false });
    boxes.push({ id: `tree-${p.id}-b`, x: x0 + 0.25, y: y0 + LOT - 0.75, w: 0.5, d: 0.5, h: 0.6, kind: 'tree', pick: false });
    if (p.kind === 'HOME') {
      // A customer: a small house with a roof.
      boxes.push({ id: `b-${p.id}`, x: x0 + 1.1, y: y0 + 1.1, w: LOT - 2.2, d: LOT - 2.2, h: 0.9, color: '#e8b273', place: p, label: p.name, kind: 'building' });
      boxes.push({ id: `roof-${p.id}`, x: x0 + 1, y: y0 + 1, z: 0.9, w: LOT - 2, d: LOT - 2, h: 0.25, color: '#b45309', place: p });
    } else if (p.kind === 'WAREHOUSE') {
      const hgt = 0.9 + 2.2 * (p.valueSen || 0) / maxValue;
      boxes.push({ id: `b-${p.id}`, x: x0 + 0.45, y: y0 + 0.7, w: LOT - 0.9, d: LOT - 1.4, h: hgt, color: '#5b86b5', place: p, label: p.name, labelCls: 'big' });
      boxes.push({ id: `roof-${p.id}`, x: x0 + 0.35, y: y0 + 0.6, z: hgt, w: LOT - 0.7, d: LOT - 1.2, h: 0.16, color: '#2f4d6d', place: p });
      // Roller doors on the loading side.
      for (let k = 0; k < 2; k++) boxes.push({ id: `door-${p.id}-${k}`, x: x0 + 0.75 + k * 1.3, y: y0 + LOT - 0.72, w: 0.9, d: 0.04, h: Math.min(0.8, hgt - 0.1), color: '#cbd5e1', place: p, noShadow: true });
    } else {
      const hgt = 1 + 4 * (p.salesSen || 0) / maxSales;
      boxes.push({ id: `b-${p.id}`, x: x0 + 0.8, y: y0 + 0.8, w: LOT - 1.6, d: LOT - 1.6, h: hgt, color: '#14a37f', place: p, label: p.name, labelCls: 'big', kind: 'building' });
      // An awning over the shop's door.
      boxes.push({ id: `awn-${p.id}`, x: x0 + 0.8, y: y0 + LOT - 0.8, z: 0.75, w: LOT - 1.6, d: 0.4, h: 0.1, color: '#f59e0b', place: p, noShadow: true });
    }
  });
  // A lot nobody uses is a little park.
  for (let i = places.length; i < cols * rows; i++) {
    const x0 = ROAD + (i % cols) * pitch;
    const y0 = ROAD + Math.floor(i / cols) * pitch;
    boxes.push({ id: `park-${i}`, x: x0 + 0.12, y: y0 + 0.12, w: LOT - 0.24, d: LOT - 0.24, h: 0, color: '#a7dcb5', pick: false });
    [[0.6, 0.6, 0.9], [2.3, 0.9, 0.7], [1.2, 2.2, 1], [2.8, 2.7, 0.8], [0.5, 3, 0.6]].forEach(([tx, ty, th], k) => boxes.push({ id: `park-${i}-t${k}`, x: x0 + tx, y: y0 + ty, w: 0.6, d: 0.6, h: th, kind: 'tree', pick: false }));
  }
  moving.forEach((m, i) => {
    const a = at.get(m.from || '');
    const b = at.get(m.to || '');
    if (!a || !b) return;
    // On the road beside the sender, a little way towards the receiver.
    const k = 0.35 + (i % 3) * 0.12;
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k;
    const onRow = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const roadY = Math.round((y - ROAD / 2) / pitch) * pitch + 0.1;
    const roadX = Math.round((x - ROAD / 2) / pitch) * pitch + 0.1;
    const id = `lorry-${m.ref || i}`;
    // Driving along the road towards the receiver, and round again.
    const step = onRow ? [Math.sign(b.x - a.x) || 1, 0] : [0, Math.sign(b.y - a.y) || 1];
    const anim = { path: [[step[0] * 1.6, step[1] * 1.6], [step[0] * 1.6, step[1] * 1.6], [0, 0]], dur: 6, ease: true, begin: `${(i % 4) * 0.8}s` };
    boxes.push(...(onRow
      ? lorryBoxes(id, x - 1.35, roadY, { along: 'x', color: m.color || '#2f6fde', moving: m, title: m.ref, label: m.label || null, anim })
      : lorryBoxes(id, roadX, y - 1.35, { along: 'y', color: m.color || '#2f6fde', moving: m, title: m.ref, label: m.label || null, anim })));
  });
  return { boxes, W, D, at };
}

const PALETTE = ['#4fa3d9', '#e3a03c', '#d9653b', '#8b5cf6', '#14a37f', '#ec4899', '#64748b', '#0ea5e9'];

/**
 * The shop floor (POS 店面 3D), drawn as the shop it is -- whether or not
 * anything sold today.
 *
 * A shop: a shelf unit (gondola) per category, both sides stocked with
 * that category's products, sold-out ones a gap and low ones in amber,
 * its sign hanging over it; customers of the last half hour in the
 * aisles; the checkouts at the front, a cashier at each till that sold
 * today; the glass doors of the entrance.
 *   aisles  [{ id, name, color, sen, products: [{ name, level }] }]   level ok | low | out
 *   shoppers  how many people to show in the aisles
 *
 * A restaurant: the kitchen at the back with a cook per bill cooking, the
 * tables in rows with their chairs, coloured by how far the table has got
 * and the guests sat at them, the counter at the front with its takeaway
 * queue.
 *   tables  [{ name, state, guests, label }]   state free | ordering | eating
 *   cooking, takeaway  how many cooks, how many waiting at the counter
 *
 * Both: tills [{ name, sen, receipts }]; labels { kitchen, entrance } for
 * the floor lettering.
 */
export const TABLE_COLOR = { free: '#d6b98c', ordering: '#60a5fa', eating: '#f59e0b' };
export const STOCK_COLOR = { low: '#f59e0b', out: '#e5484d' };
const SHIRTS = ['#2f6fde', '#e3a03c', '#14a37f', '#ec4899', '#8b5cf6', '#0ea5e9', '#d9653b'];

export function shopLayout({ fnb = false, aisles = [], tables = [], tills = [], shoppers = 0, cooking = 0, takeaway = 0, labels = {} }) {
  const boxes = [];
  const person = (id, x, y, i, extra = {}) => boxes.push({ id, x, y, w: 0.34, d: 0.34, h: 0.55, color: SHIRTS[i % SHIRTS.length], kind: 'person', pick: false, ...extra });
  const tillList = tills.length ? tills : [{ name: 'POS', sen: 0, receipts: 0 }];
  let W;
  let y;
  if (fnb) {
    const cols = Math.max(3, Math.ceil(Math.sqrt(Math.max(1, tables.length) * 1.4)));
    const pitch = 2.5;
    W = Math.max(9, 1 + cols * pitch);
    // The kitchen along the back wall: the line, the stoves, the pass.
    boxes.push({ id: 'kitchen-floor', x: 0.3, y: 0.3, w: W - 0.6, d: 2.4, h: 0, color: '#d9dee3', pick: false },
      { id: 'kitchen-line', x: 0.6, y: 0.4, w: W - 1.2, d: 0.8, h: 0.95, color: '#cbd5e1', pick: false, label: labels.kitchen || null, labelCls: 'small', kitchen: true },
      { id: 'kitchen-pass', x: 0.6, y: 2.1, w: W - 1.2, d: 0.35, h: 1.0, color: '#94a3b8', pick: false, noShadow: true });
    for (let k = 0; k * 1.6 + 1.4 < W - 1; k++) boxes.push({ id: `stove-${k}`, x: 1 + k * 1.6, y: 0.5, z: 0.95, w: 0.9, d: 0.6, h: 0.08, color: '#1f2937', pick: false, noShadow: true });
    for (let k = 0; k < Math.min(3, cooking); k++) person(`cook-${k}`, 1.4 + k * 2.2, 1.5, 0, { color: '#f8fafc', anim: { path: [[0.6, 0], [0.6, 0], [0, 0]], dur: 5, ease: true, bob: true, begin: `${k * 0.7}s` } });
    tables.forEach((tb, i) => {
      const x = 0.9 + (i % cols) * pitch;
      const ty = 3.6 + Math.floor(i / cols) * pitch;
      const color = TABLE_COLOR[tb.state] || TABLE_COLOR.free;
      boxes.push({ id: `table-${tb.name}-leg`, x: x + 0.45, y: ty + 0.45, w: 0.2, d: 0.2, h: 0.7, color: '#374151', pick: false, noShadow: true },
        { id: `table-${tb.name}`, x, y: ty, z: 0.7, w: 1.1, d: 1.1, h: 0.07, color, label: tb.label || tb.name, labelCls: tb.state === 'free' ? 'small' : 'task', table: tb, cls: tb.state === 'free' ? '' : 'busy' });
      const seats = [[0.35, -0.55], [0.35, 1.25], [-0.55, 0.35], [1.25, 0.35]];
      seats.forEach(([cx, cy], k) => boxes.push({ id: `chair-${tb.name}-${k}`, x: x + cx, y: ty + cy, w: 0.4, d: 0.4, h: 0.42, color: '#7c5a3a', pick: false }));
      if (tb.state !== 'free') {
        seats.slice(0, Math.max(1, Math.min(4, tb.guests || 2))).forEach(([cx, cy], k) => person(`guest-${tb.name}-${k}`, x + cx + 0.03, ty + cy + 0.03, i + k, { z: 0.42, h: 0.42 }));
      }
    });
    y = 3.6 + Math.ceil(Math.max(1, tables.length) / cols) * pitch;
    // Plants by the walls.
    boxes.push({ id: 'plant-a', x: 0.3, y: 3, w: 0.5, d: 0.5, h: 0.9, color: '#16a34a', kind: 'tree', pick: false }, { id: 'plant-b', x: W - 0.8, y: 3, w: 0.5, d: 0.5, h: 0.9, color: '#16a34a', kind: 'tree', pick: false });
  } else {
    const GL = 6;
    const per = 12;
    const cols = aisles.length > 5 ? 2 : 1;
    const rows = Math.max(1, Math.ceil(aisles.length / cols));
    W = 1.8 + cols * (GL + 1.8);
    // The back wall and the side wall (the walls in front would hide the shop).
    boxes.push({ id: 'wall-back', x: 0, y: 0, w: W, d: 0.3, h: 1.8, color: '#cbd5e1', pick: false }, { id: 'wall-side', x: 0, y: 0, w: 0.3, d: 2.4 + rows * 2.6 + 4.6, h: 1.8, color: '#b8c4cf', pick: false });
    aisles.forEach((a, i) => {
      const x = 1.4 + (i % cols) * (GL + 1.8);
      const gy = 1.6 + Math.floor(i / cols) * 2.6;
      boxes.push({ id: `gondola-${a.id}-base`, x, y: gy, w: GL, d: 0.9, h: 0.15, color: '#475569', pick: false },
        { id: `gondola-${a.id}`, x, y: gy + 0.41, w: GL, d: 0.08, h: 1.45, color: '#e2e8f0', aisle: a, title: a.name, noShadow: true });
      for (const z of [0.6, 1.05]) boxes.push({ id: `gondola-${a.id}-p${z}`, x, y: gy, z, w: GL, d: 0.9, h: 0.04, color: '#cbd5e1', pick: false, noShadow: true });
      // Both sides stocked, level by level; a product shows as many facings as there is room for.
      const list = a.products.length ? a.products : [];
      for (let side = 0; side < 2; side++) {
        for (let lv = 0; lv < 3; lv++) {
          for (let k = 0; k < per; k++) {
            const p = list.length ? list[(side * 3 * per + lv * per + k) % list.length] : null;
            if (!p || p.level === 'out') continue;
            const color = p.level === 'low' ? STOCK_COLOR.low : (p.color || a.color || PALETTE[i % PALETTE.length]);
            boxes.push({ id: `item-${a.id}-${side}-${lv}-${k}`, x: x + 0.04 + k * (GL / per), y: gy + (side ? 0.52 : 0.06), z: [0.15, 0.64, 1.09][lv], w: GL / per - 0.08, d: 0.32, h: 0.34,
              color, aisle: a, title: `${a.name} · ${p.name}`, noShadow: true });
          }
        }
      }
      // The category's sign, hanging over the middle of its shelf.
      boxes.push({ id: `sign-${a.id}`, x: x + GL / 2 - 1.1, y: gy + 0.4, z: 2.05, w: 2.2, d: 0.1, h: 0.42, color: a.color || PALETTE[i % PALETTE.length], label: a.name, labelCls: 'small', aisle: a, noShadow: true });
    });
    y = 1.6 + rows * 2.6;
    // Customers of the last half hour, walking the aisles.
    for (let k = 0; k < Math.min(6, shoppers); k++) {
      const row = k % Math.max(1, aisles.length);
      person(`shopper-${k}`, 1.8 + (k * 1.7) % (W - 3.5), 1.6 + Math.floor(row / cols) * 2.6 + 1.35, k,
        { anim: { path: [[1.4, 0], [1.4, 0], [0, 0], [0, 0]], dur: 8 + k, ease: true, bob: true, begin: `${k * 0.9}s` } });
    }
  }
  // The front: a checkout per till (a counter, its belt and screen, and its
  // cashier if it sold today), and the glass doors of the entrance.
  const fy = y + 0.6;
  tillList.forEach((tl, i) => {
    const x = 0.9 + i * 1.9;
    boxes.push({ id: `till-${tl.name}`, x, y: fy, w: 0.8, d: 1.8, h: 0.85, color: '#e2e8f0', label: tl.name, labelCls: 'small', till: tl },
      { id: `till-${tl.name}-belt`, x: x + 0.08, y: fy + 0.1, z: 0.85, w: 0.64, d: 1.1, h: 0.03, color: '#111827', pick: false, noShadow: true },
      { id: `till-${tl.name}-screen`, x: x + 0.25, y: fy + 1.35, z: 0.85, w: 0.3, d: 0.06, h: 0.32, color: '#14a37f', pick: false, noShadow: true });
    if (tl.sen > 0) person(`cashier-${i}`, x + 0.95, fy + 1.1, i + 3, { color: '#14a37f' });
  });
  if (fnb) for (let k = 0; k < Math.min(5, takeaway); k++) person(`takeaway-${k}`, 0.9 + tillList.length * 1.9 + 0.3, fy + 0.2 + k * 0.6, k, { anim: { path: [[0, 0.05], [0, 0]], dur: 3, bob: true, begin: `${k * 0.4}s` } });
  W = Math.max(W, 1.6 + tillList.length * 1.9 + 2.4);
  const doorX = W - 3.2;
  boxes.push({ id: 'mat', x: doorX, y: fy + 1.2, w: 2.4, d: 1.2, h: 0, color: '#334155', pick: false, label: labels.entrance || null, labelCls: 'floor', labelSize: 0.32 },
    { id: 'door-a', x: doorX - 0.1, y: fy + 2.5, w: 1.1, d: 0.1, h: 1.6, color: '#bae6fd', kind: 'glass', pick: false },
    { id: 'door-b', x: doorX + 1.4, y: fy + 2.5, w: 1.1, d: 0.1, h: 1.6, color: '#bae6fd', kind: 'glass', pick: false,
      anim: { path: [[0.5, 0], [0.5, 0], [0, 0], [0, 0]], dur: 7, ease: true } });
  if (!fnb) boxes.push({ id: 'baskets', x: doorX - 1.1, y: fy + 1.4, w: 0.5, d: 0.4, h: 0.5, color: '#e5484d', pick: false });
  return { boxes, W, D: fy + 2.9 };
}

/**
 * The books as towers (Books home): one per figure ({ id, label, sen,
 * lateSen, color }), as tall as its amount against the biggest, the part
 * that is overdue stacked on top in red, a loss in red. Three to a row.
 */
export function moneyLayout(figures) {
  const top = Math.max(1, ...figures.map((f) => Math.abs(f.sen || 0)));
  const boxes = [];
  figures.forEach((f, i) => {
    const x = 0.6 + (i % 3) * 2.6;
    const y = 0.6 + Math.floor(i / 3) * 2.8;
    const all = 0.25 + 4 * Math.abs(f.sen || 0) / top;
    const late = Math.min(Math.abs(f.lateSen || 0), Math.abs(f.sen || 0));
    const lateH = f.sen ? (all - 0.25) * late / Math.abs(f.sen) : 0;
    const color = (f.sen || 0) < 0 ? '#e5484d' : f.color;
    boxes.push({ id: `plot-${f.id}`, x: x - 0.3, y: y - 0.3, w: 2.2, d: 2.2, h: 0, color: '#dfe7ec', pick: false });
    boxes.push({ id: `m-${f.id}`, x, y, w: 1.6, d: 1.6, h: all - lateH, color, fig: f, label: lateH ? null : f.label, kind: 'glass' });
    if (lateH) boxes.push({ id: `late-${f.id}`, x, y, z: all - lateH, w: 1.6, d: 1.6, h: lateH, color: '#e5484d', fig: f, label: f.label, kind: 'glass' });
  });
  return { boxes, W: 0.6 + Math.min(3, figures.length) * 2.6, D: 0.6 + Math.ceil(figures.length / 3) * 2.8 };
}
