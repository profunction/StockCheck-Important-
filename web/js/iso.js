/**
 * A small 3D (isometric) picture made of boxes, drawn as SVG: the
 * warehouse's racks, a shop's tables, the company's branches as buildings.
 * No library -- the site's rules load scripts from our own address only --
 * and an SVG stays sharp on a phone and every box can be tapped.
 *
 * World units: x to the right-back, y to the left-back, z up. A box is
 * { id, x, y, z, w, d, h, color }; h = 0 is a flat tile on the floor. The
 * picture turns in quarter turns, drags to move, and zooms.
 *
 * The geometry (project, turn, paintOrder, shade) has no DOM and is tested
 * alone (iso.test.mjs); isoScene() draws it.
 */
const C = Math.cos(Math.PI / 6);
const S = 0.5;

/** A world point on the screen. */
export const project = (x, y, z = 0) => [(x - y) * C, (x + y) * S - z];

/**
 * [box] after [turns] quarter turns of a [W] x [D] floor, with the floor's
 * new size: { box, W, D }.
 */
export function turn(box, W, D, turns = 0) {
  let b = { ...box };
  let w = W;
  let d = D;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) {
    b = { ...b, x: d - b.y - (b.d || 0), y: b.x, w: b.d || 0, d: b.w || 0 };
    [w, d] = [d, w];
  }
  return { box: b, W: w, D: d };
}

/** Back to front, then bottom to top: the order a painter would lay them down. */
export function paintOrder(boxes) {
  const depth = (b) => b.x + (b.w || 0) / 2 + b.y + (b.d || 0) / 2;
  return [...boxes].sort((a, b) => (a.h === 0) !== (b.h === 0) ? (a.h === 0 ? -1 : 1) : depth(a) - depth(b) || (a.z || 0) - (b.z || 0));
}

/** "#3a7" or "#33aa77" made lighter (f > 0) or darker (f < 0). */
export function shade(hex, f) {
  let s = String(hex || '#888').replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s, 16);
  const ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map((c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)));
  return `#${ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`;
}

/** The three faces of a box that face the viewer, as screen polygons. */
export function faces(b) {
  const { x, y } = b;
  const z = b.z || 0;
  const t = z + (b.h || 0);
  const X = x + (b.w || 0);
  const Y = y + (b.d || 0);
  const poly = (pts) => pts.map(([px, py, pz]) => project(px, py, pz));
  return {
    top: poly([[x, y, t], [X, y, t], [X, Y, t], [x, Y, t]]),
    left: b.h ? poly([[x, Y, t], [X, Y, t], [X, Y, z], [x, Y, z]]) : null,
    right: b.h ? poly([[X, y, t], [X, Y, t], [X, Y, z], [X, y, z]]) : null,
  };
}

// ------------------------------------------------------------------ drawing

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v);
  el.append(...kids.flat().filter(Boolean));
  return el;
}
const pts = (poly) => poly.map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join(' ');

/**
 * A picture of [boxes] on a [W] x [D] floor. Each box may carry a
 * [title] (shown on hover), [label] (written above it), [cls] (extra CSS
 * class, e.g. 'pulse') and [stroke]. [onPick] gets the box tapped.
 * Returns { el, draw(boxes, W, D), select(id) }.
 */
export function isoScene({ boxes = [], W = 10, D = 10, onPick = null, height = 420, floor = true } = {}) {
  let turns = 0;
  let zoom = 1;
  let pan = [0, 0];
  let selected = null;
  let current = { boxes, W, D };
  let base = null;
  const pic = svg('svg', { class: 'iso-svg', role: 'img', preserveAspectRatio: 'xMidYMid meet' });
  pic.style.height = `${height}px`;

  // As tall as the picture needs at this width (no empty band on a phone), within limits.
  const fit = () => {
    const w = pic.clientWidth;
    if (w && base) pic.style.height = `${Math.round(Math.min(height, Math.max(240, w * base.h / base.w * 1.08)))}px`;
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(pic);
  const view = () => {
    if (!base) return;
    fit();
    const w = base.w / zoom;
    const h = base.h / zoom;
    pic.setAttribute('viewBox', `${(base.x + base.w / 2 - w / 2 + pan[0]).toFixed(2)} ${(base.y + base.h / 2 - h / 2 + pan[1]).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
  };

  const draw = (list = current.boxes, w0 = current.W, d0 = current.D) => {
    current = { boxes: list, W: w0, D: d0 };
    const turned = list.map((b) => ({ ...turn(b, w0, d0, turns).box, src: b }));
    const { W: tw, D: td } = turn({ x: 0, y: 0 }, w0, d0, turns);
    const ground = floor ? [{ x: -0.6, y: -0.6, z: -0.02, w: tw + 1.2, d: td + 1.2, h: 0, floor: true }] : [];
    const kids = [];
    const labels = [];
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const b of [...ground, ...paintOrder(turned)]) {
      const f = faces(b);
      for (const poly of [f.top, f.left, f.right].filter(Boolean)) {
        for (const [a, c] of poly) { minX = Math.min(minX, a); maxX = Math.max(maxX, a); minY = Math.min(minY, c); maxY = Math.max(maxY, c); }
      }
      if (b.floor) { kids.push(svg('polygon', { class: 'iso-floor', points: pts(f.top) })); continue; }
      const src = b.src;
      const color = src.color || '#9aa5b1';
      const g = svg('g', { class: `iso-box${src.cls ? ` ${src.cls}` : ''}${src.id != null && src.id === selected ? ' on' : ''}${onPick && src.pick !== false ? ' tap' : ''}`, 'data-id': src.id ?? null },
        src.title ? svg('title', {}, src.title) : null,
        f.left ? svg('polygon', { points: pts(f.left), fill: shade(color, -0.12) }) : null,
        f.right ? svg('polygon', { points: pts(f.right), fill: shade(color, -0.28) }) : null,
        svg('polygon', { points: pts(f.top), fill: src.h ? shade(color, 0.12) : color, ...(src.stroke ? { stroke: src.stroke, 'stroke-width': 0.04 } : {}) }));
      if (onPick && src.pick !== false) g.addEventListener('click', () => { if (!dragged) onPick(src); });
      kids.push(g);
      if (src.label) {
        const [lx, ly] = project(b.x + (b.w || 0) / 2, b.y + (b.d || 0) / 2, (b.z || 0) + (b.h || 0));
        labels.push(svg('text', { class: `iso-label${src.labelCls ? ` ${src.labelCls}` : ''}`, x: lx.toFixed(2), y: (ly - 0.18).toFixed(2), 'text-anchor': 'middle' }, src.label));
      }
    }
    pic.replaceChildren(...kids, svg('g', { class: 'iso-labels' }, labels));
    const pad = 0.8;
    base = Number.isFinite(minX) ? { x: minX - pad, y: minY - pad * 2, w: maxX - minX + pad * 2, h: maxY - minY + pad * 3 } : { x: 0, y: 0, w: 10, h: 10 };
    view();
  };

  // Drag to move; a tap that moved a little is still a tap.
  let dragged = false;
  let start = null;
  pic.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY, pan: [...pan] };
    dragged = false;
  });
  pic.addEventListener('pointermove', (e) => {
    if (!start || !base) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragged && Math.hypot(dx, dy) < 6) return;
    if (!dragged) { dragged = true; try { pic.setPointerCapture(e.pointerId); } catch { /* not every browser */ } }
    const k = base.w / zoom / (pic.clientWidth || 1);
    pan = [start.pan[0] - dx * k, start.pan[1] - dy * k];
    view();
  });
  const stop = () => { start = null; setTimeout(() => { dragged = false; }, 0); };
  pic.addEventListener('pointerup', stop);
  pic.addEventListener('pointercancel', stop);
  pic.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });

  const setZoom = (z) => { zoom = Math.max(0.6, Math.min(6, z)); view(); };
  const btn = (label, act, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'iso-btn';
    b.dataset.act = act;
    b.textContent = label;
    b.setAttribute('aria-label', act);
    b.onclick = fn;
    return b;
  };
  const tools = document.createElement('div');
  tools.className = 'iso-tools';
  tools.append(
    btn('⟲', 'iso-left', () => { turns = (turns + 3) % 4; pan = [0, 0]; draw(); }),
    btn('⟳', 'iso-right', () => { turns = (turns + 1) % 4; pan = [0, 0]; draw(); }),
    btn('+', 'iso-in', () => setZoom(zoom * 1.3)),
    btn('−', 'iso-out', () => setZoom(zoom / 1.3)),
    btn('⌂', 'iso-home', () => { zoom = 1; pan = [0, 0]; view(); }));
  const el = document.createElement('div');
  el.className = 'iso-wrap';
  el.append(pic, tools);
  draw();
  return {
    el,
    draw,
    select: (id) => { selected = id; draw(); },
  };
}
