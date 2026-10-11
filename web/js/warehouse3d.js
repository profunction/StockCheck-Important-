/**
 * The warehouse in 3D (web/wh/map.js): where each shelf code stands. A
 * code is read the way warehouses write them --
 *
 *   A1-L1-30   rack A1, level 1, slot 30   (a part starting with L is the level)
 *   A-03-2     rack A, slot 3, level 2     (rack, slot, level)
 *   B-12       rack B, slot 12, level 1
 *   COLD       rack COLD, slot 1, level 1
 *
 * -- and the racks stand in rows, back to back in pairs with an aisle
 * between the pairs, like the floor of a real warehouse. No DOM here.
 */
import { compareBins } from './picking.js';

/** A shelf code's rack, level and slot. */
export function parseBin(code) {
  const parts = String(code || '').trim().toUpperCase().split(/[-\s./_]+/).filter(Boolean);
  if (!parts.length) return null;
  const num = (s) => { const m = String(s || '').match(/\d+/); return m ? Number(m[0]) : null; };
  const rack = parts[0];
  const rest = parts.slice(1);
  const lv = rest.findIndex((p) => /^L\d+$/.test(p));
  let level = 1;
  let slot = 1;
  if (lv >= 0) {
    level = num(rest[lv]);
    slot = num(rest.filter((_, i) => i !== lv)[0]) ?? 1;
  } else {
    slot = num(rest[0]) ?? 1;
    level = num(rest[1]) ?? 1;
  }
  return { code: parts.join('-'), rack, level: Math.max(1, Math.min(level, 12)), slot: Math.max(1, slot) };
}

const MAX_SLOTS = 40;

/**
 * Racks and their cells for [bins] ({ code, ...anything }): every slot
 * from 1 to the highest used (unless that is very many, then only the used
 * ones), every level up to the highest. Cells carry their bin's data or
 * none (an empty slot). Sizes in cells; [cell] = 1.
 *   { cells: [{ x, y, z, w, d, h, rack, level, slot, code, bin }], racks: [{ name, x, y, w }], W, D }
 */
export function layout(bins, { aisle = 1.6, levelH = 0.8 } = {}) {
  const byRack = new Map();
  for (const b of bins) {
    const p = parseBin(b.code);
    if (!p) continue;
    if (!byRack.has(p.rack)) byRack.set(p.rack, new Map());
    const key = `${p.level}:${p.slot}`;
    const at = byRack.get(p.rack);
    // Two spellings of one place ("A1-L1-3", "a1 l1 03") are one cell.
    if (!at.has(key)) at.set(key, { ...p, bins: [] });
    at.get(key).bins.push(b);
  }
  const names = [...byRack.keys()].sort(compareBins);
  const cells = [];
  const racks = [];
  let W = 0;
  names.forEach((name, i) => {
    const used = [...byRack.get(name).values()];
    const top = Math.max(...used.map((c) => c.level));
    const most = Math.max(...used.map((c) => c.slot));
    const slots = most <= MAX_SLOTS ? Array.from({ length: most }, (_, k) => k + 1) : [...new Set(used.map((c) => c.slot))].sort((a, b) => a - b);
    const y = Math.floor(i / 2) * (2 + aisle) + (i % 2);
    slots.forEach((slot, sx) => {
      for (let level = 1; level <= top; level++) {
        const c = byRack.get(name).get(`${level}:${slot}`);
        cells.push({ x: sx, y, z: (level - 1) * levelH, w: 0.92, d: 0.92, h: levelH * 0.86, rack: name, level, slot, code: c?.code || '', bins: c?.bins || [] });
      }
    });
    racks.push({ name, x: 0, y, w: slots.length });
    W = Math.max(W, slots.length);
  });
  const D = racks.length ? racks[racks.length - 1].y + 1 : 0;
  return { cells, racks, W, D };
}
