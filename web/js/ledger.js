/**
 * Stock on hand, worked out exactly as the JSOX Barcode Scan app does it
 * (StockLedger.kt and StockComparison.kt), so the website and the app never
 * show two different numbers for one shelf. Pure: tested in ledger.test.mjs.
 *
 * - The last finished count is the baseline: per area, the latest count of a
 *   product wins; areas add up.
 * - On hand = that baseline + what came in since - what went out since.
 * - Each branch is worked out on its own and added up for head office.
 */

const FINISHED = new Set(['COMPLETED', 'REVIEWED', 'LOCKED']);
const SIGN = { RECEIVE: 1, SALE: -1, REFUND: 1, WRITE_OFF: -1, TRANSFER_OUT: -1, TRANSFER_IN: 1 };

export const isFinished = (check) => FINISHED.has(check.status);
export const takenAt = (check) => check.completedAt ?? check.createdAt ?? 0;

/** Barcode, or "name:<name>" for a line with none; null for neither. */
export function productKey(item) {
  const barcode = String(item.barcode || '').trim();
  if (barcode) return barcode;
  const name = String(item.productName || '').trim().toLowerCase();
  return name ? `name:${name}` : null;
}

const counted = (item) => item.quantityMilli ?? (item.quantity || 0) * 1000;
const signed = (m) => (SIGN[m.type] || 0) * (m.quantityMilli || 0);

/** What a set of counts says was held: key -> { key, barcode, name, unit, quantity, at }. */
export function snapshot(checks, itemsOf) {
  const latest = new Map(); // area|key -> qty
  const labels = new Map();
  const sorted = [...checks].sort((a, b) => takenAt(a) - takenAt(b) || (a.createdAt || 0) - (b.createdAt || 0));
  for (const check of sorted) {
    const area = `${check.branchId || ''}\u0000${String(check.zone || '').trim().toLowerCase()}`;
    const byKey = new Map();
    for (const item of itemsOf(check)) {
      const key = productKey(item);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(item);
    }
    for (const [key, lines] of byKey) {
      latest.set(`${area}|${key}`, lines.reduce((s, l) => s + counted(l), 0));
      const line = lines[lines.length - 1];
      const prev = labels.get(key);
      labels.set(key, {
        key,
        barcode: String(line.barcode || '').trim(),
        name: String(line.productName || '').trim() || prev?.name || '',
        unit: String(line.unit || '').trim() || prev?.unit || '',
        at: Math.max(prev?.at ?? -Infinity, takenAt(check)),
      });
    }
  }
  const out = new Map();
  for (const [areaKey, qty] of latest) {
    const key = areaKey.slice(areaKey.indexOf('|') + 1);
    const holding = out.get(key) || { ...labels.get(key), quantity: 0 };
    holding.quantity += qty;
    out.set(key, holding);
  }
  return out;
}

/**
 * One branch's levels. [checks] and [movements] must already be that
 * branch's; unfinished counts are ignored.
 * catalogue: barcode -> product (for names, units and reorder levels).
 */
export function levels(checks, itemsOf, movements, catalogue = new Map()) {
  const finished = checks.filter(isFinished);
  const held = snapshot(finished, itemsOf);
  const byKey = new Map();
  for (const m of movements) {
    if (!m.barcode || !(m.type in SIGN)) continue;
    if (!byKey.has(m.barcode)) byKey.set(m.barcode, []);
    byKey.get(m.barcode).push(m);
  }
  const keys = new Set([...held.keys(), ...byKey.keys()]);
  return [...keys].map((key) => {
    const h = held.get(key);
    const moves = byKey.get(key) || [];
    const since = h ? moves.filter((m) => m.at > h.at) : moves;
    const product = catalogue.get(key);
    const last = moves.reduce((a, m) => (!a || m.at > a.at ? m : a), null);
    const inSince = since.filter((m) => signed(m) > 0).reduce((s, m) => s + signed(m), 0);
    const outSince = since.filter((m) => signed(m) < 0).reduce((s, m) => s - signed(m), 0);
    return {
      key,
      barcode: h?.barcode || product?.barcode || (key.startsWith('name:') ? '' : key),
      name: product?.name || h?.name || last?.productName || '',
      unit: h?.unit || product?.unit || '',
      counted: h ? h.quantity : null,
      countedAt: h ? h.at : null,
      inSince,
      outSince,
      onHand: (h ? h.quantity : 0) + inSince - outSince,
      reorderLevel: product?.reorderLevelMilli ?? null,
    };
  }).sort((a, b) => (a.name || a.key).toLowerCase().localeCompare((b.name || b.key).toLowerCase()));
}

/** Head office's view: every branch added up, product by product. */
export function merge(branches) {
  const out = new Map();
  for (const level of branches.flat()) {
    const m = out.get(level.key);
    if (!m) { out.set(level.key, { ...level }); continue; }
    m.name ||= level.name;
    m.counted = m.counted == null && level.counted == null ? null : (m.counted || 0) + (level.counted || 0);
    m.countedAt = Math.max(m.countedAt ?? -Infinity, level.countedAt ?? -Infinity);
    if (!Number.isFinite(m.countedAt)) m.countedAt = null;
    m.inSince += level.inSince;
    m.outSince += level.outSince;
    m.onHand += level.onHand;
  }
  return [...out.values()].sort((a, b) => (a.name || a.key).toLowerCase().localeCompare((b.name || b.key).toLowerCase()));
}

export const isLow = (level) => level.reorderLevel != null && level.onHand <= level.reorderLevel;
