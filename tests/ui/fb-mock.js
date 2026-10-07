// In-memory stand-in for web/js/fb.js, for driving the website in a browser
// without Google's servers. Same exports, same call shapes. A test changes
// the starting data through window.__seedPatch (see harness.mjs):
// { set: { path: data }, merge: { path: fields }, del: [path] }.
const store = new Map(); // path -> data
const listeners = new Set();
window.__store = store;

const seed = {
  'userIndex/u1': { workspaceId: 'w1' },
  // Every company gets a trial licence when it registers.
  'licences/w1': { plan: 'TRIAL', status: 'ACTIVE', expiresAt: 4102444800000, seats: 5 },
  'workspaces/w1/users/u1': { displayName: 'Jeffrey', email: 'j@x.com', roleId: 'admin', active: true, branchIds: [] },
  'workspaces/w1/meta/config': { companyName: 'Kedai Jeffrey', branches: [{ id: 'ipoh', name: 'Ipoh', active: true }] },
  'workspaces/w1/roles/admin': { name: 'Admin', permissions: [] },
  'workspaces/w1/roles/worker': { name: 'Worker', permissions: ['CREATE_STOCK_CHECK'] },
  'workspaces/w1/users/u2': { displayName: 'Ali', email: 'ali@x.com', roleId: 'worker', active: true, branchIds: ['ipoh'] },
  'workspaces/w1/pos/settings': {
    shopName: 'Kedai Jeffrey', address: 'Jalan 1, Ipoh', phone: '012-3456789', mode: 'BOTH', taxPct: 6, taxName: 'SST',
    pricesIncludeTax: false, serviceChargePct: 10, paymentMethods: ['CASH', 'QR', 'CARD', 'EWALLET'], paperWidth: 80, autoPrint: false,
    tables: ['1', '2', '3', '4', 'A1'], kitchenTicket: true,
    loyaltyEnabled: true, pointsPerRinggit: 1, pointValueSen: 1, minRedeemPoints: 100,
  },
  'workspaces/w1/customers/cust1': { name: 'Ah Seng', phone: '0123456789', points: 500, visits: 3, totalSpentSen: 12000, cardIds: ['04A2B3C4D5E6F7'] },
  'workspaces/w1/pos/suppliers': { list: [{ id: 'sup1', name: 'Nestle Sdn Bhd', phone: '03-1234' }] },
  'workspaces/w1/stockChecks/sc1': { status: 'COMPLETED', createdAt: 1000, completedAt: 1000, branchId: '', zone: '', createdByUid: 'u1' },
  'workspaces/w1/stockChecks/sc1/items/i1': { barcode: '9555012345678', productName: 'Milo 1kg', quantityMilli: 18000, unit: 'pcs' },
  'workspaces/w1/pos/categories': { list: [{ id: 'drink', name: '饮料', color: '#4fc3f7' }, { id: 'food', name: '食物', color: '#ffb74d' }] },
  'workspaces/w1/pos/modifiers': { list: [{ id: 'sugar', name: '甜度', required: true, multiple: false, options: [{ name: '正常', priceSen: 0 }, { name: '少糖', priceSen: 0 }] }, { id: 'egg', name: '加料', required: false, multiple: true, options: [{ name: '加蛋', priceSen: 150 }] }] },
  'workspaces/w1/pos/discounts': { list: [{ id: 'd10', name: '会员 10%', type: 'PCT', pct: 10, valueSen: 0 }] },
  'workspaces/w1/products/9555012345678': { name: 'Milo 1kg', priceSen: 1590, costSen: 1200, category: 'drink', unit: 'pcs', active: true, altBarcodes: ['E2801160600002054D2C5A1B'] },
  'workspaces/w1/products/8888': { name: '白糖 Sugar', priceSen: 299, unit: 'kg', active: true, category: 'food' },
  'workspaces/w1/products/2001': { name: 'Teh Tarik', priceSen: 250, category: 'drink', modifierIds: ['sugar', 'egg'], trackStock: false, active: true },
  'workspaces/w1/products/2002': { name: 'Nasi Lemak', priceSen: 600, category: 'food', trackStock: false, active: true, costSen: 250 },
  'workspaces/w1/products/7777': { name: '' , active: true },
};
const patch = window.__seedPatch || {};
for (const [k, v] of Object.entries(patch.merge || {})) seed[k] = { ...(seed[k] || {}), ...v };
for (const [k, v] of Object.entries(patch.set || {})) seed[k] = v;
for (const k of patch.del || []) delete seed[k];
for (const [k, v] of Object.entries(seed)) store.set(k, structuredClone(v));

export const auth = { currentUser: null };
export const db = { kind: 'db' };
export const storage = { kind: 'storage' };
export async function initFirebase() {}

let authCb = null;
export function onAuthStateChanged(_a, cb) {
  authCb = cb;
  setTimeout(() => cb(window.__signedOut ? null : { uid: 'u1', email: 'j@x.com' }), 0);
  return () => {};
}
export async function signInWithEmailAndPassword() { window.__signedOut = false; authCb?.({ uid: 'u1', email: 'j@x.com' }); }
export async function signOut() { window.__signedOut = true; authCb?.(null); }
export async function sendPasswordResetEmail(_a, email) { window.__resetMails.push(email); }
// Registering: taken@x.com already has an account.
export async function createUserWithEmailAndPassword(_a, email) {
  if (email === 'taken@x.com') { const e = new Error('taken'); e.code = 'auth/email-already-in-use'; throw e; }
  const user = { uid: 'new' + (++auto), email };
  window.__signedOut = false;
  auth.currentUser = user;
  authCb?.(user);
  return { user };
}
export async function deleteUser() { window.__deletedUser = (window.__deletedUser || 0) + 1; }
window.__resetMails = [];
// An admin's password at the till: j@x.com (u1, admin) with anything but "wrong".
export async function verifyAdmin(email, password) {
  if (password === 'wrong') { const e = new Error('wrong'); e.code = 'auth/wrong-password'; throw e; }
  if (email !== 'j@x.com') { const e = new Error('not admin'); e.code = 'not-admin'; throw e; }
}
// Re-entering the password: "wrong" is the wrong one.
export const EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
export async function reauthenticateWithCredential(_user, cred) {
  if (cred.password === 'wrong') { const e = new Error('wrong password'); e.code = 'auth/wrong-password'; throw e; }
  window.__reauthed = (window.__reauthed || 0) + 1;
}

const join = (parts) => parts.flat().join('/').split('/').filter(Boolean).join('/');
let auto = 0;
export function collection(_db, ...path) { return { type: 'col', path: join(path) }; }
export function doc(base, ...path) {
  if (base && base.type === 'col') return { type: 'doc', path: `${base.path}/auto${++auto}${Date.now() % 1000}`, get id() { return this.path.split('/').pop(); } };
  const p = join(path);
  return { type: 'doc', path: p, id: p.split('/').pop() };
}
export function increment(n) { return { __inc: n }; }
export function limit(n) { return { kind: 'limit', n }; }
export async function createStaffAccount(email) { const uid = 'staff' + (++auto); return { uid, undo: async () => {} }; }
const applyPatch = (old, patch) => {
  const out = { ...(old || {}) };
  for (const [k, v] of Object.entries(patch)) out[k] = v && typeof v === 'object' && '__inc' in v ? (out[k] || 0) + v.__inc : structuredClone(v);
  return out;
};
export function where(field, op, value) { return { kind: 'where', field, op, value }; }
export function orderBy(field, dir = 'asc') { return { kind: 'order', field, dir }; }
export function query(col, ...cs) { return { type: 'query', path: col.path, cs }; }

const snapDoc = (path) => ({ id: path.split('/').pop(), ref: { type: 'doc', path }, exists: () => store.has(path), data: () => structuredClone(store.get(path)) });
function run(q) {
  const path = q.path;
  const depth = path.split('/').length + 1;
  let rows = [...store.keys()].filter((k) => k.startsWith(path + '/') && k.split('/').length === depth);
  for (const c of q.cs || []) {
    if (c.kind !== 'where') continue;
    rows = rows.filter((k) => {
      const v = store.get(k)[c.field];
      switch (c.op) {
        case '==': return v === c.value;
        case '>=': return v >= c.value;
        case '<': return v < c.value;
        case '<=': return v <= c.value;
        case '>': return v > c.value;
        case 'in': return c.value.includes(v);
        default: throw new Error('op ' + c.op);
      }
    });
  }
  const order = (q.cs || []).find((c) => c.kind === 'order');
  if (order) rows.sort((a, b) => (store.get(a)[order.field] - store.get(b)[order.field]) * (order.dir === 'desc' ? -1 : 1));
  const docs = rows.map(snapDoc);
  return { docs, size: docs.length, empty: !docs.length };
}

export async function getDoc(ref) { return snapDoc(ref.path); }
export async function getDocs(q) { return run(q.type === 'col' ? { path: q.path, cs: [] } : q); }
export function onSnapshot(ref, cb) {
  const fire = () => cb(ref.type === 'doc' ? snapDoc(ref.path) : run(ref.type === 'col' ? { path: ref.path, cs: [] } : ref));
  const l = { fire };
  listeners.add(l);
  setTimeout(fire, 0);
  return () => listeners.delete(l);
}
const changed = () => setTimeout(() => listeners.forEach((l) => l.fire()), 0);
export async function setDoc(ref, data) { store.set(ref.path, structuredClone(data)); changed(); }
export async function updateDoc(ref, data) {
  if (!store.has(ref.path)) throw new Error('No document to update: ' + ref.path);
  store.set(ref.path, applyPatch(store.get(ref.path), data)); changed();
}
export async function deleteDoc(ref) { store.delete(ref.path); changed(); }
export function writeBatch() {
  const ops = [];
  return {
    set: (r, d, o) => ops.push(() => store.set(r.path, o?.merge ? applyPatch(store.get(r.path), d) : structuredClone(d))),
    update: (r, d) => ops.push(() => { if (!store.has(r.path)) throw new Error('No document to update: ' + r.path); store.set(r.path, applyPatch(store.get(r.path), d)); }),
    delete: (r) => ops.push(() => store.delete(r.path)),
    commit: async () => { ops.forEach((o) => o()); changed(); },
  };
}
export async function runTransaction(_db, fn) {
  const ops = [];
  const tx = {
    get: async (r) => snapDoc(r.path),
    set: (r, d, o) => { ops.push(() => store.set(r.path, o?.merge ? applyPatch(store.get(r.path), d) : structuredClone(d))); return tx; },
    update: (r, d) => { ops.push(() => store.set(r.path, applyPatch(store.get(r.path), d))); return tx; },
  };
  const out = await fn(tx);
  ops.forEach((o) => o());
  changed();
  return out;
}
export function ref(_s, path) { return { path }; }
export async function uploadBytes() {}
export async function getDownloadURL(r) { return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="%23f90"/></svg>'; }
