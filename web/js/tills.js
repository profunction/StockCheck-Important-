/**
 * The computers a company sells on. Each browser gets an id of its own,
 * kept on it, and the first time it opens the till it is numbered -- Till 1,
 * Till 2, ... -- so the counter, the receipts and the reports say which
 * machine sold what. The number can be given a name (Counter A, Kopitiam
 * front) under Settings -> This device.
 *
 * For a plan that counts tills (the POS pack: two) the first tills
 * registered are the ones allowed, and an owner frees a place by removing
 * one under Settings -> This device.
 *
 * Counted honestly rather than enforced by the database: a till is a
 * browser, and a browser can always be given another id. The plan's limit
 * is what the shop agreed to; this keeps it to that without getting in the
 * way of a till that is replaced.
 */
import { collection, db, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from './fb.js';
import { local } from './dom.js';
import { session, ws } from './session.js';
import { addStrings, t } from './i18n.js';

addStrings({
  en: {
    tillUseHere: 'This computer is this one', tillAdd: 'Add till', tillEdit: 'Change till', tillNo: 'Number', tillNoTaken: 'Another till has that number.',
    tillLastUsed: 'last used', tillNotUsed: 'no computer yet', tillsHelp2: 'Each computer picks which till it is. Add a till here, then on that computer press "This computer is this one".',
  },
  zh: {
    tillUseHere: '这台电脑用这一台', tillAdd: '新增收银机', tillEdit: '修改收银机', tillNo: '号码', tillNoTaken: '已经有收银机用这个号码。',
    tillLastUsed: '上次使用', tillNotUsed: '还没有电脑用', tillsHelp2: '每台电脑选它是哪一台收银机。先在这里「新增收银机」，再到那台电脑按「这台电脑用这一台」。',
  },
  ms: {
    tillUseHere: 'Komputer ini yang ini', tillAdd: 'Tambah kaunter', tillEdit: 'Ubah kaunter', tillNo: 'Nombor', tillNoTaken: 'Kaunter lain sudah guna nombor itu.',
    tillLastUsed: 'kali terakhir', tillNotUsed: 'belum ada komputer', tillsHelp2: 'Setiap komputer pilih kaunter mana ia. Tambah kaunter di sini, kemudian di komputer itu tekan "Komputer ini yang ini".',
  },
});

export function tillId() {
  const key = `pos.till.${session.ws}`;
  let id = local.get(key, null);
  if (!id) {
    id = newId();
    local.set(key, id);
  }
  return id;
}

export async function listTills() {
  const snap = await getDocs(collection(db, ws('tills')));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id));
}

/** This computer as a till: { id, no, name }, once registered. */
export const thisTill = { id: '', no: 0, name: '' };

/** A till's number: its own, or (registered before numbering) its place in the list. */
export const numbered = (list) => {
  let next = Math.max(0, ...list.map((x) => x.no || 0));
  return list.map((x) => ({ ...x, no: x.no || ++next }));
};

/** What a till is called: its name, or "Till 3". */
export const tillLabel = (x) => x?.name || (x?.no ? `${t('tillN')} ${x.no}` : '');

export async function registerTill() {
  const id = tillId();
  const ref = doc(db, ws(`tills/${id}`));
  const now = Date.now();
  const snap = await getDoc(ref);
  let mine;
  if (snap.exists()) {
    mine = snap.data();
    if (!mine.no) {
      // Registered before tills were numbered: it keeps the number it has always shown.
      mine.no = numbered(await listTills()).find((x) => x.id === id)?.no || 1;
      await updateDoc(ref, { no: mine.no, lastSeenAt: now, lastUid: session.uid, branchId: session.branchId });
    } else await updateDoc(ref, { lastSeenAt: now, lastUid: session.uid, branchId: session.branchId });
  } else {
    const no = Math.max(0, ...numbered(await listTills()).map((x) => x.no)) + 1;
    mine = { no, name: '', branchId: session.branchId, createdAt: now, lastSeenAt: now, lastUid: session.uid };
    await setDoc(ref, mine);
  }
  Object.assign(thisTill, { id, no: mine.no, name: mine.name || '' });
  return thisTill;
}

export async function renameTill(id, name) {
  await updateDoc(doc(db, ws(`tills/${id}`)), { name: name.trim().slice(0, 40) });
  if (id === thisTill.id) thisTill.name = name.trim().slice(0, 40);
}

export const removeTill = (id) => deleteDoc(doc(db, ws(`tills/${id}`)));

const newId = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** A till made ahead of time, with the next number; no computer is it yet. */
export async function addTill() {
  const no = Math.max(0, ...numbered(await listTills()).map((x) => x.no)) + 1;
  await setDoc(doc(db, ws(`tills/${newId()}`)), { no, name: '', branchId: session.branchId, createdAt: Date.now() });
  return no;
}

/** A till's number and name; false when another till has that number. */
export async function editTill(id, { no, name }) {
  const others = numbered(await listTills()).filter((x) => x.id !== id);
  if (others.some((x) => x.no === no)) return false;
  await updateDoc(doc(db, ws(`tills/${id}`)), { no, name: String(name || '').trim().slice(0, 40) });
  if (id === thisTill.id) Object.assign(thisTill, { no, name: String(name || '').trim().slice(0, 40) });
  return true;
}

/** This computer becomes till [id] from now on (its sales and receipts say so). */
export async function useTill(id) {
  local.set(`pos.till.${session.ws}`, id);
  return registerTill();
}

/** Whether this computer may sell under the plan's till limit. */
export async function tillAllowed() {
  // Every till is registered and numbered; only some plans count them.
  await registerTill();
  const limit = session.plan?.tills;
  if (!limit || limit >= 1e9) return true;
  const list = await listTills();
  const rank = list.findIndex((x) => x.id === tillId());
  return rank >= 0 && rank < limit;
}
