/**
 * Reading what stock levels are built from -- finished counts, their lines,
 * and the movements since -- for the till's back office and the warehouse
 * system alike. The arithmetic itself is ledger.js.
 */
import { collection, db, getDocs, limit, orderBy, query, where } from './fb.js';
import { levels as ledgerLevels, merge } from './ledger.js';
import { session, ws } from './session.js';

const FINISHED = ['COMPLETED', 'REVIEWED', 'LOCKED'];
/** How far back movements are read; older ones are behind any recent count. */
export const HISTORY_DAYS = 400;

/** A branch account's queries name its branches (and "", the shared ones). */
export const branchQuery = (col, field = 'branchId') => (session.branchIds.length
  ? query(col, where(field, 'in', [...session.branchIds, ''].slice(0, 30)))
  : col);

/** Finished counts with their lines, and the movements of the last HISTORY_DAYS. */
export async function loadStockData() {
  const checksCol = collection(db, ws('stockChecks'));
  let checkQueries;
  if (!session.can('VIEW_ALL_HISTORY')) checkQueries = [query(checksCol, where('createdByUid', '==', session.uid))];
  else if (!session.branchIds.length) checkQueries = [query(checksCol, orderBy('createdAt', 'desc'), limit(1000))];
  else {
    checkQueries = [query(checksCol, where('branchId', 'in', [...session.branchIds, ''].slice(0, 10))),
      query(checksCol, where('createdByUid', '==', session.uid))];
  }
  const checkSnaps = await Promise.all(checkQueries.map((q) => getDocs(q)));
  const checks = [...new Map(checkSnaps.flatMap((s) => s.docs).map((d) => [d.id, { ...d.data(), id: d.id }])).values()]
    .filter((c) => FINISHED.includes(c.status));
  const items = new Map(await Promise.all(checks.map(async (c) => [c.id, (await getDocs(collection(db, ws(`stockChecks/${c.id}/items`)))).docs.map((d) => d.data())])));

  const since = Date.now() - HISTORY_DAYS * 24 * 3600 * 1000;
  const moveCol = collection(db, ws('movements'));
  const moves = (await getDocs(session.branchIds.length ? branchQuery(moveCol) : query(moveCol, where('at', '>=', since))))
    .docs.map((d) => ({ ...d.data(), id: d.id })).filter((m) => m.at >= since);
  return { checks, items, moves };
}

/** Every branch id that has a count or a movement. */
export const branchesIn = (data) => [...new Set([...data.checks.map((c) => c.branchId || ''), ...data.moves.map((m) => m.branchId || '')])];

/** Levels for one branch, or every branch added up when [branch] is 'ALL'. */
export function levelsFor(data, branch, catalogue = new Map(session.products.map((p) => [p.barcode, p]))) {
  const ids = branch === 'ALL' ? branchesIn(data) : [branch];
  const per = ids.map((b) => ledgerLevels(
    data.checks.filter((c) => (c.branchId || '') === b), (c) => data.items.get(c.id) || [],
    data.moves.filter((m) => (m.branchId || '') === b), catalogue));
  return per.length === 1 ? per[0] : merge(per);
}
