/**
 * A small 3D (isometric) picture made of boxes, drawn as SVG: the
 * warehouse's racks, a shop's tables, the company's branches as buildings.
 * No library -- the site's rules load scripts from our own address only --
 * and an SVG stays sharp on a phone and every box can be tapped.
 *
 * World units: x to the right-back, y to the left-back, z up. A box is
 * { id, x, y, z, w, d, h, color }; h = 0 is a flat tile on the floor. A
 * box may be a [kind]: 'carton' (taped on top), 'building' (rows of
 * windows), 'glass' (a tower of glass), 'tree' (a round crown on a trunk).
 * Lit from the front left, with soft shadows on a floor slab; turns in
 * quarter turns, drags, pinches and zooms, and opens full screen.
 *
 * The geometry (project, turn, paintOrder, shade) has no DOM and is tested
 * alone (iso.test.mjs); isoScene() draws it.
 */
const C = Math.cos(Math.PI / 6);
const S = 0.5;

// A turn of less than a quarter, on top of turn()'s quarter turns: the picture
// can face any way round. Set only while one picture draws (withSpin).
let spin = null;
/** Runs [fn] with the floor turned [rad] about (cx, cy); back to none after. */
export function withSpin(rad, cx, cy, fn) {
  const was = spin;
  spin = rad ? { c: Math.cos(rad), s: Math.sin(rad), cx, cy } : null;
  try { return fn(); } finally { spin = was; }
}
const spun = (x, y) => (spin ? [spin.cx + (x - spin.cx) * spin.c - (y - spin.cy) * spin.s, spin.cy + (x - spin.cx) * spin.s + (y - spin.cy) * spin.c] : [x, y]);

/** A world point on the screen. */
export const project = (x0, y0, z = 0) => { const [x, y] = spun(x0, y0); return [(x - y) * C, (x + y) * S - z]; };

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

/** A world direction [dx, dy] after [turns] quarter turns (as turn() moves boxes). */
export function turnVector([dx, dy], turns = 0) {
  let v = [dx, dy];
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) v = [-v[1], v[0]];
  return v;
}

/** Back to front, then bottom to top: the order a painter would lay them down. */
export function paintOrder(boxes) {
  const depth = (b) => { const [x, y] = spun(b.x + (b.w || 0) / 2, b.y + (b.d || 0) / 2); return x + y; };
  return [...boxes].sort((a, b) => (a.h === 0) !== (b.h === 0) ? (a.h === 0 ? -1 : 1) : depth(a) - depth(b) || (a.z || 0) - (b.z || 0));
}

/** "#3a7" or "#33aa77" made lighter (f > 0) or darker (f < 0). */
export function shade(hex, f) {
  if (!/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(hex || ''))) return hex || '#888888';
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
const pts = (poly) => poly.map(([a, b]) => `${a.toFixed(3)},${b.toFixed(3)}`).join(' ');

/** The smallest convex outline around [points] (screen points): a box's shadow. */
export function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half([...p].reverse())];
}

/** Shared gradients and the shadow's blur, once per picture. */
function defs(uid) {
  const stop = (offset, color, opacity) => svg('stop', { offset, 'stop-color': color, 'stop-opacity': opacity });
  return svg('defs', {},
    svg('linearGradient', { id: `${uid}-top`, x1: 0, y1: 0, x2: 1, y2: 1 }, stop('0', '#fff', 0.38), stop('1', '#fff', 0.04)),
    svg('linearGradient', { id: `${uid}-left`, x1: 0, y1: 0, x2: 0, y2: 1 }, stop('0', '#fff', 0.1), stop('1', '#000', 0.12)),
    svg('linearGradient', { id: `${uid}-right`, x1: 0, y1: 0, x2: 0, y2: 1 }, stop('0', '#000', 0.12), stop('1', '#000', 0.32)),
    svg('linearGradient', { id: `${uid}-glass`, x1: 0, y1: 0, x2: 1, y2: 1 }, stop('0', '#fff', 0.55), stop('0.45', '#fff', 0.08), stop('1', '#fff', 0.3)),
    svg('radialGradient', { id: `${uid}-leaf`, cx: 0.35, cy: 0.3, r: 0.75 }, stop('0', '#86efac', 1), stop('0.6', '#22a06b', 1), stop('1', '#15803d', 1)),
    svg('filter', { id: `${uid}-soft`, x: '-20%', y: '-20%', width: '140%', height: '140%' }, svg('feGaussianBlur', { stdDeviation: 0.09 })));
}

let uids = 0;

/**
 * A picture of [boxes] on a [W] x [D] floor. Each box may carry a
 * [title] (shown on hover), [label] (written above it, on a tag), [cls]
 * (extra CSS class, e.g. 'pulse'), [kind] and [pick] (false: not
 * tappable). [onPick] gets the box tapped. Returns { el, draw(boxes, W, D), select(id) }.
 */
export function isoScene({ boxes = [], W = 10, D = 10, onPick = null, height = 560, floor = true, floorColor = null, hint = '', extraTools = [], fillHeight = false, home = null } = {}) {
  const uid = `iso${++uids}`;
  // Which way round, in degrees: quarter turns (turn()) and what is left over (withSpin).
  let angle = 0;
  let turns = 0;
  let fine = 0;
  const setAngle = (a) => {
    angle = ((a % 360) + 360) % 360;
    const q = Math.round(angle / 90);
    turns = ((q % 4) + 4) % 4;
    fine = (angle - q * 90) * Math.PI / 180;
  };
  let floorSize = { W, D };
  const spinning = (fn) => withSpin(fine, floorSize.W / 2, floorSize.D / 2, fn);
  let zoom = 1;
  let pan = [0, 0];
  let selected = null;
  let current = { boxes, W, D };
  let base = null;
  // Where each box was drawn, for focus().
  const where = new Map();
  const pic = svg('svg', { class: 'iso-svg', role: 'img', preserveAspectRatio: 'xMidYMid meet' });
  const el = document.createElement('div');
  el.className = 'iso-wrap';

  // As tall as the picture needs at this width, within the screen; on a
  // phone taller than that, and starting closer in, so things are big enough to tap.
  let homeZoom = null;
  let vbW = 10;
  const narrow = () => (pic.clientWidth || 0) < 560;
  const fit = () => {
    const w = pic.clientWidth;
    if (!w || !base) return;
    // Starting a little closer in than the whole site, so the racks and lorries read at a glance.
    const first = homeZoom == null;
    if (first) { homeZoom = w < 560 ? 1.9 : w < 900 ? 1.45 : 1.3; zoom = homeZoom; }
    if (el.classList.contains('full')) { pic.style.height = '100%'; return; }
    const screen = window.innerHeight || 800;
    // Big: most of the screen (all of it below the page's title, beside a panel).
    const most = fillHeight ? Math.max(460, screen - 120) : Math.max(Math.min(height, 900), Math.round(screen * 0.82));
    // [fillHeight]: as tall as the screen allows, beside a panel (the warehouse's command view).
    const want = narrow() ? screen * 0.68 : fillHeight ? most : Math.max(screen * 0.66, w * base.h / base.w);
    pic.style.height = `${Math.round(Math.min(most, Math.max(360, want)))}px`;
    if (first && home) spinning(homeView);
  };
  // [home] ({x, y, w, d, h} on the floor): the part to fill the picture with at the
  // start and on ⌂ -- the racks, say, rather than the whole yard round them.
  const homeView = () => {
    if (!home || !base) { zoom = homeZoom || 1; pan = [0, 0]; return; }
    const r = turn(home, current.W, current.D, turns).box;
    const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.d], [r.x + r.w, r.y + r.d]]
      .flatMap(([a, c]) => [project(a, c, 0), project(a, c, home.h || 0)]);
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const shape = (pic.clientWidth && pic.clientHeight) ? pic.clientWidth / pic.clientHeight : base.w / base.h;
    const bw = Math.max(base.w, base.h * shape);
    const bh = bw / shape;
    zoom = Math.max(1, Math.min(4, bw / ((Math.max(...xs) - Math.min(...xs)) * 1.08), bh / ((Math.max(...ys) - Math.min(...ys)) * 1.08)));
    pan = [(Math.max(...xs) + Math.min(...xs)) / 2 - (base.x + base.w / 2), (Math.max(...ys) + Math.min(...ys)) / 2 - (base.y + base.h / 2)];
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => view()).observe(pic);
  const view = () => {
    if (!base) return;
    fit();
    // The picture's shape follows the box it is in, so zooming fills it.
    const box = (pic.clientWidth && pic.clientHeight) ? pic.clientWidth / pic.clientHeight : base.w / base.h;
    const bw = Math.max(base.w, base.h * box);
    const bh = bw / box;
    const w = bw / zoom;
    const h = bh / zoom;
    vbW = w;
    pic.setAttribute('viewBox', `${(base.x + base.w / 2 - w / 2 + pan[0]).toFixed(3)} ${(base.y + base.h / 2 - h / 2 + pan[1]).toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}`);
  };

  const shadowOf = (b) => {
    const z = b.z || 0;
    // Only what stands on the floor throws a shadow there, away from the light.
    if (!b.h || z > 0.05 || b.noShadow) return null;
    const lift = Math.min(b.h, 3) * 0.32;
    const X = b.x + (b.w || 0);
    const Y = b.y + (b.d || 0);
    const foot = [[b.x, b.y], [X, b.y], [X, Y], [b.x, Y]];
    const cast = foot.map(([x, y]) => [x + lift, y - lift * 0.35]);
    return hull([...foot, ...cast].map(([x, y]) => project(x, y, 0)));
  };

  const decorate = (b, f, color) => {
    const out = [];
    const t = (b.z || 0) + (b.h || 0);
    const X = b.x + (b.w || 0);
    const Y = b.y + (b.d || 0);
    if (b.kind === 'carton' && b.h) {
      // Packing tape across the top.
      const [a, c] = [project(b.x + b.w / 2, b.y, t), project(b.x + b.w / 2, Y, t)];
      out.push(svg('line', { x1: a[0], y1: a[1], x2: c[0], y2: c[1], stroke: shade(color, -0.3), 'stroke-width': 0.05, 'stroke-opacity': 0.55 }));
    }
    if (b.kind === 'person') {
      // A head on the shoulders, and a cap in the shirt's colour.
      const [hx, hy] = project(b.x + b.w / 2, b.y + b.d / 2, t + 0.16);
      out.push(svg('circle', { cx: hx, cy: hy, r: 0.15, fill: '#f1c6a0', stroke: '#b9835c', 'stroke-width': 0.015 }),
        svg('ellipse', { cx: hx, cy: hy - 0.08, rx: 0.15, ry: 0.07, fill: shade(color, -0.25) }));
    }
    if ((b.kind === 'building' || b.kind === 'glass') && b.h > 0.6) {
      // Rows of windows on both walls the viewer sees.
      const rows = Math.max(1, Math.floor(b.h / 0.45));
      const colsX = Math.max(1, Math.floor(b.w / 0.45));
      const colsY = Math.max(1, Math.floor(b.d / 0.45));
      const z0 = b.z || 0;
      const lit = b.kind === 'glass' ? '#e0f2fe' : '#fef3c7';
      for (let r = 0; r < rows; r++) {
        const za = z0 + (r + 0.28) * b.h / rows;
        const zb = z0 + (r + 0.72) * b.h / rows;
        for (let i = 0; i < colsX; i++) {
          const xa = b.x + (i + 0.22) * b.w / colsX;
          const xb = b.x + (i + 0.78) * b.w / colsX;
          out.push(svg('polygon', { class: 'iso-win', points: pts([[xa, Y, za], [xb, Y, za], [xb, Y, zb], [xa, Y, zb]].map((q) => project(...q))), fill: lit, 'fill-opacity': (r * 7 + i * 3) % 5 ? 0.55 : 0.95 }));
        }
        for (let i = 0; i < colsY; i++) {
          const ya = b.y + (i + 0.22) * b.d / colsY;
          const yb = b.y + (i + 0.78) * b.d / colsY;
          out.push(svg('polygon', { class: 'iso-win', points: pts([[X, ya, za], [X, yb, za], [X, yb, zb], [X, ya, zb]].map((q) => project(...q))), fill: lit, 'fill-opacity': (r * 5 + i * 2) % 4 ? 0.35 : 0.8 }));
        }
      }
    }
    return out;
  };

  // Movement (SVG's own animation, so it needs no script running): [anim]
  // { path: [[dx, dy], ...] world steps from where the box stands, dur
  // seconds, bob: true for walking }. Off for people who asked for less motion.
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let firstDraw = true;
  let rising = false;
  let risen = 0;
  const animate = (g, a) => {
    const add = (values, dur, begin = '0s') => g.append(svg('animateTransform', {
      attributeName: 'transform', type: 'translate', values, dur: `${dur}s`, begin, repeatCount: 'indefinite', additive: 'sum', calcMode: a.ease ? 'spline' : 'linear',
      ...(a.ease ? { keySplines: Array(values.split(';').length - 1).fill('.45 0 .55 1').join(';') } : {}),
    }));
    if (a.path?.length) {
      const pts2 = [[0, 0], ...a.path].map((v) => project(...turnVector(v, turns), 0));
      add(pts2.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(';'), a.dur || 8, a.begin || '0s');
    }
    if (a.bob) add('0,0;0,-0.06;0,0', 0.6);
  };
  // Words painted on the floor lie along the room: its axes as the screen sees them now.
  // Always reading left to right, never upside down, whichever way the picture faces.
  const floorMatrix = () => {
    const o = project(0, 0, 0);
    const ax = ([x, y]) => { const p = project(x, y, 0); return [p[0] - o[0], p[1] - o[1]]; };
    // The four floor directions on the screen: along the one pointing most to the right,
    // down the one beside it that keeps the writing the right way round (not mirrored).
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(ax);
    const i = dirs.reduce((best, v, k) => (v[0] > dirs[best][0] ? k : best), 0);
    const [a, b] = dirs[i];
    const turnsOk = (v) => a * v[1] - b * v[0] > 0;
    const [c, d] = [dirs[(i + 1) % 4], dirs[(i + 3) % 4]].find(turnsOk) || dirs[(i + 1) % 4];
    return `matrix(${a.toFixed(3)} ${b.toFixed(3)} ${c.toFixed(3)} ${d.toFixed(3)} 0 0)`;
  };
  let keepBase = false;
  const draw = (list = current.boxes, w0 = current.W, d0 = current.D) => {
    current = { boxes: list, W: w0, D: d0 };
    // Rising from the floor, once, when the picture first appears.
    rising = firstDraw && !still;
    firstDraw = false;
    risen = 0;
    const turned = list.map((b) => ({ ...turn(b, w0, d0, turns).box, src: b }));
    const { W: tw, D: td } = turn({ x: 0, y: 0 }, w0, d0, turns);
    floorSize = { W: tw, D: td };
    spinning(() => {
    const slab = { x: -0.8, y: -0.8, z: -0.35, w: tw + 1.6, d: td + 1.6, h: 0.35 };
    const shadows = [];
    const kids = [];
    const labels = [];
    where.clear();
    const rich = list.length < 1600;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    const grow = (poly) => { for (const [a, c] of poly) { minX = Math.min(minX, a); maxX = Math.max(maxX, a); minY = Math.min(minY, c); maxY = Math.max(maxY, c); } };
    // The floor: a slab with a grid of tiles on it.
    const ground = [];
    if (floor) {
      const f = faces(slab);
      [f.top, f.left, f.right].forEach(grow);
      ground.push(
        svg('polygon', { class: 'iso-slab-l', points: pts(f.left) }),
        svg('polygon', { class: 'iso-slab-r', points: pts(f.right) }),
        svg('polygon', { class: 'iso-floor', points: pts(f.top), ...(floorColor ? { style: `fill:${floorColor}` } : {}) }));
      const grid = [];
      for (let x = 0; x <= Math.ceil(tw); x++) { const a = project(x, -0.8, 0); const c = project(x, td + 0.8, 0); grid.push(`M${a[0].toFixed(2)} ${a[1].toFixed(2)}L${c[0].toFixed(2)} ${c[1].toFixed(2)}`); }
      for (let y = 0; y <= Math.ceil(td); y++) { const a = project(-0.8, y, 0); const c = project(tw + 0.8, y, 0); grid.push(`M${a[0].toFixed(2)} ${a[1].toFixed(2)}L${c[0].toFixed(2)} ${c[1].toFixed(2)}`); }
      ground.push(svg('path', { class: 'iso-grid', d: grid.join('') }));
    }
    for (const b of paintOrder(turned)) {
      const src = b.src;
      const color = src.color || '#9aa5b1';
      const tap = onPick && src.pick !== false;
      const cls = `iso-box${src.cls ? ` ${src.cls}` : ''}${src.id != null && src.id === selected ? ' on' : ''}${tap ? ' tap' : ''}`;
      if (src.kind === 'tree') {
        const [cx, cy] = project(b.x + b.w / 2, b.y + b.d / 2, (b.z || 0) + (b.h || 0.6));
        const r = Math.max(b.w, b.d) * 0.62;
        const [tx, ty] = project(b.x + b.w / 2, b.y + b.d / 2, 0);
        shadows.push(svg('ellipse', { cx: tx + 0.15, cy: ty + 0.02, rx: r * 0.9, ry: r * 0.45, class: 'iso-shadow' }));
        kids.push(svg('g', { class: cls, 'data-id': src.id ?? null },
          svg('line', { x1: tx, y1: ty, x2: cx, y2: cy + r * 0.5, stroke: '#8b5a2b', 'stroke-width': 0.09, 'stroke-linecap': 'round' }),
          svg('circle', { cx, cy, r, fill: `url(#${uid}-leaf)` })));
        grow([[cx - r, cy - r], [cx + r, cy + r]]);
        continue;
      }
      const f = faces(b);
      [f.top, f.left, f.right].filter(Boolean).forEach(grow);
      // Words painted on the floor and nothing else.
      if (src.noFill) {
        if (src.label) {
          const [lx, ly] = project(b.x + (b.w || 0) / 2, b.y + (b.d || 0) / 2, 0);
          const size = src.labelSize || 0.42;
          const flip = floorMatrix();
          labels.push(svg('g', { transform: `translate(${lx.toFixed(3)} ${ly.toFixed(3)})` },
            svg('text', { class: 'iso-floortext', transform: flip, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': size.toFixed(3) }, String(src.label))));
        }
        continue;
      }
      const sh = shadowOf(b);
      if (sh && rich) shadows.push(svg('polygon', { class: 'iso-shadow', points: pts(sh) }));
      const edge = shade(color, -0.4);
      const face = (poly, fill, overlay) => [
        svg('polygon', { points: pts(poly), fill, stroke: edge, 'stroke-width': 0.018, 'stroke-opacity': 0.45, 'stroke-linejoin': 'round' }),
        rich && overlay ? svg('polygon', { points: pts(poly), fill: `url(#${uid}-${overlay})`, 'pointer-events': 'none' }) : null,
      ];
      const g = svg('g', { class: cls, 'data-id': src.id ?? null },
        src.title ? svg('title', {}, src.title) : null,
        f.left ? face(f.left, shade(color, -0.08), src.kind === 'glass' ? 'glass' : 'left') : null,
        f.right ? face(f.right, shade(color, -0.24), 'right') : null,
        face(f.top, src.h ? shade(color, 0.1) : color, src.h ? 'top' : null),
        rich ? decorate(b, f, color) : null);
      if (tap) g.addEventListener('click', () => { if (!dragged) onPick(src); });
      if (src.anim && rich && !still) animate(g, src.anim);
      if (rising && src.h && !src.noRise && !src.anim) {
        g.classList.add('rise');
        g.style.animationDelay = `${Math.min(900, risen++ * 6)}ms`;
      }
      kids.push(g);
      if (src.id != null) where.set(src.id, project(b.x + (b.w || 0) / 2, b.y + (b.d || 0) / 2, (b.z || 0) + (b.h || 0)));
      if (src.label && src.labelCls === 'floor') {
        // Painted on the floor, along the room, like the words on a warehouse floor.
        const [lx, ly] = project(b.x + (b.w || 0) / 2, b.y + (b.d || 0) / 2, 0);
        const size = src.labelSize || 0.42;
        const flip = floorMatrix();
        labels.push(svg('g', { transform: `translate(${lx.toFixed(3)} ${ly.toFixed(3)})` },
          svg('text', { class: 'iso-floortext', transform: flip, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': size.toFixed(3) }, String(src.label))));
      } else if (src.label) {
        const [lx, ly] = project(b.x + (b.w || 0) / 2, b.y + (b.d || 0) / 2, (b.z || 0) + (b.h || 0));
        const size = src.labelCls === 'big' ? 0.42 : src.labelCls === 'small' ? 0.24 : 0.3;
        const text = String(src.label);
        const wide = Math.max(0.6, [...text].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.62), 0) * size + size * 0.9);
        const y = ly - size * 1.1;
        labels.push(svg('g', { class: `iso-tag${src.labelCls ? ` ${src.labelCls}` : ''}` },
          svg('rect', { x: (lx - wide / 2).toFixed(3), y: (y - size * 0.95).toFixed(3), width: wide.toFixed(3), height: (size * 1.45).toFixed(3), rx: (size * 0.5).toFixed(3) }),
          svg('text', { x: lx.toFixed(3), y: (y - size * 0.02).toFixed(3), 'text-anchor': 'middle', 'font-size': size.toFixed(3) }, text)));
        grow([[lx - wide / 2, y - size * 1.2]]);
      }
    }
    pic.replaceChildren(defs(uid), ...ground, svg('g', { filter: `url(#${uid}-soft)` }, shadows), ...kids, svg('g', { class: 'iso-labels' }, labels));
    const pad = 0.35;
    // The frame stays the size of the whole floor at any angle, so turning does not jump about.
    if (!base || !keepBase) {
      const was = base;
      base = Number.isFinite(minX) ? { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 } : { x: 0, y: 0, w: 10, h: 10 };
      // Drawn again (a tap, fresh figures): keep looking at the same place.
      if (was) pan = [pan[0] + was.x + was.w / 2 - (base.x + base.w / 2), pan[1] + was.y + was.h / 2 - (base.y + base.h / 2)];
    }
    view();
    });
  };

  // Drag to move, two fingers to zoom; a tap that moved a little is still a tap.
  let dragged = false;
  let start = null;
  const fingers = new Map();
  let pinch = null;
  // Right-drag (a mouse's right button) turns the picture, a quarter at a time.
  let turning = null;
  pic.addEventListener('contextmenu', (e) => e.preventDefault());
  pic.addEventListener('pointerdown', (e) => {
    // Right-drag, or shift-drag, turns it round, any way.
    if (e.button === 2 || e.shiftKey) { turning = { x: e.clientX, angle }; dragged = true; stopSpin(); return; }
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fingers.size === 2) {
      const [a, b] = [...fingers.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, zoom, twist: Math.atan2(b[1] - a[1], b[0] - a[0]), angle };
      stopSpin();
      dragged = true;
      return;
    }
    start = { x: e.clientX, y: e.clientY, pan: [...pan] };
    dragged = false;
  });
  pic.addEventListener('pointermove', (e) => {
    if (turning) {
      turnTo(turning.angle + (e.clientX - turning.x) * 0.45);
      return;
    }
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && fingers.size === 2) {
      const [a, b] = [...fingers.values()];
      setZoom(pinch.zoom * (Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d));
      // Two fingers turning: the picture turns with them.
      const tw = (Math.atan2(b[1] - a[1], b[0] - a[0]) - pinch.twist) * 180 / Math.PI;
      if (Math.abs(tw) > 4) turnTo(pinch.angle + tw);
      return;
    }
    if (!start || !base) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragged && Math.hypot(dx, dy) < 6) return;
    if (!dragged) { dragged = true; try { pic.setPointerCapture(e.pointerId); } catch { /* not every browser */ } }
    const k = vbW / (pic.clientWidth || 1);
    pan = [start.pan[0] - dx * k, start.pan[1] - dy * k];
    view();
  });
  const stop = (e) => {
    if (turning) { turning = null; setTimeout(() => { dragged = false; }, 0); return; }
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch = null;
    if (!fingers.size) { start = null; setTimeout(() => { dragged = false; }, 0); }
  };
  pic.addEventListener('pointerup', stop);
  pic.addEventListener('pointercancel', stop);
  pic.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });

  const setZoom = (z) => { zoom = Math.max(0.7, Math.min(8, z)); view(); };
  // Turning, a frame at a time so a big picture keeps up.
  let wanted = null;
  // The floor point in the middle of the picture now, so turning keeps it there.
  const middle = () => (base ? [base.x + base.w / 2 + pan[0], base.y + base.h / 2 + pan[1]] : null);
  const floorAt = ([sx, sy]) => spinning(() => {
    // Back from the screen to the floor (z = 0): undo the projection, the part turn, the quarter turns.
    let x = (sx / C + sy / S) / 2;
    let y = (sy / S - sx / C) / 2;
    if (fine) {
      const { W: fw, D: fd } = floorSize;
      const c = Math.cos(-fine); const s2 = Math.sin(-fine);
      [x, y] = [fw / 2 + (x - fw / 2) * c - (y - fd / 2) * s2, fd / 2 + (x - fw / 2) * s2 + (y - fd / 2) * c];
    }
    const sizes = [[current.W, current.D]];
    for (let i = 0; i < turns; i++) sizes.push([sizes[i][1], sizes[i][0]]);
    for (let i = turns; i > 0; i--) [x, y] = [y, sizes[i - 1][1] - x];
    return [x, y];
  });
  const screenOf = ([x, y]) => {
    const b = turn({ x, y, w: 0, d: 0 }, current.W, current.D, turns).box;
    return spinning(() => project(b.x, b.y, 0));
  };
  const turnTo = (a) => {
    wanted = a;
    if (turnTo.busy) return;
    turnTo.busy = true;
    requestAnimationFrame(() => {
      turnTo.busy = false;
      const mid = middle();
      const spot = mid ? floorAt(mid) : null;
      setAngle(wanted);
      floorSize = turn({ x: 0, y: 0 }, current.W, current.D, turns);
      floorSize = { W: floorSize.W, D: floorSize.D };
      keepBase = true;
      draw();
      keepBase = false;
      if (spot && base) {
        const [px, py] = screenOf(spot);
        pan = [px - (base.x + base.w / 2), py - (base.y + base.h / 2)];
        view();
      }
    });
  };
  const glide = (by) => {
    const from = angle;
    const t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / 260); turnTo(from + by * (1 - (1 - k) * (1 - k))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  // All the way round, slowly, until stopped (a showroom screen).
  let spinTimer = null;
  const startSpin = () => {
    el.classList.add('spinning');
    spinTimer = setInterval(() => { if (!document.hidden && el.isConnected) turnTo(angle + 1.5); else if (!el.isConnected) stopSpin(); }, 90);
  };
  const stopSpin = () => { if (spinTimer) clearInterval(spinTimer); spinTimer = null; el.classList.remove('spinning'); };
  const btn = (label, act, fn, title = act) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'iso-btn';
    b.dataset.act = act;
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.onclick = fn;
    return b;
  };
  const full = (on) => {
    el.classList.toggle('full', typeof on === 'boolean' ? on : undefined);
    document.body.classList.toggle('iso-full-open', el.classList.contains('full'));
    setTimeout(view, 30);
  };
  const tools = document.createElement('div');
  tools.className = `iso-tools${hint ? ' top' : ''}`;
  if (hint) tools.append(Object.assign(document.createElement('span'), { className: 'iso-hint', textContent: hint }));
  tools.append(
    btn('⛶', 'iso-full', full, 'Full screen'),
    btn('⟲', 'iso-left', () => { stopSpin(); glide(-30); }),
    btn('⟳', 'iso-right', () => { stopSpin(); glide(30); }),
    btn('360°', 'iso-spin', () => (spinTimer ? stopSpin() : startSpin()), 'Turn all the way round'),
    btn('+', 'iso-in', () => setZoom(zoom * 1.35)),
    btn('−', 'iso-out', () => setZoom(zoom / 1.35)),
    btn('⌂', 'iso-home', () => { spinning(homeView); view(); }),
    ...extraTools.map((x) => btn(x.label, x.act, x.onClick, x.title)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el.classList.contains('full')) full(); });
  el.append(pic, tools);
  draw();
  return {
    el,
    draw,
    full: () => full(true),
    spin: startSpin,
    select: (id) => { selected = id; draw(); },
    /** Brings box [id] to the middle, closer in. */
    focus: (id, z = 2.4) => {
      const at = where.get(id);
      if (!at || !base) return;
      zoom = Math.max(zoom, z);
      pan = [at[0] - (base.x + base.w / 2), at[1] - (base.y + base.h / 2)];
      view();
    },
  };
}
