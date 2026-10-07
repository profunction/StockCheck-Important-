/**
 * Bringing work done offline back in, without letting it overwrite anything
 * newer. Pure (offline.test.mjs); the same file is copied to api/ for the
 * API's /v1/sync, which takes a till's offline queue.
 *
 * Stock itself is never sent as a number to overwrite: a sale or a delivery
 * is a movement added to the ledger, so two tills selling the same item
 * offline both take their sales off and neither undoes the other. What can
 * collide is an absolute value -- a product's price, a stock count -- and
 * for those the newer timestamp wins, strictly:
 *
 *   SALE, MOVEMENT   appended once (by id); a repeat is skipped
 *   PRODUCT_UPDATE   field by field, only if newer than the product online;
 *                    stock figures in it are refused (stock moves by ledger)
 *   COUNT            only if newer than the last count online for that
 *                    product and place; an older count is kept out
 *
 * The queue is applied in time order, so an item changed twice offline ends
 * as the second change.
 */

export const KINDS = ['SALE', 'MOVEMENT', 'PRODUCT_UPDATE', 'COUNT'];

/** Fields that would set stock outright; stock only moves by movements. */
export const ABSOLUTE_STOCK_FIELDS = ['stockMilli', 'onHandMilli', 'quantityMilli', 'inStock', 'stock'];

/** How far ahead of the server a till's clock may be before its times are distrusted. */
export const MAX_CLOCK_AHEAD_MS = 10 * 60 * 1000;

const asSet = (x) => (x instanceof Set ? new Set(x) : new Set(x || []));

/**
 * [offlineQueue]: [{ id, kind, at, barcode?, branchId?, data }], [at] the
 * till's time in ms. [onlineState]: { saleIds, movementIds, products:
 * { barcode: { updatedAt } }, counts: { 'barcode|branchId': lastCountAt },
 * now }.
 *
 * Returns { accepted, skipped, conflicts, state }: what to write (in order),
 * what was left out and why, the fields where online won, and the online
 * state as it stands after the accepted writes.
 */
export function mergeOfflineTransactions(offlineQueue, onlineState = {}) {
  const now = onlineState.now ?? Date.now();
  const state = {
    saleIds: asSet(onlineState.saleIds),
    movementIds: asSet(onlineState.movementIds),
    products: Object.fromEntries(Object.entries(onlineState.products || {}).map(([k, v]) => [k, { ...v }])),
    counts: { ...(onlineState.counts || {}) },
  };
  const accepted = [];
  const skipped = [];
  const conflicts = [];
  const seen = new Set();
  const skip = (op, reason) => skipped.push({ id: op?.id ?? null, kind: op?.kind ?? null, reason });

  // Strictly in time order; ties keep their place in the queue.
  const ordered = (offlineQueue || []).map((op, i) => ({ op, i }))
    .sort((a, b) => (Number(a.op?.at) || 0) - (Number(b.op?.at) || 0) || a.i - b.i)
    .map((x) => x.op);

  for (const op of ordered) {
    if (!op || !KINDS.includes(op.kind) || !op.id) { skip(op, 'INVALID'); continue; }
    if (!Number.isInteger(op.at) || op.at <= 0) { skip(op, 'NO_TIMESTAMP'); continue; }
    if (op.at > now + MAX_CLOCK_AHEAD_MS) { skip(op, 'CLOCK_AHEAD'); continue; }
    const key = `${op.kind}:${op.id}`;
    if (seen.has(key)) { skip(op, 'DUPLICATE'); continue; }
    seen.add(key);

    if (op.kind === 'SALE' || op.kind === 'MOVEMENT') {
      const ids = op.kind === 'SALE' ? state.saleIds : state.movementIds;
      if (ids.has(op.id)) { skip(op, 'ALREADY_SYNCED'); continue; }
      if (op.kind === 'MOVEMENT' && !(Number.isInteger(op.data?.quantityMilli) && op.data.quantityMilli >= 0)) { skip(op, 'BAD_QUANTITY'); continue; }
      ids.add(op.id);
      accepted.push(op);
      continue;
    }

    if (op.kind === 'PRODUCT_UPDATE') {
      const barcode = op.barcode || op.id;
      const online = state.products[barcode];
      const onlineAt = online?.updatedAt || 0;
      const fields = {};
      for (const [field, value] of Object.entries(op.data || {})) {
        if (field === 'updatedAt') continue;
        if (ABSOLUTE_STOCK_FIELDS.includes(field)) { conflicts.push({ id: op.id, barcode, field, reason: 'ABSOLUTE_STOCK' }); continue; }
        if (op.at <= onlineAt) { conflicts.push({ id: op.id, barcode, field, reason: 'ONLINE_NEWER', onlineAt, offlineAt: op.at }); continue; }
        fields[field] = value;
      }
      if (!Object.keys(fields).length) { skip(op, op.at <= onlineAt ? 'ONLINE_NEWER' : 'NOTHING_TO_APPLY'); continue; }
      state.products[barcode] = { ...(online || {}), ...fields, updatedAt: op.at };
      accepted.push({ ...op, barcode, data: { ...fields, updatedAt: op.at } });
      continue;
    }

    // COUNT
    const countKey = `${op.barcode}|${op.branchId || ''}`;
    if (!op.barcode || !(Number.isInteger(op.data?.quantityMilli) && op.data.quantityMilli >= 0)) { skip(op, 'BAD_QUANTITY'); continue; }
    if (op.at <= (state.counts[countKey] || 0)) { skip(op, 'OLDER_THAN_ONLINE_COUNT'); continue; }
    state.counts[countKey] = op.at;
    accepted.push(op);
  }
  return { accepted, skipped, conflicts, state };
}
