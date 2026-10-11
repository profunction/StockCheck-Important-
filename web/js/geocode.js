/**
 * An address to a place on the map, by OpenStreetMap's Nominatim -- free,
 * one question a second at most, so each answer is kept on this device
 * and the same address is never asked twice. Malaysia first.
 */
import { local } from './dom.js';

const KEY = 'geo.cache.v1';
let last = 0;
const cache = () => local.get(KEY, {}) || {};

/** [lat, lng] for [address], or null when it cannot be found. */
export async function geocode(address) {
  const q = String(address || '').trim().replace(/\s+/g, ' ');
  if (q.length < 3) return null;
  const all = cache();
  if (q in all) return all[q];
  const wait = 1100 - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  let hit = null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=my,sg&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
    const list = res.ok ? await res.json() : [];
    if (list[0]) hit = [Number(list[0].lat), Number(list[0].lon)];
  } catch { return null; }
  // Kept even when nothing was found, so a wrong address is not asked again and again.
  local.set(KEY, { ...cache(), [q]: hit });
  return hit;
}
