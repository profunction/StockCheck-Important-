/**
 * Picking: walking the shelves once to collect what several orders need,
 * in the order the shelves stand. The sums behind the warehouse's Picking
 * page (web/wh/picking.js); no Firebase here, so they are tested alone.
 *
 * An order is anything waiting to leave a place: a transfer not yet sent,
 * goods promised to a customer (a reservation). A picklist merges the
 * lines of the orders it covers -- one line per product, at its shelf --
 * and records what was taken off the shelf. Picking moves no stock: the
 * stock leaves when the transfer is dispatched or the reservation handed
 * over, as before.
 */

/** "A1-L1-30" into parts that sort the way a person reads them. */
function binParts(bin) {
  return String(bin || '').toUpperCase().match(/\d+|[^\d\s-]+/g) || [];
}

/** Shelf order: A1-L1-2 before A1-L1-10, B before C, no shelf last. */
export function compareBins(a, b) {
  const x = binParts(a);
  const y = binParts(b);
  if (!x.length || !y.length) return (!x.length) - (!y.length);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    // "A-03" is the start of "A-03-1": the shorter first.
    if (x[i] == null || y[i] == null) return x[i] == null ? -1 : 1;
    const nx = /^\d/.test(x[i]);
    const ny = /^\d/.test(y[i]);
    if (nx && ny && Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
    if (nx !== ny) return nx ? -1 : 1;
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/** The aisle a shelf code starts with: "A1-L1-30" is aisle A; "" when none. */
export function zoneOf(bin) {
  return (String(bin || '').trim().toUpperCase().match(/^[A-Z]+/) || [''])[0];
}

/**
 * The lines to pick for [orders] ({kind, id, ref, lines:[{barcode, name,
 * qtyMilli}]}): one per product, quantities added up, each with its shelf
 * from [binOf] and the orders that want it, in shelf order.
 */
export function pickLines(orders, binOf = () => '') {
  const byCode = new Map();
  for (const o of orders) {
    for (const l of o.lines || []) {
      if (!l.barcode || !(l.qtyMilli > 0)) continue;
      const line = byCode.get(l.barcode) || { barcode: l.barcode, name: l.name || l.barcode, bin: binOf(l.barcode) || '', qtyMilli: 0, pickedMilli: 0, short: false, refs: [] };
      line.qtyMilli += l.qtyMilli;
      if (o.ref && !line.refs.includes(o.ref)) line.refs.push(o.ref);
      byCode.set(l.barcode, line);
    }
  }
  return [...byCode.values()].sort((a, b) => compareBins(a.bin, b.bin) || a.name.localeCompare(b.name));
}

/** A line is finished when all of it is in the basket, or it is marked short. */
export const lineDone = (l) => l.short || (l.pickedMilli || 0) >= l.qtyMilli;

/** How far a picklist has got: lines and units. */
export function progress(lines = []) {
  const done = lines.filter(lineDone).length;
  return {
    done,
    total: lines.length,
    units: lines.reduce((s, l) => s + (l.qtyMilli || 0), 0),
    picked: lines.reduce((s, l) => s + Math.min(l.pickedMilli || 0, l.qtyMilli || 0), 0),
    short: lines.filter((l) => (l.pickedMilli || 0) < l.qtyMilli && l.short).length,
    complete: lines.length > 0 && done === lines.length,
  };
}

/** The next line to walk to: the first not finished, in shelf order; -1 when all are. */
export const nextIndex = (lines = []) => lines.findIndex((l) => !lineDone(l));

/**
 * A scan of [barcode] while picking [lines]: adds [step] to its line.
 *   ok    -- counted
 *   full  -- counted, and that line is now complete
 *   over  -- the line already had all it needs; nothing added
 *   wrong -- not on this picklist; nothing added
 * Changes the line in place; returns { kind, index }.
 */
export function applyScan(lines, barcode, step = 1000) {
  const index = lines.findIndex((l) => l.barcode === barcode);
  if (index < 0) return { kind: 'wrong', index };
  const l = lines[index];
  if ((l.pickedMilli || 0) >= l.qtyMilli) return { kind: 'over', index };
  l.pickedMilli = Math.min(l.qtyMilli, (l.pickedMilli || 0) + step);
  if (l.pickedMilli >= l.qtyMilli) l.short = false;
  return { kind: l.pickedMilli >= l.qtyMilli ? 'full' : 'ok', index };
}

const UNSENT = ['DRAFT', 'PENDING', 'APPROVED'];

/**
 * Orders at [branch] waiting to be picked: transfers not yet sent out of it
 * and reservations still held there, less those already on a picklist that
 * was not cancelled. Oldest first: the first in is the first out.
 */
export function ordersToPick({ transfers = [], reservations = [], picklists = [] }, branch) {
  const taken = new Set(picklists.filter((p) => p.status !== 'CANCELLED').flatMap((p) => (p.orders || []).map((o) => `${o.kind}:${o.id}`)));
  const here = (id) => (id || '') === (branch || '');
  return [
    ...transfers.filter((tr) => UNSENT.includes(tr.status) && here(tr.fromBranch) && (tr.lines || []).length)
      .map((tr) => ({ kind: 'TRANSFER', id: tr.id, ref: tr.transferNo, to: tr.toBranch ?? null, status: tr.status, at: tr.approvedAt || tr.submittedAt || tr.createdAt || 0, lines: tr.lines })),
    ...reservations.filter((r) => r.status === 'OPEN' && here(r.branchId) && (r.lines || []).length)
      .map((r) => ({ kind: 'RESERVATION', id: r.id, ref: r.reservationNo, to: r.forWhom || '', status: r.status, at: r.createdAt || 0, lines: r.lines })),
  ].filter((o) => !taken.has(`${o.kind}:${o.id}`)).sort((a, b) => a.at - b.at);
}
