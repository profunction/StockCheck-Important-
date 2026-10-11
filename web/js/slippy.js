/**
 * A street map (OpenStreetMap tiles) with markers and lines: drag, pinch,
 * wheel and buttons to zoom, tap a marker. Our own, small: the site's
 * rules load scripts from our address only, and a map needs no more than
 * square pictures laid side by side (Web Mercator, 256-pixel tiles).
 *
 * The projection and the fitting (project, unproject, fitView) have no DOM
 * and are tested alone (slippy.test.mjs); mapView() draws.
 */
const TILE = 256;
const MAX_LAT = 85.05112878;

/** [lat, lng] to world pixels at [zoom]. */
export function project(lat, lng, zoom) {
  const s = TILE * 2 ** zoom;
  const la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180;
  return [(lng + 180) / 360 * s, (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * s];
}

/** World pixels at [zoom] back to [lat, lng]. */
export function unproject(x, y, zoom) {
  const s = TILE * 2 ** zoom;
  const lng = x / s * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y / s;
  return [180 / Math.PI * Math.atan(Math.sinh(n)), lng];
}

/**
 * The centre and zoom that show every one of [points] ([lat, lng]) in a
 * [w] x [h] box with [pad] pixels to spare; Malaysia when there are none.
 */
export function fitView(points, w, h, { pad = 48, maxZoom = 16, fallback = { center: [4.2, 101.9], zoom: 6 } } = {}) {
  const pts = points.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
  if (!pts.length) return fallback;
  const lat = pts.map((p) => p[0]);
  const lng = pts.map((p) => p[1]);
  const center = [(Math.min(...lat) + Math.max(...lat)) / 2, (Math.min(...lng) + Math.max(...lng)) / 2];
  if (pts.length === 1) return { center, zoom: Math.min(maxZoom, 15) };
  for (let z = maxZoom; z > 1; z--) {
    const [x1, y1] = project(Math.max(...lat), Math.min(...lng), z);
    const [x2, y2] = project(Math.min(...lat), Math.max(...lng), z);
    if (x2 - x1 <= w - pad * 2 && y2 - y1 <= h - pad * 2) return { center, zoom: z };
  }
  return { center, zoom: 2 };
}

/** A Waze and a Google Maps link to drive to [to]: [lat, lng] or an address. */
export function navLinks(to) {
  if (Array.isArray(to) && Number.isFinite(to[0])) {
    const ll = `${to[0].toFixed(6)},${to[1].toFixed(6)}`;
    return { waze: `https://waze.com/ul?ll=${ll}&navigate=yes`, google: `https://www.google.com/maps/dir/?api=1&destination=${ll}` };
  }
  const q = encodeURIComponent(String(to || '').trim());
  return { waze: `https://waze.com/ul?q=${q}&navigate=yes`, google: `https://www.google.com/maps/dir/?api=1&destination=${q}` };
}

/** Metres between two [lat, lng]. */
export function metres(a, b) {
  const r = Math.PI / 180;
  const d = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(d));
}

// ------------------------------------------------------------------ drawing

const NS = 'http://www.w3.org/2000/svg';

/**
 * A map in a box [height] px tall. Returns { el, setMarkers(list),
 * setLines(list), fit(), onClick(fn), center(), zoomTo(latlng, z) }.
 * A marker: { id, lat, lng, label, kind ('place'|'stop'|'lorry'|'pin'), color, title, onClick }.
 * A line: { points: [[lat, lng], ...], color, dashed }.
 */
export function mapView({ height = 520, tiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' } = {}) {
  const el = document.createElement('div');
  el.className = 'sm-wrap';
  el.style.height = `${height}px`;
  const tileLayer = document.createElement('div');
  tileLayer.className = 'sm-tiles';
  const lineLayer = document.createElementNS(NS, 'svg');
  lineLayer.setAttribute('class', 'sm-lines');
  const markLayer = document.createElement('div');
  markLayer.className = 'sm-marks';
  const credit = document.createElement('a');
  credit.className = 'sm-credit';
  credit.href = 'https://www.openstreetmap.org/copyright';
  credit.target = '_blank';
  credit.rel = 'noopener';
  credit.textContent = '© OpenStreetMap';
  el.append(tileLayer, lineLayer, markLayer, credit);

  let zoom = 6;
  let centre = [4.2, 101.9];
  let markers = [];
  let lines = [];
  let clickFn = null;
  let fitted = false;
  const size = () => [el.clientWidth || 360, el.clientHeight || height];
  // The world pixel at the box's top left.
  const origin = () => { const [w, h] = size(); const [cx, cy] = project(centre[0], centre[1], zoom); return [cx - w / 2, cy - h / 2]; };
  const toScreen = (lat, lng) => { const [ox, oy] = origin(); const [x, y] = project(lat, lng, zoom); return [x - ox, y - oy]; };

  const tilesNow = new Map();
  const drawTiles = () => {
    const [w, h] = size();
    const [ox, oy] = origin();
    const n = 2 ** zoom;
    const want = new Set();
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + w) / TILE); tx++) {
      for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + h) / TILE); ty++) {
        if (ty < 0 || ty >= n) continue;
        const wx = ((tx % n) + n) % n;
        const key = `${zoom}/${tx}/${ty}`;
        want.add(key);
        let img = tilesNow.get(key);
        if (!img) {
          img = new Image(TILE, TILE);
          img.alt = '';
          img.decoding = 'async';
          img.draggable = false;
          img.className = 'sm-tile';
          // No picture (offline): an empty square, not a broken-image sign.
          img.onerror = () => { img.style.visibility = 'hidden'; };
          img.src = tiles.replace('{z}', zoom).replace('{x}', wx).replace('{y}', ty);
          tilesNow.set(key, img);
          tileLayer.append(img);
        }
        img.style.transform = `translate(${Math.round(tx * TILE - ox)}px, ${Math.round(ty * TILE - oy)}px)`;
      }
    }
    for (const [key, img] of tilesNow) if (!want.has(key)) { img.remove(); tilesNow.delete(key); }
  };

  const drawLines = () => {
    const [w, h] = size();
    lineLayer.setAttribute('width', w);
    lineLayer.setAttribute('height', h);
    lineLayer.replaceChildren(...lines.filter((l) => l.points.length > 1).map((l) => {
      const p = document.createElementNS(NS, 'polyline');
      p.setAttribute('points', l.points.map(([a, b]) => toScreen(a, b).map((v) => v.toFixed(1)).join(',')).join(' '));
      p.setAttribute('stroke', l.color || '#2f6fde');
      p.setAttribute('class', `sm-line${l.dashed ? ' dashed' : ''}`);
      return p;
    }));
  };

  const markEls = new Map();
  const drawMarkers = () => {
    const [w, h] = size();
    const keep = new Set();
    for (const m of markers) {
      if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;
      keep.add(m.id);
      let node = markEls.get(m.id);
      if (!node) {
        node = document.createElement('button');
        node.type = 'button';
        node.dataset.marker = m.id;
        markEls.set(m.id, node);
        markLayer.append(node);
      }
      node.className = `sm-mark ${m.kind || 'pin'}${m.cls ? ` ${m.cls}` : ''}`;
      node.style.setProperty('--c', m.color || '#2f6fde');
      node.title = m.title || m.label || '';
      node.replaceChildren(...[m.icon ? Object.assign(document.createElement('span'), { className: 'sm-ic', textContent: m.icon }) : null,
        m.label ? Object.assign(document.createElement('span'), { className: 'sm-label', textContent: m.label }) : null].filter(Boolean));
      node.onclick = (e) => { e.stopPropagation(); if (!moved) m.onClick?.(m); };
      const [x, y] = toScreen(m.lat, m.lng);
      node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      node.hidden = x < -80 || y < -80 || x > w + 80 || y > h + 80;
    }
    for (const [id, node] of markEls) if (!keep.has(id)) { node.remove(); markEls.delete(id); }
  };

  const draw = () => { drawTiles(); drawLines(); drawMarkers(); };
  const setZoom = (z, at = null) => {
    const nz = Math.max(3, Math.min(18, Math.round(z)));
    if (nz === zoom) return;
    // Zoom about the point under the finger: it stays where it was.
    if (at) {
      const [ox, oy] = origin();
      const ll = unproject(ox + at[0], oy + at[1], zoom);
      const [w, h] = size();
      const [px, py] = project(ll[0], ll[1], nz);
      centre = unproject(px - at[0] + w / 2, py - at[1] + h / 2, nz);
    }
    zoom = nz;
    draw();
  };
  const fit = () => {
    const [w, h] = size();
    const v = fitView(markers.map((m) => [m.lat, m.lng]), w, h);
    centre = v.center;
    zoom = v.zoom;
    draw();
  };

  // Drag to move, two fingers or the wheel to zoom.
  let moved = false;
  let start = null;
  const fingers = new Map();
  let pinch = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.sm-tools, .sm-credit')) return;
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fingers.size === 2) { const [a, b] = [...fingers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, zoom }; moved = true; return; }
    const [cx, cy] = project(centre[0], centre[1], zoom);
    start = { x: e.clientX, y: e.clientY, cx, cy };
    moved = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && fingers.size === 2) {
      const [a, b] = [...fingers.values()];
      setZoom(pinch.zoom + Math.log2(Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d));
      return;
    }
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    if (!moved) { moved = true; try { el.setPointerCapture(e.pointerId); } catch { /* not every browser */ } }
    centre = unproject(start.cx - dx, start.cy - dy, zoom);
    draw();
  });
  const end = (e) => {
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch = null;
    if (!fingers.size) {
      if (start && !moved && clickFn && !e.target.closest('.sm-mark, .sm-tools')) {
        const r = el.getBoundingClientRect();
        const [ox, oy] = origin();
        clickFn(unproject(ox + e.clientX - r.left, oy + e.clientY - r.top, zoom));
      }
      start = null;
      setTimeout(() => { moved = false; }, 0);
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    setZoom(zoom + (e.deltaY < 0 ? 1 : -1), [e.clientX - r.left, e.clientY - r.top]);
  }, { passive: false });

  const tools = document.createElement('div');
  tools.className = 'sm-tools';
  for (const [label, act, fn] of [['+', 'sm-in', () => setZoom(zoom + 1)], ['−', 'sm-out', () => setZoom(zoom - 1)], ['⌖', 'sm-fit', fit]]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'iso-btn';
    b.dataset.act = act;
    b.textContent = label;
    b.onclick = fn;
    tools.append(b);
  }
  el.append(tools);
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (!fitted && markers.length && el.clientWidth) { fitted = true; fit(); } else draw(); }).observe(el);

  return {
    el,
    setMarkers: (list) => { markers = list; if (!fitted && el.clientWidth && list.length) { fitted = true; fit(); } else draw(); },
    setLines: (list) => { lines = list; drawLines(); },
    fit,
    onClick: (fn) => { clickFn = fn; },
    center: () => [...centre],
    zoomTo: (ll, z = 16) => { centre = ll; zoom = z; draw(); },
  };
}
