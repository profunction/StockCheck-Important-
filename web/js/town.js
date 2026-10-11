/**
 * Where the company's places stand in the 3D town (city3d.js draws it): a
 * lot per place on a square-ish grid, roads between, lorries on the road.
 * No DOM here, so it is tested alone (iso.test.mjs).
 */
const LOT = 4;
const ROAD = 1.4;

/**
 * Buildings for [places] ({ id, name, kind, salesSen, valueSen }), on a
 * square-ish grid of lots with roads between, and lorries for [moving]
 * ({ from, to, ref }) on the road half-way. Heights from the figures, so
 * the busiest shop stands tallest.
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
  // Roads first: one along every row and every column of lots.
  const W = cols * pitch + ROAD;
  const D = rows * pitch + ROAD;
  for (let r = 0; r <= rows; r++) boxes.push({ id: `road-r${r}`, x: 0, y: r * pitch, w: W, d: ROAD, h: 0, color: '#5b6b7a', pick: false, road: true });
  for (let c = 0; c <= cols; c++) boxes.push({ id: `road-c${c}`, x: c * pitch, y: 0, w: ROAD, d: D, h: 0, color: '#5b6b7a', pick: false, road: true });
  places.forEach((p, i) => {
    const x0 = ROAD + (i % cols) * pitch;
    const y0 = ROAD + Math.floor(i / cols) * pitch;
    at.set(p.id, { x: x0 + LOT / 2, y: y0 + LOT / 2 });
    boxes.push({ id: `lot-${p.id}`, x: x0 + 0.15, y: y0 + 0.15, w: LOT - 0.3, d: LOT - 0.3, h: 0, color: p.kind === 'WAREHOUSE' ? '#cfd8dc' : '#b9e4c9', pick: false });
    if (p.kind === 'HOME') {
      // A customer: a small house with a roof.
      boxes[boxes.length - 1].color = '#efe3cc';
      boxes.push({ id: `b-${p.id}`, x: x0 + 1.1, y: y0 + 1.1, w: LOT - 2.2, d: LOT - 2.2, h: 0.9, color: '#d9a25f', place: p, label: p.name });
      boxes.push({ id: `roof-${p.id}`, x: x0 + 1, y: y0 + 1, z: 0.9, w: LOT - 2, d: LOT - 2, h: 0.25, color: '#b45309', place: p });
    } else if (p.kind === 'WAREHOUSE') {
      const hgt = 0.9 + 2.2 * (p.valueSen || 0) / maxValue;
      boxes.push({ id: `b-${p.id}`, x: x0 + 0.45, y: y0 + 0.7, w: LOT - 0.9, d: LOT - 1.4, h: hgt, color: '#4f7cac', place: p, label: p.name, labelCls: 'big' });
      boxes.push({ id: `roof-${p.id}`, x: x0 + 0.35, y: y0 + 0.6, z: hgt, w: LOT - 0.7, d: LOT - 1.2, h: 0.18, color: '#33506e', place: p });
    } else {
      const hgt = 1 + 4 * (p.salesSen || 0) / maxSales;
      boxes.push({ id: `b-${p.id}`, x: x0 + 0.8, y: y0 + 0.8, w: LOT - 1.6, d: LOT - 1.6, h: hgt, color: '#14a37f', place: p, label: p.name, labelCls: 'big' });
      // An awning over the shop's door.
      boxes.push({ id: `awn-${p.id}`, x: x0 + 0.8, y: y0 + LOT - 0.8, z: 0.7, w: LOT - 1.6, d: 0.35, h: 0.12, color: '#f59e0b', place: p });
    }
  });
  moving.forEach((m, i) => {
    const a = at.get(m.from || '');
    const b = at.get(m.to || '');
    if (!a || !b) return;
    // On the road beside the sender, a little way towards the receiver.
    const k = 0.35 + (i % 3) * 0.12;
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k;
    const onRow = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const roadY = Math.round((y - ROAD / 2) / pitch) * pitch + 0.15;
    const roadX = Math.round((x - ROAD / 2) / pitch) * pitch + 0.15;
    boxes.push(onRow
      ? { id: `lorry-${m.ref || i}`, x: x - 0.7, y: roadY, w: 1.4, d: 0.75, h: 0.75, color: m.color || '#2f6fde', moving: m, title: m.ref, label: m.label || null }
      : { id: `lorry-${m.ref || i}`, x: roadX, y: y - 0.7, w: 0.75, d: 1.4, h: 0.75, color: m.color || '#2f6fde', moving: m, title: m.ref, label: m.label || null });
  });
  return { boxes, W, D, at };
}

const PALETTE = ['#4fa3d9', '#e3a03c', '#d9653b', '#8b5cf6', '#14a37f', '#ec4899', '#64748b', '#0ea5e9'];

/**
 * The shop floor (POS 店面 3D). A restaurant: its tables in rows, each
 * with four chairs, amber while a bill is open on it; the kitchen at the
 * back. A shop: a shelf per category, as tall as what it sold today. Both:
 * the tills at the front, as tall as their takings.
 *   tables  [{ name, order }]          order: the open bill or null
 *   shelves [{ id, name, color, sen }]
 *   tills   [{ name, sen, receipts }]
 */
export function shopLayout({ fnb = false, tables = [], shelves = [], tills = [] }) {
  const boxes = [];
  let y = 0;
  let W = 8;
  if (fnb) {
    boxes.push({ id: 'kitchen', x: 0.5, y: 0.2, w: 5, d: 1, h: 1.1, color: '#94a3b8', label: 'kitchen', kitchen: true, pick: false });
    const cols = Math.max(2, Math.ceil(Math.sqrt(tables.length)));
    const pitch = 2.6;
    tables.forEach((tb, i) => {
      const x = 0.6 + (i % cols) * pitch;
      const ty = 2.2 + Math.floor(i / cols) * pitch;
      const busy = !!tb.order;
      boxes.push({ id: `table-${tb.name}`, x, y: ty, w: 1.3, d: 1.3, h: 0.55, color: busy ? '#f59e0b' : '#9ccfb8', label: tb.name, table: tb, cls: busy ? 'busy' : '' });
      for (const [cx, cy] of [[0.45, -0.5], [0.45, 1.45], [-0.5, 0.45], [1.45, 0.45]]) {
        boxes.push({ id: `chair-${tb.name}-${cx}-${cy}`, x: x + cx, y: ty + cy, w: 0.4, d: 0.4, h: 0.35, color: '#64748b', pick: false });
      }
    });
    W = Math.max(6, 0.6 + cols * pitch);
    y = 2.2 + Math.ceil(tables.length / cols) * pitch;
  } else {
    const top = Math.max(1, ...shelves.map((s) => s.sen || 0));
    shelves.forEach((s, i) => {
      boxes.push({ id: `shelf-${s.id}`, x: 0.6, y: 0.4 + i * 2, w: 6, d: 0.9, h: 0.6 + 2.4 * (s.sen || 0) / top, color: s.color || PALETTE[i % PALETTE.length], label: s.name, shelf: s });
    });
    W = 7.2;
    y = 0.4 + shelves.length * 2 + 0.4;
  }
  // The counter along the front, a till on it per machine that sold today.
  const topTill = Math.max(1, ...tills.map((x) => x.sen || 0));
  const list = tills.length ? tills : [{ name: 'POS', sen: 0, receipts: 0 }];
  boxes.push({ id: 'counter', x: 0.4, y: y + 0.3, w: Math.max(W - 0.8, list.length * 1.6 + 0.4), d: 0.9, h: 0.8, color: '#cbd5e1', pick: false });
  list.forEach((tl, i) => {
    boxes.push({ id: `till-${tl.name}`, x: 0.7 + i * 1.6, y: y + 0.4, z: 0.8, w: 1.1, d: 0.7, h: 0.3 + 1.4 * (tl.sen || 0) / topTill, color: '#14a37f', label: tl.name, till: tl });
  });
  W = Math.max(W, list.length * 1.6 + 1.2);
  return { boxes, W, D: y + 1.6 };
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
    boxes.push({ id: `m-${f.id}`, x, y, w: 1.6, d: 1.6, h: all - lateH, color, fig: f, label: lateH ? null : f.label });
    if (lateH) boxes.push({ id: `late-${f.id}`, x, y, z: all - lateH, w: 1.6, d: 1.6, h: lateH, color: '#e5484d', fig: f, label: f.label });
  });
  return { boxes, W: 0.6 + Math.min(3, figures.length) * 2.6, D: 0.6 + Math.ceil(figures.length / 3) * 2.8 };
}
