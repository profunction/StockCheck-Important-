/**
 * The computers a company sells on, for a plan that counts tills (the POS
 * pack: two). Each browser gets an id of its own, kept on it; the first
 * tills registered are the ones allowed, and an owner frees a place by
 * removing one under Settings -> Device.
 *
 * Counted honestly rather than enforced by the database: a till is a
 * browser, and a browser can always be given another id. The plan's limit
 * is what the shop agreed to; this keeps it to that without getting in the
 * way of a till that is replaced.
 */
import { collection, db, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from './fb.js';
import { local } from './dom.js';
import { session, ws } from './session.js';

export function tillId() {
  const key = `pos.till.${session.ws}`;
  let id = local.get(key, null);
  if (!id) {
    id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    local.set(key, id);
  }
  return id;
}

export async function listTills() {
  const snap = await getDocs(collection(db, ws('tills')));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id));
}

export async function registerTill() {
  const ref = doc(db, ws(`tills/${tillId()}`));
  const now = Date.now();
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, { lastSeenAt: now, lastUid: session.uid });
  else await setDoc(ref, { name: `${session.branchName()} · ${navigator.platform || 'PC'}`, createdAt: now, lastSeenAt: now, lastUid: session.uid });
}

export const removeTill = (id) => deleteDoc(doc(db, ws(`tills/${id}`)));

/** Whether this computer may sell under the plan's till limit. */
export async function tillAllowed() {
  const limit = session.plan?.tills;
  if (!limit || limit >= 1e9) return true;
  await registerTill();
  const list = await listTills();
  const rank = list.findIndex((x) => x.id === tillId());
  return rank >= 0 && rank < limit;
}
